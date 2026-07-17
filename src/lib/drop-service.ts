import { getDb, getMongoClient } from "@/lib/db";
import { integrations } from "@/lib/env";
import { nextOccurrences, occurrenceKey } from "@/lib/scheduling";
import { rotateQueue } from "@/lib/queue";
import { createId } from "@/lib/repository";
import { dispatchOutbox, scheduleDropTasks } from "@/lib/scheduler";
import type { Club, DropSlot, OutboxEvent } from "@/types/domain";

export async function processScheduledDrop(dropId: string, scheduleVersion: number) {
  if (!integrations.mongo) return { status: "demo" } as const;
  const db = await getDb();
  const client = await getMongoClient();
  let nextDrop: DropSlot | undefined;
  let outbox: OutboxEvent | undefined;
  let result: "published" | "overdue" | "stale" = "stale";

  await client.withSession(async (session) => {
    await session.withTransaction(async () => {
      const drop = await db.collection<DropSlot>("drops").findOne({ id: dropId }, { session });
      if (!drop || drop.status !== "scheduled" || drop.scheduleVersion !== scheduleVersion) return;
      const club = await db.collection<Club>("clubs").findOne({ id: drop.clubId }, { session });
      if (!club || club.custody.status === "archived" || club.schedule.paused) return;
      const now = new Date().toISOString();
      if (!drop.playlist) {
        await db.collection<DropSlot>("drops").updateOne({ id: drop.id, status: "scheduled" }, { $set: { status: "overdue", updatedAt: now } }, { session });
        outbox = {
          id: createId("outbox"), type: "drop.overdue", aggregateId: drop.id,
          payload: { clubId: club.id, assignedUserId: drop.assignedUserId }, status: "pending", attempts: 0,
          idempotencyKey: `drop-overdue:${drop.occurrenceKey}`, createdAt: now,
        };
        await db.collection<OutboxEvent>("outbox").insertOne(outbox, { session });
        result = "overdue";
        return;
      }
      await db.collection<DropSlot>("drops").updateOne({ id: drop.id, status: "scheduled" }, { $set: { status: "published", publishedAt: now, updatedAt: now } }, { session });
      const rotationMemberIds = rotateQueue(club.rotationMemberIds, drop.assignedUserId);
      const nextDate = nextOccurrences(club.schedule, new Date(), 1)[0];
      if (nextDate && rotationMemberIds[0]) {
        nextDrop = {
          id: createId("drop"), clubId: club.id, occurrenceKey: occurrenceKey(club.id, nextDate, club.schedule.version),
          scheduleVersion: club.schedule.version, status: "scheduled", assignedUserId: rotationMemberIds[0], scheduledFor: nextDate.toISOString(),
          createdAt: now, updatedAt: now,
        };
        await db.collection<DropSlot>("drops").insertOne(nextDrop, { session });
      }
      await db.collection<Club>("clubs").updateOne({ id: club.id }, { $set: { rotationMemberIds, activeDropId: nextDrop?.id, updatedAt: now } }, { session });
      outbox = {
        id: createId("outbox"), type: "drop.published", aggregateId: drop.id,
        payload: { clubId: club.id, title: drop.playlist.title }, status: "pending", attempts: 0,
        idempotencyKey: `drop-published:${drop.occurrenceKey}`, createdAt: now,
      };
      await db.collection<OutboxEvent>("outbox").insertOne(outbox, { session });
      result = "published";
    });
  });

  if (nextDrop) {
    const club = await db.collection<Club>("clubs").findOne({ id: nextDrop.clubId });
    const runIds = await scheduleDropTasks(nextDrop, club?.schedule.reminderOffsetsMinutes ?? []);
    if (runIds.length) await db.collection<DropSlot>("drops").updateOne({ id: nextDrop.id }, { $set: { triggerRunIds: runIds } });
  }
  if (outbox) await dispatchOutbox(outbox.id, outbox.idempotencyKey);
  return { status: result, nextDropId: nextDrop?.id };
}
