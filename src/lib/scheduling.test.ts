import { describe, expect, it } from "vitest";
import { createAnchoredRecurrence, nextOccurrences, toRRule } from "@/lib/scheduling";
import type { RecurrenceConfig } from "@/types/domain";

const base: RecurrenceConfig = {
  timezone: "America/Chicago",
  startsOn: "2026-01-06",
  localTime: "09:00",
  frequency: "weekly",
  interval: 1,
  weekdays: [2],
  rrule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=TU",
  reminderOffsetsMinutes: [1440, 60],
  version: 1,
  paused: false,
};

describe("recurrence scheduling", () => {
  it("supports several weekdays in one weekly cycle", () => {
    const config = { ...base, weekdays: [2, 5], rrule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=TU,FR" };
    const results = nextOccurrences(config, new Date("2026-07-13T12:00:00Z"), 4);
    expect(results.map((date) => date.toISOString())).toEqual([
      "2026-07-14T14:00:00.000Z",
      "2026-07-17T14:00:00.000Z",
      "2026-07-21T14:00:00.000Z",
      "2026-07-24T14:00:00.000Z",
    ]);
  });

  it("keeps the local wall clock time across daylight-saving time", () => {
    const config = { ...base, startsOn: "2026-03-01", weekdays: [7], localTime: "09:00" };
    const results = nextOccurrences(config, new Date("2026-03-01T16:00:00Z"), 2);
    expect(results[0].toISOString()).toBe("2026-03-08T14:00:00.000Z");
    expect(results[1].toISOString()).toBe("2026-03-15T14:00:00.000Z");
  });

  it("supports last-weekday monthly rules", () => {
    const config: RecurrenceConfig = {
      ...base,
      startsOn: "2026-01-01",
      frequency: "monthly",
      weekdays: undefined,
      ordinalWeekdays: [{ ordinal: -1, weekday: 5 }],
      rrule: "FREQ=MONTHLY;INTERVAL=1;BYDAY=-1FR",
    };
    expect(nextOccurrences(config, new Date("2026-06-01T00:00:00Z"), 2).map((date) => date.toISOString())).toEqual([
      "2026-06-26T14:00:00.000Z",
      "2026-07-31T14:00:00.000Z",
    ]);
  });

  it("creates a normalized RRULE", () => {
    const { rrule, ...config } = { ...base, weekdays: [2, 5] };
    expect(rrule).toBe(base.rrule);
    expect(toRRule(config)).toBe("FREQ=WEEKLY;INTERVAL=1;BYDAY=TU,FR");
  });

  it.each([
    ["daily", "2026-07-29", "FREQ=DAILY;INTERVAL=3"],
    ["weekly", "2026-07-29", "FREQ=WEEKLY;INTERVAL=3;BYDAY=WE"],
    ["monthly", "2026-07-29", "FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=29"],
  ] as const)("anchors an every-three-%s ritual to its start date", (frequency, startsOn, rrule) => {
    const schedule = createAnchoredRecurrence({
      timezone: "America/Chicago",
      startsOn,
      localTime: "18:30",
      frequency,
      interval: 3,
      reminderOffsetsMinutes: [1440, 60],
      version: 2,
      paused: false,
    });

    expect(schedule.rrule).toBe(rrule);
    expect(schedule.weekdays).toEqual(frequency === "weekly" ? [3] : undefined);
    expect(schedule.monthDays).toEqual(frequency === "monthly" ? [29] : undefined);
  });
});
