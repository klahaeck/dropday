import { NextResponse } from "next/server";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { canUseClubManagement } from "@/lib/club-management";
import {
  ClubScheduleChangeError,
  planClubScheduleChange,
  type ClubScheduleChangePlan,
  type RequestedClubSchedule,
} from "@/lib/club-schedule-change";
import { getDb, getMongoClient } from "@/lib/db";
import {
  hasDuplicateDropReminderFrequencies,
  isDropReminderOffset,
  MAX_DROP_REMINDERS,
} from "@/lib/drop-reminder-settings";
import { demoDrops } from "@/lib/demo-data";
import { integrations } from "@/lib/env";
import { createId, getClubBySlug, getClubMemberships, getDropById, getUserProfile } from "@/lib/repository";
import { occurrenceKey } from "@/lib/scheduling";
import { scheduleDropTasks } from "@/lib/scheduler";
import { isValidTimeZone } from "@/lib/timezones";
import type { Club, DropSlot } from "@/types/domain";

const requestSchema = z.object({
  startsOn: z.string().date(),
  localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().min(3).max(80).refine(isValidTimeZone, "Choose a valid IANA timezone."),
  frequency: z.enum(["daily", "weekly", "monthly"]),
  interval: z.coerce.number().int().min(1).max(52),
  reminderOffsetsMinutes: z.array(
    z.number().int().refine(isDropReminderOffset, "Choose a supported reminder time."),
  )
    .max(MAX_DROP_REMINDERS)
    .refine(
      (offsets) => !hasDuplicateDropReminderFrequencies(offsets),
      "Choose each reminder frequency only once.",
    ),
});

const commitSchema = requestSchema.extend({
  confirmed: z.literal(true),
  expectedScheduleVersion: z.number().int().positive(),
  expectedActiveDropId: z.string().nullable(),
  expectedActiveDropStatus: z.enum(["scheduled", "overdue", "published", "skipped", "cancelled"]).nullable(),
  expectedActiveDropAssigneeId: z.string().nullable(),
  expectedNewNextDropIso: z.string().datetime().nullable(),
});

class StaleScheduleReviewError extends Error {}

function requestedSchedule(data: z.infer<typeof requestSchema>): RequestedClubSchedule {
  return {
    timezone: data.timezone,
    startsOn: data.startsOn,
    localTime: data.localTime,
    frequency: data.frequency,
    interval: data.interval,
    reminderOffsetsMinutes: data.reminderOffsetsMinutes,
  };
}

function reviewMatches({
  club,
  activeDrop,
  expectedScheduleVersion,
  expectedActiveDropId,
  expectedActiveDropStatus,
  expectedActiveDropAssigneeId,
}: {
  club: Club;
  activeDrop: DropSlot | null;
  expectedScheduleVersion: number;
  expectedActiveDropId: string | null;
  expectedActiveDropStatus: DropSlot["status"] | null;
  expectedActiveDropAssigneeId: string | null;
}) {
  return club.schedule.version === expectedScheduleVersion
    && (club.activeDropId ?? null) === expectedActiveDropId
    && (activeDrop?.id ?? null) === expectedActiveDropId
    && (activeDrop?.status ?? null) === expectedActiveDropStatus
    && (activeDrop?.assignedUserId ?? null) === expectedActiveDropAssigneeId;
}

async function authorizedScheduleContext(slug: string) {
  const { profile, features } = await requireViewer();
  const club = await getClubBySlug(slug);
  if (!club) return { error: NextResponse.json({ error: "Club not found." }, { status: 404 }) };
  const memberships = await getClubMemberships(club.id);
  const membership = memberships.find((item) => item.userId === profile.id);
  if (!canUseClubManagement(
    membership,
    features.clubAdminTools && features.customSchedules,
  )) {
    return { error: NextResponse.json({ error: "You cannot manage this club schedule." }, { status: 403 }) };
  }
  const activeDrop = club.activeDropId ? await getDropById(club.activeDropId) : null;
  return { profile, club, activeDrop };
}

async function responsePlan(plan: ClubScheduleChangePlan) {
  let assignee = null;
  if (plan.expectedActiveDropAssigneeId) {
    try {
      assignee = await getUserProfile(plan.expectedActiveDropAssigneeId);
    } catch {}
  }
  return {
    ...plan,
    expectedScheduleVersion: plan.currentScheduleVersion,
    expectedNewNextDropIso: plan.newNextDropIso,
    assigneeName: assignee?.displayName ?? null,
  };
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid schedule." }, { status: 400 });
  }
  const context = await authorizedScheduleContext(slug);
  if (context.error) return context.error;

  try {
    const plan = planClubScheduleChange({
      clubId: context.club.id,
      currentSchedule: context.club.schedule,
      activeDrop: context.activeDrop,
      requested: requestedSchedule(parsed.data),
      now: new Date(),
    });
    return NextResponse.json(await responsePlan(plan));
  } catch (error) {
    if (error instanceof ClubScheduleChangeError) {
      return NextResponse.json({ error: "Could not find the next drop date for this schedule." }, { status: 400 });
    }
    throw error;
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const parsed = commitSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Confirm this schedule change first." }, { status: 400 });
  }
  const context = await authorizedScheduleContext(slug);
  if (context.error) return context.error;
  if (!reviewMatches({ club: context.club, activeDrop: context.activeDrop, ...parsed.data })) {
    return NextResponse.json({ error: "The club schedule changed after your preview. Review it again." }, { status: 409 });
  }

  let initialPlan: ClubScheduleChangePlan;
  try {
    initialPlan = planClubScheduleChange({
      clubId: context.club.id,
      currentSchedule: context.club.schedule,
      activeDrop: context.activeDrop,
      requested: requestedSchedule(parsed.data),
      now: new Date(),
    });
  } catch (error) {
    if (error instanceof ClubScheduleChangeError) {
      return NextResponse.json({ error: "Could not find the next drop date for this schedule." }, { status: 400 });
    }
    throw error;
  }
  if (initialPlan.newNextDropIso !== parsed.data.expectedNewNextDropIso) {
    return NextResponse.json({ error: "The next drop changed after your preview. Review it again." }, { status: 409 });
  }
  if (!initialPlan.changed) return NextResponse.json(await responsePlan(initialPlan));
  if (!integrations.mongo) {
    const timestamp = new Date().toISOString();
    let activeDrop = context.activeDrop;
    if (initialPlan.dropMutation === "update" && activeDrop && initialPlan.newNextDropIso) {
      activeDrop.occurrenceKey = occurrenceKey(context.club.id, new Date(initialPlan.newNextDropIso), initialPlan.nextScheduleVersion);
      activeDrop.scheduleVersion = initialPlan.nextScheduleVersion;
      activeDrop.status = "scheduled";
      activeDrop.scheduledFor = initialPlan.newNextDropIso;
      activeDrop.triggerRunIds = undefined;
      activeDrop.updatedAt = timestamp;
    } else if (initialPlan.dropMutation === "create" && initialPlan.newNextDropIso) {
      const assignedUserId = activeDrop?.assignedUserId ?? context.club.rotationMemberIds[0];
      if (!assignedUserId) return NextResponse.json({ error: "This club has no active queue member." }, { status: 409 });
      activeDrop = {
        id: createId("drop"),
        clubId: context.club.id,
        occurrenceKey: occurrenceKey(context.club.id, new Date(initialPlan.newNextDropIso), initialPlan.nextScheduleVersion),
        scheduleVersion: initialPlan.nextScheduleVersion,
        status: "scheduled",
        assignedUserId,
        scheduledFor: initialPlan.newNextDropIso,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      demoDrops.push(activeDrop);
    }
    context.club.schedule = initialPlan.schedule;
    context.club.updatedAt = timestamp;
    if (activeDrop) context.club.activeDropId = activeDrop.id;
    return NextResponse.json({ ...(await responsePlan(initialPlan)), activeDropId: activeDrop?.id ?? null, demo: true });
  }

  let committedPlan: ClubScheduleChangePlan | undefined;
  let dropToSchedule: DropSlot | undefined;
  try {
    const db = await getDb();
    const client = await getMongoClient();
    await client.withSession(async (session) => session.withTransaction(async () => {
      const freshClub = await db.collection<Club>("clubs").findOne({ id: context.club.id }, { session });
      if (!freshClub) throw new StaleScheduleReviewError();
      const freshActiveDrop = freshClub.activeDropId
        ? await db.collection<DropSlot>("drops").findOne({ id: freshClub.activeDropId }, { session })
        : null;
      if (!reviewMatches({ club: freshClub, activeDrop: freshActiveDrop, ...parsed.data })) {
        throw new StaleScheduleReviewError();
      }

      const plan = planClubScheduleChange({
        clubId: freshClub.id,
        currentSchedule: freshClub.schedule,
        activeDrop: freshActiveDrop,
        requested: requestedSchedule(parsed.data),
        now: new Date(),
      });
      if (plan.newNextDropIso !== parsed.data.expectedNewNextDropIso) {
        throw new StaleScheduleReviewError();
      }
      committedPlan = plan;
      const timestamp = new Date().toISOString();

      if (plan.dropMutation === "update" && freshActiveDrop && plan.newNextDropIso) {
        dropToSchedule = {
          ...freshActiveDrop,
          occurrenceKey: occurrenceKey(freshClub.id, new Date(plan.newNextDropIso), plan.nextScheduleVersion),
          scheduleVersion: plan.nextScheduleVersion,
          status: "scheduled",
          scheduledFor: plan.newNextDropIso,
          triggerRunIds: undefined,
          updatedAt: timestamp,
        };
        const dropResult = await db.collection<DropSlot>("drops").updateOne(
          {
            id: freshActiveDrop.id,
            status: freshActiveDrop.status,
            assignedUserId: freshActiveDrop.assignedUserId,
            scheduleVersion: freshActiveDrop.scheduleVersion,
          },
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
        if (dropResult.matchedCount !== 1) throw new StaleScheduleReviewError();
      } else if (plan.dropMutation === "create" && plan.newNextDropIso) {
        const assignedUserId = freshActiveDrop?.assignedUserId ?? freshClub.rotationMemberIds[0];
        if (!assignedUserId) throw new Error("This club has no active queue member.");
        dropToSchedule = {
          id: createId("drop"),
          clubId: freshClub.id,
          occurrenceKey: occurrenceKey(freshClub.id, new Date(plan.newNextDropIso), plan.nextScheduleVersion),
          scheduleVersion: plan.nextScheduleVersion,
          status: "scheduled",
          assignedUserId,
          scheduledFor: plan.newNextDropIso,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        await db.collection<DropSlot>("drops").insertOne(dropToSchedule, { session });
      }

      const activeDropFilter = parsed.data.expectedActiveDropId
        ? { activeDropId: parsed.data.expectedActiveDropId }
        : { activeDropId: { $exists: false } };
      const clubResult = await db.collection<Club>("clubs").updateOne(
        { id: freshClub.id, "schedule.version": parsed.data.expectedScheduleVersion, ...activeDropFilter },
        {
          $set: {
            schedule: plan.schedule,
            ...(dropToSchedule ? { activeDropId: dropToSchedule.id } : {}),
            updatedAt: timestamp,
          },
        },
        { session },
      );
      if (clubResult.matchedCount !== 1) throw new StaleScheduleReviewError();
    }));
  } catch (error) {
    if (error instanceof StaleScheduleReviewError) {
      return NextResponse.json({ error: "The club schedule changed after your preview. Review it again." }, { status: 409 });
    }
    if (error instanceof ClubScheduleChangeError) {
      return NextResponse.json({ error: "Could not find the next drop date for this schedule." }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not update the club schedule." }, { status: 500 });
  }

  let warning: string | undefined;
  if (dropToSchedule && committedPlan) {
    try {
      const runIds = await scheduleDropTasks(dropToSchedule, committedPlan.schedule.reminderOffsetsMinutes);
      if (runIds.length) {
        await (await getDb()).collection<DropSlot>("drops").updateOne(
          { id: dropToSchedule.id, scheduleVersion: dropToSchedule.scheduleVersion },
          { $set: { triggerRunIds: runIds } },
        );
      }
    } catch {
      warning = "The schedule was saved, but the next drop tasks still need to be scheduled.";
    }
  }

  return NextResponse.json({ ...(await responsePlan(committedPlan!)), activeDropId: dropToSchedule?.id ?? context.club.activeDropId ?? null, warning });
}
