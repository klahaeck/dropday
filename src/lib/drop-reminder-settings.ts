export const DROP_REMINDER_OPTIONS = [
  { minutes: 10_080, label: "1 week before" },
  { minutes: 4_320, label: "3 days before" },
  { minutes: 2_880, label: "2 days before" },
  { minutes: 1_440, label: "1 day before" },
  { minutes: 720, label: "12 hours before" },
  { minutes: 360, label: "6 hours before" },
  { minutes: 180, label: "3 hours before" },
  { minutes: 60, label: "1 hour before" },
] as const;

export type DropReminderOffset = (typeof DROP_REMINDER_OPTIONS)[number]["minutes"];

export const DEFAULT_DROP_REMINDER_OFFSETS: DropReminderOffset[] = [1_440, 60];

const DROP_REMINDER_OFFSET_VALUES = new Set<number>(
  DROP_REMINDER_OPTIONS.map((option) => option.minutes),
);

export function isDropReminderOffset(value: number): value is DropReminderOffset {
  return DROP_REMINDER_OFFSET_VALUES.has(value);
}

export function normalizeDropReminderOffsets(
  value: readonly number[] | null | undefined,
): DropReminderOffset[] {
  if (!Array.isArray(value)) return [...DEFAULT_DROP_REMINDER_OFFSETS];
  return [...new Set(value.filter(isDropReminderOffset))]
    .sort((left, right) => right - left)
    .slice(0, 2);
}

export function formatDropReminderOffset(offsetMinutes: number): string {
  if (offsetMinutes % 1_440 === 0) {
    const days = offsetMinutes / 1_440;
    return `${days} ${days === 1 ? "day" : "days"}`;
  }
  if (offsetMinutes % 60 === 0) {
    const hours = offsetMinutes / 60;
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  return `${offsetMinutes} ${offsetMinutes === 1 ? "minute" : "minutes"}`;
}
