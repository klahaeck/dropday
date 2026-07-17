import { NextResponse } from "next/server";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { discardArtwork, isOwnedArtworkUrl } from "@/lib/blob-artwork";
import { nextClubThemeVersion } from "@/lib/club-theme-history";
import { getDb } from "@/lib/db";
import { integrations } from "@/lib/env";
import { getClubBySlug, getClubMemberships } from "@/lib/repository";
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
  imageUrl: z.string().url().max(1_000).optional(),
  setCurrent: z.boolean().default(false),
});

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { profile, features } = await requireViewer();
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid theme." }, { status: 400 });
  }

  const uploadedArtwork = parsed.data.imageUrl;
  if (uploadedArtwork && !isOwnedArtworkUrl(uploadedArtwork, "theme", profile.id)) {
    return NextResponse.json({ error: "This theme image does not belong to your account." }, { status: 403 });
  }
  if (!features.clubAdminTools || !features.clubThemes) {
    await discardArtwork(uploadedArtwork);
    return NextResponse.json({ error: "Your current plan does not include club themes." }, { status: 403 });
  }

  const sanitizedGuidanceHtml = sanitizeThemeDescriptionHtml(parsed.data.guidanceHtml);
  const guidance = sanitizedGuidanceHtml ? themeDescriptionToText(sanitizedGuidanceHtml) : parsed.data.guidance;
  const guidanceHtml = guidance && sanitizedGuidanceHtml ? sanitizedGuidanceHtml : undefined;
  if (guidance.length > THEME_DESCRIPTION_MAX_LENGTH) {
    await discardArtwork(uploadedArtwork);
    return NextResponse.json({ error: `Keep the theme description to ${THEME_DESCRIPTION_MAX_LENGTH.toLocaleString()} characters or fewer.` }, { status: 400 });
  }

  const club = await getClubBySlug(slug);
  if (!club) {
    await discardArtwork(uploadedArtwork);
    return NextResponse.json({ error: "Club not found." }, { status: 404 });
  }
  const memberships = await getClubMemberships(club.id);
  const membership = memberships.find((item) => item.userId === profile.id);
  if (!membership || membership.role === "member") {
    await discardArtwork(uploadedArtwork);
    return NextResponse.json({ error: "You cannot manage this club." }, { status: 403 });
  }
  if (!integrations.mongo) {
    await discardArtwork(uploadedArtwork);
    return NextResponse.json({ demo: true, version: nextClubThemeVersion(club) }, { status: 201 });
  }

  const timestamp = new Date().toISOString();
  const version = nextClubThemeVersion(club);
  const theme: ClubTheme = {
    name: parsed.data.name,
    ...(guidance ? { guidance } : {}),
    ...(guidanceHtml ? { guidanceHtml } : {}),
    ...(uploadedArtwork ? { imageUrl: uploadedArtwork } : {}),
    version,
    updatedAt: timestamp,
  };

  try {
    const currentThemeFilter = club.currentTheme
      ? { "currentTheme.version": club.currentTheme.version }
      : { currentTheme: { $exists: false } };
    const filter = {
      id: club.id,
      ...currentThemeFilter,
      "themeHistory.version": { $ne: version },
      "savedThemes.version": { $ne: version },
    };
    const update = parsed.data.setCurrent
      ? club.currentTheme ? {
          $set: { currentTheme: theme, updatedAt: timestamp },
          $push: { themeHistory: club.currentTheme },
        } : {
          $set: { currentTheme: theme, updatedAt: timestamp },
        }
      : {
          $set: { updatedAt: timestamp },
          $push: { savedThemes: theme },
        };
    const result = await (await getDb()).collection<Club>("clubs").updateOne(filter, update);
    if (!result.matchedCount) {
      await discardArtwork(uploadedArtwork);
      return NextResponse.json({ error: "The theme list changed. Refresh and try again." }, { status: 409 });
    }
  } catch {
    await discardArtwork(uploadedArtwork);
    return NextResponse.json({ error: "Could not create this theme." }, { status: 500 });
  }

  return NextResponse.json({ theme, status: parsed.data.setCurrent ? "current" : "saved" }, { status: 201 });
}
