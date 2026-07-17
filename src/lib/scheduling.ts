import { DateTime } from "luxon";
import type { RecurrenceConfig } from "@/types/domain";

const weekdayTokens = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

export function toRRule(config: Omit<RecurrenceConfig, "rrule">): string {
  const parts = [
    `FREQ=${config.frequency.toUpperCase()}`,
    `INTERVAL=${config.interval}`,
  ];
  if (config.weekdays?.length) {
    parts.push(`BYDAY=${config.weekdays.map((day) => weekdayTokens[day - 1]).join(",")}`);
  }
  if (config.monthDays?.length) parts.push(`BYMONTHDAY=${config.monthDays.join(",")}`);
  if (config.ordinalWeekdays?.length) {
    parts.push(
      `BYDAY=${config.ordinalWeekdays
        .map(({ ordinal, weekday }) => `${ordinal}${weekdayTokens[weekday - 1]}`)
        .join(",")}`,
    );
  }
  return parts.join(";");
}

function matchesOrdinalWeekday(
  date: DateTime,
  rules: NonNullable<RecurrenceConfig["ordinalWeekdays"]>,
): boolean {
  return rules.some(({ ordinal, weekday }) => {
    if (date.weekday !== weekday) return false;
    if (ordinal === -1) return date.plus({ weeks: 1 }).month !== date.month;
    return Math.ceil(date.day / 7) === ordinal;
  });
}

function matches(config: RecurrenceConfig, date: DateTime, start: DateTime): boolean {
  if (date.startOf("day") < start.startOf("day")) return false;
  if (config.frequency === "daily") {
    return Math.floor(date.startOf("day").diff(start.startOf("day"), "days").days) % config.interval === 0;
  }
  if (config.frequency === "weekly") {
    const weeks = Math.floor(date.startOf("week").diff(start.startOf("week"), "weeks").weeks);
    return weeks % config.interval === 0 && (config.weekdays ?? [start.weekday]).includes(date.weekday);
  }
  const months = (date.year - start.year) * 12 + date.month - start.month;
  if (months % config.interval !== 0) return false;
  if (config.ordinalWeekdays?.length) return matchesOrdinalWeekday(date, config.ordinalWeekdays);
  return (config.monthDays ?? [start.day]).includes(date.day);
}

export function nextOccurrences(
  config: RecurrenceConfig,
  after: Date,
  count = 1,
): Date[] {
  if (config.paused || count <= 0) return [];
  const [hour, minute] = config.localTime.split(":").map(Number);
  const start = DateTime.fromISO(config.startsOn, { zone: config.timezone }).set({ hour, minute });
  const afterLocal = DateTime.fromJSDate(after, { zone: config.timezone });
  let cursor = DateTime.max(start.startOf("day"), afterLocal.startOf("day"));
  const results: Date[] = [];
  const maxDays = 366 * 20;

  for (let scanned = 0; scanned < maxDays && results.length < count; scanned += 1) {
    const candidate = cursor.set({ hour, minute, second: 0, millisecond: 0 });
    if (matches(config, cursor, start) && candidate > afterLocal) results.push(candidate.toUTC().toJSDate());
    cursor = cursor.plus({ days: 1 });
  }
  return results;
}

export function occurrenceKey(clubId: string, date: Date, version: number): string {
  return `${clubId}:${date.toISOString()}:v${version}`;
}
