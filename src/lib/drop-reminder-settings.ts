export const DROP_REMINDER_OPTIONS = [
  { minutes: 10_080, frequency: "week", label: "1 week before" },
  { minutes: 4_320, frequency: "day", label: "3 days before" },
  { minutes: 2_880, frequency: "day", label: "2 days before" },
  { minutes: 1_440, frequency: "day", label: "1 day before" },
  { minutes: 720, frequency: "hour", label: "12 hours before" },
  { minutes: 360, frequency: "hour", label: "6 hours before" },
  { minutes: 180, frequency: "hour", label: "3 hours before" },
  { minutes: 60, frequency: "hour", label: "1 hour before" },
] as const;

export type DropReminderOffset = (typeof DROP_REMINDER_OPTIONS)[number]["minutes"];
export type DropReminderFrequency = (typeof DROP_REMINDER_OPTIONS)[number]["frequency"];

export const DEFAULT_DROP_REMINDER_OFFSETS: DropReminderOffset[] = [1_440, 60];
export const MAX_DROP_REMINDERS = new Set(
  DROP_REMINDER_OPTIONS.map((option) => option.frequency),
).size;

const DROP_REMINDER_OFFSET_VALUES = new Set<number>(
  DROP_REMINDER_OPTIONS.map((option) => option.minutes),
);

export function isDropReminderOffset(value: unknown): value is DropReminderOffset {
  return typeof value === "number" && DROP_REMINDER_OFFSET_VALUES.has(value);
}

export function getDropReminderFrequency(
  offset: DropReminderOffset,
): DropReminderFrequency {
  return DROP_REMINDER_OPTIONS.find((option) => option.minutes === offset)!.frequency;
}

export function normalizeDropReminderOffsets(
  value: readonly number[] | null | undefined,
): DropReminderOffset[] {
  if (!Array.isArray(value)) return [...DEFAULT_DROP_REMINDER_OFFSETS];
  const frequencies = new Set<DropReminderFrequency>();
  return [...new Set(value.filter(isDropReminderOffset))]
    .sort((left, right) => right - left)
    .filter((offset) => {
      const frequency = getDropReminderFrequency(offset);
      if (frequencies.has(frequency)) return false;
      frequencies.add(frequency);
      return true;
    });
}

export function hasDuplicateDropReminderFrequencies(
  value: readonly DropReminderOffset[],
): boolean {
  const frequencies = value.map(getDropReminderFrequency);
  return new Set(frequencies).size !== frequencies.length;
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
