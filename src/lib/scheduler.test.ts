import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DROP_REMINDER_OFFSETS } from "@/lib/drop-reminder-settings";
import type { DropSlot } from "@/types/domain";

const trigger = vi.hoisted(() => vi.fn());

vi.mock("@trigger.dev/sdk", () => ({ tasks: { trigger } }));
vi.mock("@/lib/env", () => ({ integrations: { trigger: true } }));

import { scheduleDropTasks } from "@/lib/scheduler";

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

describe("drop task scheduling", () => {
  beforeEach(() => {
    trigger.mockReset();
    trigger
      .mockResolvedValueOnce({ id: "process-run" })
      .mockResolvedValueOnce({ id: "day-reminder-run" })
      .mockResolvedValueOnce({ id: "hour-reminder-run" });
  });

  it("schedules the drop plus the default day and hour reminder jobs", async () => {
    await expect(scheduleDropTasks(drop, DEFAULT_DROP_REMINDER_OFFSETS))
      .resolves.toEqual(["process-run", "day-reminder-run", "hour-reminder-run"]);

    expect(trigger).toHaveBeenNthCalledWith(
      1,
      "process-drop",
      { dropId: drop.id, scheduleVersion: drop.scheduleVersion },
      expect.objectContaining({ idempotencyKey: `drop:${drop.occurrenceKey}` }),
    );
    expect(trigger).toHaveBeenNthCalledWith(
      2,
      "send-drop-reminder",
      { dropId: drop.id, scheduleVersion: drop.scheduleVersion, offsetMinutes: 1_440 },
      expect.objectContaining({ idempotencyKey: `reminder:${drop.occurrenceKey}:1440` }),
    );
    expect(trigger).toHaveBeenNthCalledWith(
      3,
      "send-drop-reminder",
      { dropId: drop.id, scheduleVersion: drop.scheduleVersion, offsetMinutes: 60 },
      expect.objectContaining({ idempotencyKey: `reminder:${drop.occurrenceKey}:60` }),
    );
  });
});
