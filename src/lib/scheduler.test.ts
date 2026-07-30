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

  it("schedules every unique reminder frequency in a dynamic list", async () => {
    trigger
      .mockReset()
      .mockResolvedValueOnce({ id: "process-run" })
      .mockResolvedValueOnce({ id: "week-reminder-run" })
      .mockResolvedValueOnce({ id: "day-reminder-run" })
      .mockResolvedValueOnce({ id: "three-hour-reminder-run" });

    await expect(scheduleDropTasks(drop, [10_080, 1_440, 180])).resolves.toEqual([
      "process-run",
      "week-reminder-run",
      "day-reminder-run",
      "three-hour-reminder-run",
    ]);

    expect(trigger.mock.calls.slice(1).map((call) => call[1])).toEqual([
      { dropId: drop.id, scheduleVersion: drop.scheduleVersion, offsetMinutes: 10_080 },
      { dropId: drop.id, scheduleVersion: drop.scheduleVersion, offsetMinutes: 1_440 },
      { dropId: drop.id, scheduleVersion: drop.scheduleVersion, offsetMinutes: 180 },
    ]);
  });
});
