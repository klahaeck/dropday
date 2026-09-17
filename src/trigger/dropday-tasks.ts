import { schedules, task } from "@trigger.dev/sdk";
import { archiveExpiredCustodyClubs } from "@/lib/billing-service";
import { ensureIndexes, getDb } from "@/lib/db";
import { deliverDropReminder } from "@/lib/drop-reminders";
import { integrations } from "@/lib/env";
import { processScheduledDrop } from "@/lib/drop-service";
import { listRetryableOutboxEvents, processOutboxEvent } from "@/lib/outbox";
import { reportOperationalError } from "@/lib/observability";
import type {
  Club,
  DropSlot,
  Notification,
  UserProfile,
} from "@/types/domain";

export const processDropTask = task({
  id: "process-drop",
  run: async (payload: { dropId: string; scheduleVersion: number }) => {
    return processScheduledDrop(payload.dropId, payload.scheduleVersion);
  },
});

export const sendDropReminderTask = task({
  id: "send-drop-reminder",
  run: async (payload: { dropId: string; scheduleVersion: number; offsetMinutes: number }) => {
    if (!integrations.mongo) return { status: "demo" };
    const db = await getDb();
    const drop = await db.collection<DropSlot>("drops").findOne({ id: payload.dropId });
    if (!drop || drop.status !== "scheduled" || drop.scheduleVersion !== payload.scheduleVersion) return { status: "stale" };
    const [club, user] = await Promise.all([
      db.collection<Club>("clubs").findOne({ id: drop.clubId }),
      db.collection<UserProfile>("users").findOne({ id: drop.assignedUserId }),
    ]);
    if (!club || !user) return { status: "missing" };
    const notification = await deliverDropReminder({
      drop,
      club,
      user,
      offsetMinutes: payload.offsetMinutes,
      persistNotification: async (candidate) => {
        const result = await db.collection<Notification>("notifications")
          .updateOne({ id: candidate.id }, { $setOnInsert: candidate }, { upsert: true });
        return result.upsertedCount === 1;
      },
    });
    return { status: "sent", notificationId: notification.id };
  },
});

export const dispatchOutboxTask = task({
  id: "dispatch-outbox",
  run: async (payload: { outboxId: string }) => {
    return processOutboxEvent(payload.outboxId);
  },
});

export const sweepOutboxTask = schedules.task({
  id: "sweep-outbox",
  cron: "* * * * *",
  run: async () => {
    if (!integrations.mongo) return { status: "demo", processed: 0, failed: 0 };
    const db = await getDb();
    const events = await listRetryableOutboxEvents(db);
    let processed = 0;
    let failed = 0;
    for (const event of events) {
      try {
        await processOutboxEvent(event.id);
        processed += 1;
      } catch (error) {
        reportOperationalError("outbox.sweep-item", error, { outboxId: event.id });
        failed += 1;
      }
    }
    return { status: "complete", processed, failed };
  },
});

export const provisionDatabaseIndexesTask = schedules.task({
  id: "provision-database-indexes",
  cron: "11 3 * * *",
  run: async () => {
    if (!integrations.mongo) return { status: "demo" };
    await ensureIndexes();
    return { status: "complete" };
  },
});

export const archiveExpiredCustodyTask = schedules.task({
  id: "archive-expired-custody",
  cron: "17 * * * *",
  run: async () => {
    if (!integrations.mongo) return { status: "demo", archived: 0 };
    return { status: "complete", archived: await archiveExpiredCustodyClubs() };
  },
});
