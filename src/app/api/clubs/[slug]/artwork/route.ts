import { NextResponse } from "next/server";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { discardArtwork, isOwnedArtworkUrl } from "@/lib/blob-artwork";
import {
  CLUB_DESCRIPTION_HTML_MAX_LENGTH,
  CLUB_DESCRIPTION_MAX_LENGTH,
  clubDescriptionToText,
  sanitizeClubDescriptionHtml,
} from "@/lib/club-description";
import { getDb } from "@/lib/db";
import { integrations } from "@/lib/env";
import { getClubBySlug, getClubMemberships } from "@/lib/repository";
import { plainTextToRichTextHtml } from "@/lib/rich-text";
import {
  THEME_DESCRIPTION_HTML_MAX_LENGTH,
  THEME_DESCRIPTION_MAX_LENGTH,
  sanitizeThemeDescriptionHtml,
  themeDescriptionToText,
} from "@/lib/theme-description";
import type { Club } from "@/types/domain";

const imageValue = z.string().url().max(1_000).nullable().optional();
const schema = z.object({
  name: z.string().trim().min(2).max(70),
  description: z.string().trim().min(10).max(CLUB_DESCRIPTION_MAX_LENGTH),
  descriptionHtml: z.string().max(CLUB_DESCRIPTION_HTML_MAX_LENGTH).optional(),
  theme: z.string().trim().min(2).max(100),
  guidance: z.string().trim().max(THEME_DESCRIPTION_MAX_LENGTH),
  guidanceHtml: z.string().max(THEME_DESCRIPTION_HTML_MAX_LENGTH),
  clubImageUrl: imageValue,
  themeImageUrl: imageValue,
});

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { profile, features } = await requireViewer();
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid club settings." }, { status: 400 });

  const descriptionHtml = parsed.data.descriptionHtml ? sanitizeClubDescriptionHtml(parsed.data.descriptionHtml) : undefined;
  const description = descriptionHtml ? clubDescriptionToText(descriptionHtml) : parsed.data.description;
  if (description.length < 10) {
    return NextResponse.json({ error: "Add a description of at least 10 characters before saving this club." }, { status: 400 });
  }
  if (description.length > CLUB_DESCRIPTION_MAX_LENGTH) {
    return NextResponse.json({ error: `Keep the description to ${CLUB_DESCRIPTION_MAX_LENGTH.toLocaleString()} characters or fewer.` }, { status: 400 });
  }
  const sanitizedGuidanceHtml = sanitizeThemeDescriptionHtml(parsed.data.guidanceHtml);
  const guidance = sanitizedGuidanceHtml ? themeDescriptionToText(sanitizedGuidanceHtml) : parsed.data.guidance;
  const guidanceHtml = guidance && sanitizedGuidanceHtml ? sanitizedGuidanceHtml : undefined;
  if (guidance.length > THEME_DESCRIPTION_MAX_LENGTH) {
    return NextResponse.json({ error: `Keep the theme description to ${THEME_DESCRIPTION_MAX_LENGTH.toLocaleString()} characters or fewer.` }, { status: 400 });
  }

  const newArtwork = [parsed.data.clubImageUrl, parsed.data.themeImageUrl].filter((value): value is string => typeof value === "string");
  if (!features.clubAdminTools || !features.clubThemes) {
    await Promise.all(newArtwork.map(discardArtwork));
    return NextResponse.json({ error: "Your current plan does not include these club administration features." }, { status: 403 });
  }
  if (parsed.data.clubImageUrl && !isOwnedArtworkUrl(parsed.data.clubImageUrl, "club", profile.id)) {
    return NextResponse.json({ error: "This club image does not belong to your account." }, { status: 403 });
  }
  if (parsed.data.themeImageUrl && !isOwnedArtworkUrl(parsed.data.themeImageUrl, "theme", profile.id)) {
    return NextResponse.json({ error: "This theme image does not belong to your account." }, { status: 403 });
  }

  const club = await getClubBySlug(slug);
  if (!club) {
    await Promise.all(newArtwork.map(discardArtwork));
    return NextResponse.json({ error: "Club not found." }, { status: 404 });
  }
  const memberships = await getClubMemberships(club.id);
  const membership = memberships.find((item) => item.userId === profile.id);
  if (!membership || membership.role === "member") {
    await Promise.all(newArtwork.map(discardArtwork));
    return NextResponse.json({ error: "You cannot manage this club." }, { status: 403 });
  }
  if (!integrations.mongo) {
    await Promise.all(newArtwork.map(discardArtwork));
    return NextResponse.json({ demo: true });
  }

  const existingGuidanceHtml = club.currentTheme.guidanceHtml
    ? sanitizeThemeDescriptionHtml(club.currentTheme.guidanceHtml)
    : plainTextToRichTextHtml(club.currentTheme.guidance ?? "");
  const themeChanged = parsed.data.theme !== club.currentTheme.name
    || guidance !== (club.currentTheme.guidance ?? "")
    || (guidanceHtml ?? "") !== existingGuidanceHtml;
  const themeUpdated = themeChanged || parsed.data.themeImageUrl !== undefined;
  const timestamp = new Date().toISOString();
  const setValues: Record<string, string> = {
    name: parsed.data.name,
    description,
    "currentTheme.name": parsed.data.theme,
    updatedAt: timestamp,
  };
  const unsetValues: Record<string, ""> = {};
  if (descriptionHtml) setValues.descriptionHtml = descriptionHtml;
  else unsetValues.descriptionHtml = "";
  if (guidance) setValues["currentTheme.guidance"] = guidance;
  else unsetValues["currentTheme.guidance"] = "";
  if (guidanceHtml) setValues["currentTheme.guidanceHtml"] = guidanceHtml;
  else unsetValues["currentTheme.guidanceHtml"] = "";
  if (themeUpdated) setValues["currentTheme.updatedAt"] = timestamp;
  if (parsed.data.clubImageUrl !== undefined) {
    if (parsed.data.clubImageUrl === null) unsetValues.imageUrl = "";
    else setValues.imageUrl = parsed.data.clubImageUrl;
  }
  if (parsed.data.themeImageUrl !== undefined) {
    if (parsed.data.themeImageUrl === null) unsetValues["currentTheme.imageUrl"] = "";
    else setValues["currentTheme.imageUrl"] = parsed.data.themeImageUrl;
  }

  try {
    const update = {
      $set: setValues,
      ...(Object.keys(unsetValues).length ? { $unset: unsetValues } : {}),
      ...(themeUpdated ? { $inc: { "currentTheme.version": 1 } } : {}),
    };
    await (await getDb()).collection<Club>("clubs").updateOne({ id: club.id }, update);
  } catch {
    await Promise.all(newArtwork.map(discardArtwork));
    return NextResponse.json({ error: "Could not update club settings." }, { status: 500 });
  }

  const replacedArtwork = [
    parsed.data.clubImageUrl !== undefined && parsed.data.clubImageUrl !== club.imageUrl ? club.imageUrl : undefined,
    parsed.data.themeImageUrl !== undefined && parsed.data.themeImageUrl !== club.currentTheme.imageUrl ? club.currentTheme.imageUrl : undefined,
  ].filter((value): value is string => Boolean(value));
  await Promise.all(replacedArtwork.map(discardArtwork));
  return NextResponse.json({
    name: parsed.data.name,
    description,
    descriptionHtml,
    theme: parsed.data.theme,
    guidance,
    guidanceHtml,
    clubImageUrl: parsed.data.clubImageUrl,
    themeImageUrl: parsed.data.themeImageUrl,
  });
}
