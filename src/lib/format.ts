import { DateTime } from "luxon";

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

export function formatRelative(value: string) {
  return DateTime.fromISO(value).toRelative({ style: "short" }) ?? "recently";
}

export function scheduleLabel(rrule: string, localTime: string) {
  const frequency = rrule.match(/FREQ=([^;]+)/)?.[1]?.toLowerCase() ?? "custom";
  const days = rrule.match(/BYDAY=([^;]+)/)?.[1]?.replaceAll(",", " & ");
  const time = DateTime.fromFormat(localTime, "HH:mm").toFormat("h:mm a");
  return `${frequency}${days ? ` · ${days}` : ""} at ${time}`;
}
