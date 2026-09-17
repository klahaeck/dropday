import { DateTime } from "luxon";

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  isDue: boolean;
}

function parseInstant(value: string) {
  const dateTime = DateTime.fromISO(value, { setZone: true });
  return dateTime.isValid ? dateTime : null;
}

export function formatWeekdayDate(
  value: string,
  timezone = "America/Chicago",
) {
  const dateTime = parseInstant(value)?.setZone(timezone);
  return dateTime?.isValid ? dateTime.toFormat("cccc, LLLL d") : null;
}

export function getZonedGreeting(
  value: string,
  timezone = "America/Chicago",
) {
  const dateTime = parseInstant(value)?.setZone(timezone);
  if (!dateTime?.isValid) return null;
  if (dateTime.hour < 12) return "Good morning";
  if (dateTime.hour < 18) return "Good afternoon";
  return "Good evening";
}

export function getCountdownParts(
  targetIso: string,
  nowIso: string,
): CountdownParts | null {
  const target = parseInstant(targetIso);
  const now = parseInstant(nowIso);
  if (!target || !now) return null;

  const difference = target.toMillis() - now.toMillis();
  const totalMinutes = Math.floor(Math.max(0, difference) / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  return { days, hours, minutes, isDue: difference <= 0 };
}

export function formatDateTime(value: string, timezone = "America/Chicago") {
  return DateTime.fromISO(value).setZone(timezone).toLocaleString({
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDateTimeParts(value: string, timezone = "America/Chicago") {
  const dateTime = DateTime.fromISO(value).setZone(timezone);

  return {
    date: dateTime.toFormat("ccc LLL d"),
    time: dateTime.toLocaleString({
      hour: "numeric",
      minute: "2-digit",
    }),
  };
}

export function formatRelative(value: string, baseInstant?: string) {
  const dateTime = parseInstant(value);
  const base = baseInstant ? parseInstant(baseInstant) : DateTime.now();
  if (!dateTime || !base?.isValid) return null;
  return dateTime.toRelative({ base, style: "short" });
}

export function scheduleLabel(rrule: string, localTime: string) {
  const frequency = rrule.match(/FREQ=([^;]+)/)?.[1]?.toLowerCase() ?? "custom";
  const days = rrule.match(/BYDAY=([^;]+)/)?.[1]?.replaceAll(",", " & ");
  const time = DateTime.fromFormat(localTime, "HH:mm").toFormat("h:mm a");
  return `${frequency}${days ? ` · ${days}` : ""} at ${time}`;
}
