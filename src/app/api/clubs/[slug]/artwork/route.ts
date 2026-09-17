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
import { CLUB_ACCENT_PATTERN } from "@/lib/club-accent";
import { canUseClubManagement } from "@/lib/club-management";
import { getDb, getMongoClient } from "@/lib/db";
import { integrations } from "@/lib/env";
import { getClubBySlug, getClubMemberships } from "@/lib/repository";
import type { Club } from "@/types/domain";

const imageValue = z.string().url().max(1_000).nullable().optional();
const schema = z.object({
  name: z.string().trim().min(2).max(70),
  description: z.string().trim().min(10).max(CLUB_DESCRIPTION_MAX_LENGTH),
  descriptionHtml: z.string().max(CLUB_DESCRIPTION_HTML_MAX_LENGTH).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  accent: z.string().regex(CLUB_ACCENT_PATTERN, "Choose a valid primary color.").transform((value) => value.toLowerCase()),
  clubImageUrl: imageValue,
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
  const newArtwork = [parsed.data.clubImageUrl].filter((value): value is string => typeof value === "string");
  if (parsed.data.clubImageUrl && !isOwnedArtworkUrl(parsed.data.clubImageUrl, "club", profile.id)) {
    return NextResponse.json({ error: "This club image does not belong to your account." }, { status: 403 });
  }
  const club = await getClubBySlug(slug);
  if (!club) {
    await Promise.all(newArtwork.map(discardArtwork));
    return NextResponse.json({ error: "Club not found." }, { status: 404 });
  }
  const memberships = await getClubMemberships(club.id);
  const membership = memberships.find((item) => item.userId === profile.id);
  if (!canUseClubManagement(
    membership,
    features.clubAdminTools && features.customSchedules,
  )) {
    await Promise.all(newArtwork.map(discardArtwork));
    return NextResponse.json({ error: "You cannot manage this club." }, { status: 403 });
  }
  if (!integrations.mongo) {
    await Promise.all(newArtwork.map(discardArtwork));
    club.name = parsed.data.name;
    club.description = description;
    club.visibility = parsed.data.visibility ?? club.visibility;
    club.accent = parsed.data.accent;
    club.updatedAt = new Date().toISOString();
    if (descriptionHtml) club.descriptionHtml = descriptionHtml;
    else delete club.descriptionHtml;
    if (parsed.data.clubImageUrl === null) delete club.imageUrl;
    return NextResponse.json({ demo: true, visibility: parsed.data.visibility ?? club.visibility });
  }

  const timestamp = new Date().toISOString();
  const setValues: Record<string, unknown> = {
    name: parsed.data.name,
    description,
    accent: parsed.data.accent,
    updatedAt: timestamp,
  };
  if (parsed.data.visibility !== undefined) setValues.visibility = parsed.data.visibility;
  const unsetValues: Record<string, ""> = {};
  if (descriptionHtml) setValues.descriptionHtml = descriptionHtml;
  else unsetValues.descriptionHtml = "";
  if (parsed.data.clubImageUrl !== undefined) {
    if (parsed.data.clubImageUrl === null) unsetValues.imageUrl = "";
    else setValues.imageUrl = parsed.data.clubImageUrl;
  }

  try {
    const db = await getDb();
    const client = await getMongoClient();
    await client.withSession(async (session) => session.withTransaction(async () => {
      const update = {
        $set: setValues,
        ...(Object.keys(unsetValues).length ? { $unset: unsetValues } : {}),
      };
      await db.collection<Club>("clubs").updateOne({ id: club.id }, update, { session });
    }));
  } catch {
    await Promise.all(newArtwork.map(discardArtwork));
    return NextResponse.json({ error: "Could not update club settings." }, { status: 500 });
  }

  const replacedArtwork = [
    parsed.data.clubImageUrl !== undefined && parsed.data.clubImageUrl !== club.imageUrl ? club.imageUrl : undefined,
  ].filter((value): value is string => Boolean(value));
  await Promise.all(replacedArtwork.map(discardArtwork));
  return NextResponse.json({
    name: parsed.data.name,
    description,
    descriptionHtml,
    visibility: parsed.data.visibility ?? club.visibility,
    accent: parsed.data.accent,
    clubImageUrl: parsed.data.clubImageUrl,
  });
}
