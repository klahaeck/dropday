import { normalizeDropReminderOffsets } from "@/lib/drop-reminder-settings";
import { createAnchoredRecurrence, nextOccurrences } from "@/lib/scheduling";
import type { DropSlot, RecurrenceConfig } from "@/types/domain";

export interface RequestedClubSchedule {
  timezone: string;
  startsOn: string;
  localTime: string;
  frequency: RecurrenceConfig["frequency"];
  interval: number;
  reminderOffsetsMinutes: number[];
}

export type ActiveDropEffect =
  | "none"
  | "unchanged"
  | "moved"
  | "overdue-reset"
  | "created";

export interface ClubScheduleChangePlan {
  changed: boolean;
  cadenceChanged: boolean;
  remindersChanged: boolean;
  currentScheduleVersion: number;
  nextScheduleVersion: number;
  expectedActiveDropId: string | null;
  expectedActiveDropStatus: DropSlot["status"] | null;
  expectedActiveDropAssigneeId: string | null;
  oldNextDropIso: string | null;
  newNextDropIso: string | null;
  activeDropEffect: ActiveDropEffect;
  dropMutation: "none" | "update" | "create";
  needsNewDrop: boolean;
  remindersAdded: number[];
  remindersRemoved: number[];
  schedule: RecurrenceConfig;
}

export class ClubScheduleChangeError extends Error {}

export function planClubScheduleChange({
  clubId,
  currentSchedule,
  activeDrop,
  requested,
  now,
}: {
  clubId: string;
  currentSchedule: RecurrenceConfig;
  activeDrop: DropSlot | null;
  requested: RequestedClubSchedule;
  now: Date;
}): ClubScheduleChangePlan {
  const currentReminders = normalizeDropReminderOffsets(currentSchedule.reminderOffsetsMinutes);
  const nextReminders = normalizeDropReminderOffsets(requested.reminderOffsetsMinutes);
  const candidateSchedule = createAnchoredRecurrence({
    timezone: requested.timezone,
    startsOn: requested.startsOn,
    localTime: requested.localTime,
    frequency: requested.frequency,
    interval: requested.interval,
    reminderOffsetsMinutes: nextReminders,
    version: currentSchedule.version,
    paused: currentSchedule.paused,
  });
  const cadenceChanged = candidateSchedule.timezone !== currentSchedule.timezone
    || candidateSchedule.startsOn !== currentSchedule.startsOn
    || candidateSchedule.localTime !== currentSchedule.localTime
    || candidateSchedule.frequency !== currentSchedule.frequency
    || candidateSchedule.interval !== currentSchedule.interval
    || candidateSchedule.rrule !== currentSchedule.rrule;
  const remindersChanged = nextReminders.length !== currentReminders.length
    || nextReminders.some((offset, index) => offset !== currentReminders[index]);
  const changed = cadenceChanged || remindersChanged;
  const nextScheduleVersion = changed ? currentSchedule.version + 1 : currentSchedule.version;
  const schedule = { ...candidateSchedule, version: nextScheduleVersion };
  const oldNextDropIso = activeDrop?.scheduledFor ?? null;

  let newNextDropIso = oldNextDropIso;
  if (cadenceChanged) {
    const nextDate = nextOccurrences(schedule, new Date(now.getTime() - 1_000), 1)[0];
    if (!nextDate) throw new ClubScheduleChangeError(`Could not find the next drop date for ${clubId}.`);
    newNextDropIso = nextDate.toISOString();
  }

  let activeDropEffect: ActiveDropEffect = activeDrop ? "unchanged" : "none";
  let dropMutation: ClubScheduleChangePlan["dropMutation"] = "none";
  if (changed) {
    if (newNextDropIso && activeDrop && (
      activeDrop.status === "scheduled"
      || (cadenceChanged && activeDrop.status === "overdue")
    )) {
      dropMutation = "update";
      if (activeDrop.status === "overdue") activeDropEffect = "overdue-reset";
      else if (newNextDropIso !== activeDrop.scheduledFor) activeDropEffect = "moved";
    } else if (cadenceChanged && newNextDropIso) {
      dropMutation = "create";
      activeDropEffect = "created";
    }
  }

  return {
    changed,
    cadenceChanged,
    remindersChanged,
    currentScheduleVersion: currentSchedule.version,
    nextScheduleVersion,
    expectedActiveDropId: activeDrop?.id ?? null,
    expectedActiveDropStatus: activeDrop?.status ?? null,
    expectedActiveDropAssigneeId: activeDrop?.assignedUserId ?? null,
    oldNextDropIso,
    newNextDropIso,
    activeDropEffect,
    dropMutation,
    needsNewDrop: dropMutation === "create",
    remindersAdded: nextReminders.filter((offset) => !currentReminders.includes(offset)),
    remindersRemoved: currentReminders.filter((offset) => !nextReminders.includes(offset)),
    schedule,
  };
}
