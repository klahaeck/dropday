import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import {
  claimOutboxEvent,
  dropScheduleOutboxEvent,
  enqueueDropScheduleOutbox,
  getDropScheduleDispatchState,
  requeueOutboxEvent,
} from "@/lib/outbox";
import type { DropSlot } from "@/types/domain";

const drop: DropSlot = {
  id: "drop-1",
  clubId: "club-1",
  occurrenceKey: "club-1:2099-08-01T18:00:00.000Z:v3",
  scheduleVersion: 3,
  status: "scheduled",
  assignedUserId: "user-1",
  scheduledFor: "2099-08-01T18:00:00.000Z",
  createdAt: "2099-07-01T18:00:00.000Z",
  updatedAt: "2099-07-01T18:00:00.000Z",
};

describe("durable outbox work", () => {
  it("creates deterministic, normalized scheduling work", () => {
    const event = dropScheduleOutboxEvent(
      drop,
      [60, 1_440, 60],
      "2099-07-01T18:00:00.000Z",
    );

    expect(event).toMatchObject({
      id: "outbox_schedule_drop-1_3",
      type: "drop.schedule",
      status: "pending",
      attempts: 0,
      idempotencyKey: `drop-schedule:${drop.occurrenceKey}`,
      payload: {
        dropId: drop.id,
        scheduleVersion: 3,
        reminderOffsetsMinutes: [1_440, 60],
      },
    });
  });

  it("enqueues scheduling work idempotently inside the caller transaction", async () => {
    const findOneAndUpdate = vi.fn().mockImplementation(async (_filter, update) => update.$setOnInsert);
    const db = { collection: vi.fn(() => ({ findOneAndUpdate })) } as unknown as Db;
    const session = {} as never;

    const event = await enqueueDropScheduleOutbox({
      db,
      session,
      drop,
      reminderOffsetsMinutes: [60],
      timestamp: drop.updatedAt,
    });

    expect(event.idempotencyKey).toBe(`drop-schedule:${drop.occurrenceKey}`);
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { idempotencyKey: `drop-schedule:${drop.occurrenceKey}` },
      { $setOnInsert: expect.objectContaining({ id: "outbox_schedule_drop-1_3" }) },
      expect.objectContaining({ upsert: true, returnDocument: "after", session }),
    );
  });

  it("leases retryable work with a unique claim and an incremented attempt", async () => {
    const stored = dropScheduleOutboxEvent(drop, [60], drop.updatedAt);
    const findOneAndUpdate = vi.fn().mockResolvedValue({ ...stored, status: "processing", attempts: 1 });
    const db = { collection: vi.fn(() => ({ findOneAndUpdate })) } as unknown as Db;
    const now = new Date("2099-07-01T19:00:00.000Z");

    await expect(claimOutboxEvent(db, stored.id, now)).resolves.toMatchObject({
      status: "processing",
      attempts: 1,
    });
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: stored.id }),
      expect.objectContaining({
        $set: expect.objectContaining({ status: "processing", claimedAt: now }),
        $inc: { attempts: 1 },
      }),
      { returnDocument: "after" },
    );
  });

  it("reports failed work as retryable and requeues it idempotently", async () => {
    const stored = { ...dropScheduleOutboxEvent(drop, [60], drop.updatedAt), status: "failed" as const, attempts: 2 };
    const findOne = vi.fn().mockResolvedValue(stored);
    const findOneAndUpdate = vi.fn().mockResolvedValue({ ...stored, status: "pending" });
    const db = { collection: vi.fn(() => ({ findOne, findOneAndUpdate })) } as unknown as Db;

    await expect(getDropScheduleDispatchState(db, drop)).resolves.toEqual({
      status: "failed",
      attempts: 2,
      retryable: true,
    });
    await expect(requeueOutboxEvent(db, stored.id)).resolves.toMatchObject({ status: "pending" });
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: stored.id, status: { $ne: "delivered" } }),
      expect.objectContaining({ $set: expect.objectContaining({ status: "pending" }) }),
      { returnDocument: "after" },
    );
  });
});
