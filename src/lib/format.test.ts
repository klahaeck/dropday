import { describe, expect, it } from "vitest";
import {
  formatRelative,
  formatWeekdayDate,
  getCountdownParts,
  getZonedGreeting,
} from "@/lib/format";

describe("dashboard time formatting", () => {
  it("formats the calendar date in the requested timezone", () => {
    const instant = "2026-07-17T00:30:00.000Z";
    expect(formatWeekdayDate(instant, "America/Chicago")).toBe("Thursday, July 16");
    expect(formatWeekdayDate(instant, "Europe/Paris")).toBe("Friday, July 17");
  });

  it.each([
    ["2026-07-16T16:59:00.000Z", "Good morning"],
    ["2026-07-16T17:00:00.000Z", "Good afternoon"],
    ["2026-07-16T23:00:00.000Z", "Good evening"],
  ])("uses zoned greeting boundaries for %s", (instant, expected) => {
    expect(getZonedGreeting(instant, "America/Chicago")).toBe(expected);
  });

  it("carries countdown units across multiple days", () => {
    expect(getCountdownParts(
      "2026-07-19T08:31:00.000Z",
      "2026-07-16T12:00:00.000Z",
    )).toEqual({ days: 2, hours: 20, minutes: 31, isDue: false });
  });

  it("keeps under-one-minute countdowns non-negative", () => {
    expect(getCountdownParts(
      "2026-07-16T12:00:30.000Z",
      "2026-07-16T12:00:00.000Z",
    )).toEqual({ days: 0, hours: 0, minutes: 0, isDue: false });
  });

  it("marks exact and past targets due without negative units", () => {
    expect(getCountdownParts(
      "2026-07-16T12:00:00.000Z",
      "2026-07-16T12:00:00.000Z",
    )).toEqual({ days: 0, hours: 0, minutes: 0, isDue: true });
    expect(getCountdownParts(
      "2026-07-15T12:00:00.000Z",
      "2026-07-16T12:00:00.000Z",
    )).toEqual({ days: 0, hours: 0, minutes: 0, isDue: true });
  });

  it("formats notification age from a deterministic base instant", () => {
    expect(formatRelative(
      "2026-07-14T06:00:00.000Z",
      "2026-07-16T12:00:00.000Z",
    )).toBe("2 days ago");
  });

  it("returns null for invalid instants", () => {
    expect(formatWeekdayDate("not-a-date", "America/Chicago")).toBeNull();
    expect(getZonedGreeting("not-a-date", "America/Chicago")).toBeNull();
    expect(getCountdownParts("not-a-date", "2026-07-16T12:00:00.000Z")).toBeNull();
    expect(formatRelative("not-a-date", "2026-07-16T12:00:00.000Z")).toBeNull();
    expect(formatRelative("2026-07-16T12:00:00.000Z", "not-a-date")).toBeNull();
  });
});
