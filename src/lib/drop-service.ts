import { getDb, getMongoClient } from "@/lib/db";
import { integrations } from "@/lib/env";
import { publishDropInTransaction } from "@/lib/drop-publication";
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
      const publication = await publishDropInTransaction({
        db,
        session,
        club,
        drop,
        playlist: drop.playlist,
        expectedStatus: "scheduled",
        timestamp: now,
      });
      nextDrop = publication.nextDrop;
      outbox = publication.outbox;
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
