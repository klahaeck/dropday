import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import {
  processDropScheduleEvent,
  type DurableOutboxEvent,
} from "@/lib/outbox";
import type { DropSlot } from "@/types/domain";

const scheduleDropTasks = vi.hoisted(() => vi.fn());

vi.mock("@/lib/scheduler", () => ({ scheduleDropTasks }));

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

const event: DurableOutboxEvent = {
  id: "outbox-schedule-drop-1",
  type: "drop.schedule",
  aggregateId: drop.id,
  payload: {
    dropId: drop.id,
    occurrenceKey: drop.occurrenceKey,
    scheduleVersion: drop.scheduleVersion,
    scheduledFor: drop.scheduledFor,
    reminderOffsetsMinutes: [1_440, 60],
  },
  status: "processing",
  attempts: 1,
  idempotencyKey: `drop-schedule:${drop.occurrenceKey}`,
  createdAt: drop.createdAt,
};

describe("drop schedule outbox delivery", () => {
  const findOne = vi.fn();
  const updateOne = vi.fn();
  const db = {
    collection: vi.fn(() => ({ findOne, updateOne })),
  } as unknown as Db;

  beforeEach(() => {
    vi.clearAllMocks();
    findOne.mockResolvedValue(drop);
    updateOne.mockResolvedValue({ matchedCount: 1 });
  });

  it("does not complete scheduling when no required Trigger task was created", async () => {
    scheduleDropTasks.mockResolvedValue([]);

    await expect(processDropScheduleEvent(db, event))
      .rejects.toThrow("Drop scheduling did not create the required processing task");
    expect(updateOne).not.toHaveBeenCalled();
  });

  it("persists the provider run IDs only after required task creation", async () => {
    scheduleDropTasks.mockResolvedValue(["process-run", "reminder-run"]);

    await expect(processDropScheduleEvent(db, event)).resolves.toEqual({
      status: "scheduled",
      runIds: ["process-run", "reminder-run"],
    });
    expect(updateOne).toHaveBeenCalledWith(
      {
        id: drop.id,
        occurrenceKey: drop.occurrenceKey,
        scheduleVersion: drop.scheduleVersion,
        status: "scheduled",
      },
      { $set: { triggerRunIds: ["process-run", "reminder-run"] } },
    );
  });
});
