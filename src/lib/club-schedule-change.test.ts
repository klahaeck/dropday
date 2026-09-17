import { describe, expect, it } from "vitest";
import { ClubScheduleChangeError, planClubScheduleChange } from "@/lib/club-schedule-change";
import type { DropSlot, RecurrenceConfig } from "@/types/domain";

const schedule: RecurrenceConfig = {
  timezone: "America/Chicago",
  startsOn: "2026-09-20",
  localTime: "19:30",
  frequency: "weekly",
  interval: 1,
  weekdays: [7],
  rrule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=SU",
  reminderOffsetsMinutes: [1440, 60],
  version: 3,
  paused: false,
};
const drop: DropSlot = {
  id: "drop-1",
  clubId: "club-1",
  occurrenceKey: "club-1:old:v3",
  scheduleVersion: 3,
  status: "scheduled",
  assignedUserId: "user-1",
  scheduledFor: "2026-09-20T00:30:00.000Z",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};
const requested = {
  timezone: schedule.timezone,
  startsOn: schedule.startsOn,
  localTime: schedule.localTime,
  frequency: schedule.frequency,
  interval: schedule.interval,
  reminderOffsetsMinutes: schedule.reminderOffsetsMinutes,
};

function plan(overrides: Partial<typeof requested> = {}, activeDrop: DropSlot | null = drop) {
  return planClubScheduleChange({
    clubId: "club-1",
    currentSchedule: schedule,
    activeDrop,
    requested: { ...requested, ...overrides },
    now: new Date("2026-09-17T12:00:00.000Z"),
  });
}

describe("club schedule change planner", () => {
  it("leaves unchanged schedules and drops untouched", () => {
    expect(plan()).toMatchObject({
      changed: false,
      cadenceChanged: false,
      remindersChanged: false,
      nextScheduleVersion: 3,
      activeDropEffect: "unchanged",
      dropMutation: "none",
    });
  });

  it("refreshes a scheduled drop for reminder-only changes without moving it", () => {
    expect(plan({ reminderOffsetsMinutes: [10080, 60] })).toMatchObject({
      cadenceChanged: false,
      remindersChanged: true,
      newNextDropIso: drop.scheduledFor,
      activeDropEffect: "unchanged",
      dropMutation: "update",
      remindersAdded: [10080],
      remindersRemoved: [1440],
    });
  });

  it("moves a scheduled drop and increments the schedule version", () => {
    expect(plan({ localTime: "20:30" })).toMatchObject({
      changed: true,
      cadenceChanged: true,
      nextScheduleVersion: 4,
      oldNextDropIso: drop.scheduledFor,
      newNextDropIso: "2026-09-21T01:30:00.000Z",
      activeDropEffect: "moved",
      dropMutation: "update",
    });
  });

  it("resets an overdue active drop only when cadence changes", () => {
    const overdue = { ...drop, status: "overdue" as const };
    expect(plan({ localTime: "20:30" }, overdue)).toMatchObject({
      activeDropEffect: "overdue-reset",
      dropMutation: "update",
    });
    expect(plan({ reminderOffsetsMinutes: [60] }, overdue)).toMatchObject({
      activeDropEffect: "unchanged",
      dropMutation: "none",
    });
  });

  it("keeps local wall time across a daylight-saving boundary", () => {
    const dstSchedule = { ...schedule, startsOn: "2026-10-25", localTime: "09:00", rrule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=SU" };
    const result = planClubScheduleChange({
      clubId: "club-1",
      currentSchedule: dstSchedule,
      activeDrop: null,
      requested: { ...requested, startsOn: "2026-10-25", localTime: "09:00", interval: 2 },
      now: new Date("2026-10-30T12:00:00.000Z"),
    });
    expect(result.newNextDropIso).toBe("2026-11-08T15:00:00.000Z");
  });

  it("fails when a changed cadence has no future occurrence", () => {
    expect(() => planClubScheduleChange({
      clubId: "club-1",
      currentSchedule: { ...schedule, paused: true },
      activeDrop: null,
      requested: { ...requested, localTime: "23:59" },
      now: new Date("2026-09-17T12:00:00.000Z"),
    })).toThrow(ClubScheduleChangeError);
  });
});
