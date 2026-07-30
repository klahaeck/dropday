import { NextResponse } from "next/server";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { discardArtwork, isOwnedArtworkUrl } from "@/lib/blob-artwork";
import { canUseClubManagement } from "@/lib/club-management";
import { listPastClubThemes } from "@/lib/club-theme-history";
import { getDb } from "@/lib/db";
import { integrations } from "@/lib/env";
import { getClubBySlug, getClubDrops, getClubMemberships } from "@/lib/repository";
import {
  THEME_DESCRIPTION_HTML_MAX_LENGTH,
  THEME_DESCRIPTION_MAX_LENGTH,
  sanitizeThemeDescriptionHtml,
  themeDescriptionToText,
} from "@/lib/theme-description";
import type { Club, ClubTheme } from "@/types/domain";

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  guidance: z.string().trim().max(THEME_DESCRIPTION_MAX_LENGTH),
  guidanceHtml: z.string().max(THEME_DESCRIPTION_HTML_MAX_LENGTH),
  imageUrl: z.string().url().max(1_000).nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string; version: string }> },
) {
  const { slug, version: versionParam } = await params;
  const version = Number(versionParam);
  if (!Number.isInteger(version) || version < 1) {
    return NextResponse.json({ error: "Invalid theme version." }, { status: 400 });
  }

  const { profile, features } = await requireViewer();
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid theme." }, { status: 400 });
  }
  if (parsed.data.imageUrl && !isOwnedArtworkUrl(parsed.data.imageUrl, "theme", profile.id)) {
    return NextResponse.json({ error: "This theme image does not belong to your account." }, { status: 403 });
  }
  const sanitizedGuidanceHtml = sanitizeThemeDescriptionHtml(parsed.data.guidanceHtml);
  const guidance = sanitizedGuidanceHtml ? themeDescriptionToText(sanitizedGuidanceHtml) : parsed.data.guidance;
  const guidanceHtml = guidance && sanitizedGuidanceHtml ? sanitizedGuidanceHtml : undefined;
  if (guidance.length > THEME_DESCRIPTION_MAX_LENGTH) {
    return NextResponse.json({ error: `Keep the theme description to ${THEME_DESCRIPTION_MAX_LENGTH.toLocaleString()} characters or fewer.` }, { status: 400 });
  }

  const club = await getClubBySlug(slug);
  if (!club) return NextResponse.json({ error: "Club not found." }, { status: 404 });
  const memberships = await getClubMemberships(club.id);
  const membership = memberships.find((item) => item.userId === profile.id);
  if (!canUseClubManagement(
    membership,
    features.clubAdminTools && features.clubThemes,
  )) {
    return NextResponse.json({ error: "You cannot manage this club." }, { status: 403 });
  }

  const storedSavedTheme = club.savedThemes?.find((theme) => theme.version === version);
  const storedPastTheme = club.themeHistory?.find((theme) => theme.version === version);
  let existingTheme = club.currentTheme?.version === version ? club.currentTheme : storedSavedTheme ?? storedPastTheme;
  if (!existingTheme) {
    const drops = await getClubDrops(club.id);
    existingTheme = listPastClubThemes(club, drops).find((theme) => theme.version === version);
  }
  if (!existingTheme) return NextResponse.json({ error: "Theme not found." }, { status: 404 });

  const uploadedArtwork = typeof parsed.data.imageUrl === "string" && parsed.data.imageUrl !== existingTheme.imageUrl
    ? parsed.data.imageUrl
    : undefined;
  if (!integrations.mongo) {
    await discardArtwork(uploadedArtwork);
    return NextResponse.json({ demo: true, version });
  }

  const timestamp = new Date().toISOString();
  const imageUrl = parsed.data.imageUrl === undefined ? existingTheme.imageUrl : parsed.data.imageUrl ?? undefined;
  const theme: ClubTheme = {
    name: parsed.data.name,
    ...(guidance ? { guidance } : {}),
    ...(guidanceHtml ? { guidanceHtml } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    version,
    updatedAt: timestamp,
  };

  try {
    const clubs = (await getDb()).collection<Club>("clubs");
    const currentVersion = club.currentTheme?.version;
    const currentThemeFilter = club.currentTheme
      ? { "currentTheme.version": currentVersion }
      : { currentTheme: { $exists: false } };
    let result;
    if (currentVersion !== undefined && version === currentVersion) {
      result = await clubs.updateOne(
        { id: club.id, ...currentThemeFilter },
        { $set: { currentTheme: theme, updatedAt: timestamp } },
      );
    } else if (storedSavedTheme) {
      result = await clubs.updateOne(
        { id: club.id, ...currentThemeFilter, "savedThemes.version": version },
        { $set: { "savedThemes.$[theme]": theme, updatedAt: timestamp } },
        { arrayFilters: [{ "theme.version": version }] },
      );
    } else if (storedPastTheme) {
      result = await clubs.updateOne(
        { id: club.id, ...currentThemeFilter, "themeHistory.version": version },
        { $set: { "themeHistory.$[theme]": theme, updatedAt: timestamp } },
        { arrayFilters: [{ "theme.version": version }] },
      );
    } else {
      result = await clubs.updateOne(
        { id: club.id, ...currentThemeFilter, "themeHistory.version": { $ne: version } },
        { $set: { updatedAt: timestamp }, $push: { themeHistory: theme } },
      );
    }

    if (!result.matchedCount) {
      await discardArtwork(uploadedArtwork);
      return NextResponse.json({ error: "The theme list changed. Refresh and try again." }, { status: 409 });
    }
  } catch {
    await discardArtwork(uploadedArtwork);
    return NextResponse.json({ error: "Could not update this theme." }, { status: 500 });
  }

  return NextResponse.json({ theme });
}
