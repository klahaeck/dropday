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
import { CLUB_ACCENT_PATTERN, DEFAULT_CLUB_ACCENT } from "@/lib/club-accent";
import { getDb, getMongoClient } from "@/lib/db";
import { getOwnershipEntitlement } from "@/lib/entitlements";
import { integrations } from "@/lib/env";
import { createAnchoredRecurrence, nextOccurrences, occurrenceKey } from "@/lib/scheduling";
import { countOwnedClubs, createId } from "@/lib/repository";
import { scheduleDropTasks } from "@/lib/scheduler";
import { THEME_DESCRIPTION_MAX_LENGTH } from "@/lib/theme-description";
import type { Club, ClubMembership, DropSlot } from "@/types/domain";

const schema = z.object({
  name: z.string().trim().min(2).max(70), description: z.string().trim().min(10).max(CLUB_DESCRIPTION_MAX_LENGTH),
  descriptionHtml: z.string().max(CLUB_DESCRIPTION_HTML_MAX_LENGTH).optional(),
  accent: z.string().regex(CLUB_ACCENT_PATTERN, "Choose a valid primary color.").transform((value) => value.toLowerCase()).default(DEFAULT_CLUB_ACCENT),
  visibility: z.enum(["public", "private"]), startsOn: z.string().date(), localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().min(3).max(80), frequency: z.enum(["daily", "weekly", "monthly"]),
  interval: z.coerce.number().int().min(1).max(52), theme: z.string().trim().min(2).max(100).optional(),
  guidance: z.string().trim().max(THEME_DESCRIPTION_MAX_LENGTH).optional(),
  clubImageUrl: z.string().url().max(1_000).optional(), themeImageUrl: z.string().url().max(1_000).optional(),
});

function slugify(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 56);
}

export async function POST(request: Request) {
  const { profile, features } = await requireViewer();
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid club" }, { status: 400 });
  const hasDescriptionHtml = parsed.data.descriptionHtml !== undefined;
  const descriptionHtml = hasDescriptionHtml ? sanitizeClubDescriptionHtml(parsed.data.descriptionHtml ?? "") : undefined;
  const description = hasDescriptionHtml ? clubDescriptionToText(descriptionHtml ?? "") : parsed.data.description;
  if (description.length < 10) {
    return NextResponse.json({ error: "Add a description of at least 10 characters before creating this club." }, { status: 400 });
  }
  if (description.length > CLUB_DESCRIPTION_MAX_LENGTH) {
    return NextResponse.json({ error: `Keep the description to ${CLUB_DESCRIPTION_MAX_LENGTH.toLocaleString()} characters or fewer.` }, { status: 400 });
  }
  const hasTheme = Boolean(parsed.data.theme);
  const uploadedArtwork = [parsed.data.clubImageUrl, parsed.data.themeImageUrl].filter((value): value is string => Boolean(value));
  if (parsed.data.clubImageUrl && !isOwnedArtworkUrl(parsed.data.clubImageUrl, "club", profile.id)) {
    return NextResponse.json({ error: "This club image does not belong to your account." }, { status: 403 });
  }
  if (parsed.data.themeImageUrl && !isOwnedArtworkUrl(parsed.data.themeImageUrl, "theme", profile.id)) {
    return NextResponse.json({ error: "This theme image does not belong to your account." }, { status: 403 });
  }
  if (!hasTheme && (parsed.data.guidance || parsed.data.themeImageUrl)) {
    await discardArtwork(parsed.data.themeImageUrl);
    return NextResponse.json({ error: "Add a theme name before adding theme guidance or artwork." }, { status: 400 });
  }
  const canHost = features.ownOneClub || features.ownFiveClubs || features.ownUnlimitedClubs;
  if (!canHost || !features.customSchedules || !features.clubAdminTools || (hasTheme && !features.clubThemes)) {
    await Promise.all(uploadedArtwork.map(discardArtwork));
    return NextResponse.json({ error: "Your current plan does not include the club hosting features." }, { status: 403 });
  }
  const ownedCount = await countOwnedClubs(profile.id);
  const entitlement = getOwnershipEntitlement(profile.plan, ownedCount);
  if (profile.plan === "free" || !entitlement.canOwnAnotherClub) {
    await Promise.all(uploadedArtwork.map(discardArtwork));
    return NextResponse.json({ error: "Your current plan cannot own another club.", entitlement }, { status: 403 });
  }
  if (!integrations.mongo) {
    await Promise.all(uploadedArtwork.map(discardArtwork));
    return NextResponse.json({ slug: "needle-exchange", demo: true }, { status: 201 });
  }

  let committed = false;
  try {
  const db = await getDb();
  const client = await getMongoClient();
  const timestamp = new Date().toISOString();
  const id = createId("club");
  const schedule = createAnchoredRecurrence({
    timezone: parsed.data.timezone, startsOn: parsed.data.startsOn, localTime: parsed.data.localTime,
    frequency: parsed.data.frequency, interval: parsed.data.interval,
    reminderOffsetsMinutes: [1440, 60], version: 1, paused: false,
  });
  const requestedSlug = slugify(parsed.data.name) || id.slice(-8);
  const exists = await db.collection<Club>("clubs").findOne({ slug: requestedSlug }, { projection: { id: 1 } });
  const slug = exists ? `${requestedSlug}-${id.slice(-5)}` : requestedSlug;
  const nextDate = nextOccurrences(schedule, new Date(Date.now() - 1000), 1)[0];
  const dropId = nextDate ? createId("drop") : undefined;
  const club: Club = {
    id, slug, name: parsed.data.name, description, descriptionHtml, visibility: parsed.data.visibility,
    imageUrl: parsed.data.clubImageUrl,
    accent: parsed.data.accent, memberCount: 1, rotationMemberIds: [profile.id],
    ...(hasTheme ? { currentTheme: { name: parsed.data.theme!, guidance: parsed.data.guidance, imageUrl: parsed.data.themeImageUrl, version: 1, updatedAt: timestamp } } : {}),
    themeHistory: [],
    savedThemes: [],
    schedule, activeDropId: dropId, custody: { status: "active", activeOwnerId: profile.id, recoveryClaimantId: null },
    createdAt: timestamp, updatedAt: timestamp,
  };
  const membership: ClubMembership = {
    id: createId("membership"), clubId: id, userId: profile.id, role: "owner", status: "active", queuePaused: false,
    joinedAt: timestamp, updatedAt: timestamp,
  };
  const drop: DropSlot | undefined = nextDate && dropId ? {
    id: dropId, clubId: id, occurrenceKey: occurrenceKey(id, nextDate, 1), scheduleVersion: 1, status: "scheduled",
    assignedUserId: profile.id, scheduledFor: nextDate.toISOString(), createdAt: timestamp, updatedAt: timestamp,
  } : undefined;

  await client.withSession(async (session) => session.withTransaction(async () => {
    await db.collection<Club>("clubs").insertOne(club, { session });
    await db.collection<ClubMembership>("memberships").insertOne(membership, { session });
    if (drop) await db.collection<DropSlot>("drops").insertOne(drop, { session });
  }));
  committed = true;
  let schedulingWarning: string | undefined;
  if (drop) {
    try {
      const runIds = await scheduleDropTasks(drop, schedule.reminderOffsetsMinutes);
      if (runIds.length) await db.collection<DropSlot>("drops").updateOne({ id: drop.id }, { $set: { triggerRunIds: runIds } });
    } catch {
      schedulingWarning = "The club was created, but its first drop tasks still need to be scheduled.";
    }
  }
  return NextResponse.json({ club, slug, warning: schedulingWarning }, { status: 201 });
  } catch {
    if (!committed) await Promise.all(uploadedArtwork.map(discardArtwork));
    return NextResponse.json({ error: "Could not create this club." }, { status: 500 });
  }
}
