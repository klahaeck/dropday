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
import { getDb, getMongoClient } from "@/lib/db";
import {
  hasDuplicateDropReminderFrequencies,
  isDropReminderOffset,
  MAX_DROP_REMINDERS,
  normalizeDropReminderOffsets,
} from "@/lib/drop-reminder-settings";
import { integrations } from "@/lib/env";
import { getClubBySlug, getClubMemberships, createId } from "@/lib/repository";
import { createAnchoredRecurrence, nextOccurrences, occurrenceKey } from "@/lib/scheduling";
import { scheduleDropTasks } from "@/lib/scheduler";
import type { Club, DropSlot } from "@/types/domain";

const imageValue = z.string().url().max(1_000).nullable().optional();
const schema = z.object({
  name: z.string().trim().min(2).max(70),
  description: z.string().trim().min(10).max(CLUB_DESCRIPTION_MAX_LENGTH),
  descriptionHtml: z.string().max(CLUB_DESCRIPTION_HTML_MAX_LENGTH).optional(),
  accent: z.string().regex(CLUB_ACCENT_PATTERN, "Choose a valid primary color.").transform((value) => value.toLowerCase()),
  clubImageUrl: imageValue,
  startsOn: z.string().date(),
  localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().min(3).max(80),
  frequency: z.enum(["daily", "weekly", "monthly"]),
  interval: z.coerce.number().int().min(1).max(52),
  reminderOffsetsMinutes: z.array(
    z.number().int().refine(isDropReminderOffset, "Choose a supported reminder time."),
  )
    .max(MAX_DROP_REMINDERS)
    .refine(
      (offsets) => !hasDuplicateDropReminderFrequencies(offsets),
      "Choose each reminder frequency only once.",
    )
    .optional(),
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
  if (!features.clubAdminTools || !features.customSchedules) {
    await Promise.all(newArtwork.map(discardArtwork));
    return NextResponse.json({ error: "Your current plan does not include club administration and scheduling tools." }, { status: 403 });
  }
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
  if (!membership || membership.role === "member") {
    await Promise.all(newArtwork.map(discardArtwork));
    return NextResponse.json({ error: "You cannot manage this club." }, { status: 403 });
  }
  if (!integrations.mongo) {
    await Promise.all(newArtwork.map(discardArtwork));
    return NextResponse.json({ demo: true });
  }

  const timestamp = new Date().toISOString();
  const currentReminderOffsets = normalizeDropReminderOffsets(club.schedule.reminderOffsetsMinutes);
  const reminderOffsetsMinutes = parsed.data.reminderOffsetsMinutes === undefined
    ? currentReminderOffsets
    : normalizeDropReminderOffsets(parsed.data.reminderOffsetsMinutes);
  const candidateSchedule = createAnchoredRecurrence({
    timezone: parsed.data.timezone,
    startsOn: parsed.data.startsOn,
    localTime: parsed.data.localTime,
    frequency: parsed.data.frequency,
    interval: parsed.data.interval,
    reminderOffsetsMinutes,
    version: club.schedule.version,
    paused: club.schedule.paused,
  });
  const scheduleChanged = candidateSchedule.timezone !== club.schedule.timezone
    || candidateSchedule.startsOn !== club.schedule.startsOn
    || candidateSchedule.localTime !== club.schedule.localTime
    || candidateSchedule.frequency !== club.schedule.frequency
    || candidateSchedule.interval !== club.schedule.interval
    || candidateSchedule.rrule !== club.schedule.rrule;
  const remindersChanged = reminderOffsetsMinutes.length !== currentReminderOffsets.length
    || reminderOffsetsMinutes.some((offset, index) => offset !== currentReminderOffsets[index]);
  const schedulingChanged = scheduleChanged || remindersChanged;
  const schedule = {
    ...candidateSchedule,
    version: schedulingChanged ? club.schedule.version + 1 : club.schedule.version,
  };
  const setValues: Record<string, unknown> = {
    name: parsed.data.name,
    description,
    accent: parsed.data.accent,
    updatedAt: timestamp,
  };
  const unsetValues: Record<string, ""> = {};
  if (descriptionHtml) setValues.descriptionHtml = descriptionHtml;
  else unsetValues.descriptionHtml = "";
  if (parsed.data.clubImageUrl !== undefined) {
    if (parsed.data.clubImageUrl === null) unsetValues.imageUrl = "";
    else setValues.imageUrl = parsed.data.clubImageUrl;
  }

  let dropToSchedule: DropSlot | undefined;
  try {
    const db = await getDb();
    const client = await getMongoClient();
    await client.withSession(async (session) => session.withTransaction(async () => {
      if (schedulingChanged) {
        const activeDrop = club.activeDropId
          ? await db.collection<DropSlot>("drops").findOne({ id: club.activeDropId }, { session })
          : null;
        const nextDate = scheduleChanged
          ? nextOccurrences(schedule, new Date(Date.now() - 1000), 1)[0]
          : activeDrop?.status === "scheduled"
            ? new Date(activeDrop.scheduledFor)
            : undefined;
        if (scheduleChanged && !nextDate) throw new Error("Could not find the next drop date.");

        if (nextDate && activeDrop && (activeDrop.status === "scheduled" || (scheduleChanged && activeDrop.status === "overdue"))) {
          dropToSchedule = {
            ...activeDrop,
            occurrenceKey: occurrenceKey(club.id, nextDate, schedule.version),
            scheduleVersion: schedule.version,
            status: "scheduled",
            scheduledFor: nextDate.toISOString(),
            triggerRunIds: undefined,
            updatedAt: timestamp,
          };
          await db.collection<DropSlot>("drops").updateOne(
            { id: activeDrop.id },
            {
              $set: {
                occurrenceKey: dropToSchedule.occurrenceKey,
                scheduleVersion: dropToSchedule.scheduleVersion,
                status: dropToSchedule.status,
                scheduledFor: dropToSchedule.scheduledFor,
                updatedAt: timestamp,
              },
              $unset: { triggerRunIds: "" },
            },
            { session },
          );
        } else if (nextDate) {
          const assignedUserId = activeDrop?.assignedUserId ?? club.rotationMemberIds[0];
          if (!assignedUserId) throw new Error("This club has no active queue member.");
          dropToSchedule = {
            id: createId("drop"),
            clubId: club.id,
            occurrenceKey: occurrenceKey(club.id, nextDate, schedule.version),
            scheduleVersion: schedule.version,
            status: "scheduled",
            assignedUserId,
            scheduledFor: nextDate.toISOString(),
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          await db.collection<DropSlot>("drops").insertOne(dropToSchedule, { session });
        }

        setValues.schedule = schedule;
        if (dropToSchedule) setValues.activeDropId = dropToSchedule.id;
      }

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

  let schedulingWarning: string | undefined;
  if (dropToSchedule) {
    try {
      const runIds = await scheduleDropTasks(dropToSchedule, schedule.reminderOffsetsMinutes);
      if (runIds.length) {
        await (await getDb()).collection<DropSlot>("drops").updateOne(
          { id: dropToSchedule.id, scheduleVersion: dropToSchedule.scheduleVersion },
          { $set: { triggerRunIds: runIds } },
        );
      }
    } catch {
      schedulingWarning = "The schedule was saved, but the next drop tasks still need to be scheduled.";
    }
  }

  const replacedArtwork = [
    parsed.data.clubImageUrl !== undefined && parsed.data.clubImageUrl !== club.imageUrl ? club.imageUrl : undefined,
  ].filter((value): value is string => Boolean(value));
  await Promise.all(replacedArtwork.map(discardArtwork));
  return NextResponse.json({
    name: parsed.data.name,
    description,
    descriptionHtml,
    accent: parsed.data.accent,
    clubImageUrl: parsed.data.clubImageUrl,
    schedule: schedulingChanged ? schedule : club.schedule,
    warning: schedulingWarning,
  });
}
