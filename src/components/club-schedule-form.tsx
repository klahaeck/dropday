"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { TimezoneField } from "@/components/timezone-field";
import {
  DROP_REMINDER_OPTIONS,
  getDropReminderFrequency,
  isDropReminderOffset,
  MAX_DROP_REMINDERS,
  normalizeDropReminderOffsets,
  type DropReminderOffset,
} from "@/lib/drop-reminder-settings";
import { formatDateTime } from "@/lib/format";
import type { ActiveDropEffect } from "@/lib/club-schedule-change";
import type { DropStatus, RecurrenceConfig } from "@/types/domain";

export interface ClubSchedulePreview {
  changed: boolean;
  cadenceChanged: boolean;
  remindersChanged: boolean;
  currentScheduleVersion: number;
  expectedScheduleVersion?: number;
  nextScheduleVersion: number;
  expectedActiveDropId: string | null;
  expectedActiveDropStatus: DropStatus | null;
  expectedActiveDropAssigneeId: string | null;
  expectedNewNextDropIso: string | null;
  oldNextDropIso: string | null;
  newNextDropIso: string | null;
  activeDropEffect: ActiveDropEffect;
  remindersAdded: number[];
  remindersRemoved: number[];
  schedule: RecurrenceConfig;
  assigneeName: string | null;
  warning?: string;
}

function reminderLabel(offset: number) {
  return DROP_REMINDER_OPTIONS.find((option) => option.minutes === offset)?.label
    ?? `${offset.toLocaleString()} minutes before`;
}

export function scheduleCommitLabel(preview: ClubSchedulePreview) {
  if (preview.activeDropEffect === "overdue-reset") return "Save and reset overdue drop";
  if (preview.activeDropEffect === "moved") return "Move drop and save schedule";
  if (preview.activeDropEffect === "created") return "Create next drop and save schedule";
  if (!preview.cadenceChanged && preview.remindersChanged) return "Save reminder changes";
  return "Save schedule";
}

export function SchedulePreviewDetails({
  preview,
  currentTimezone,
}: {
  preview: ClubSchedulePreview;
  currentTimezone: string;
}) {
  const oldTime = preview.oldNextDropIso
    ? formatDateTime(preview.oldNextDropIso, currentTimezone)
    : null;
  const newTime = preview.newNextDropIso
    ? formatDateTime(preview.newNextDropIso, preview.schedule.timezone)
    : null;
  return <div className="schedule-preview-details">
    {preview.assigneeName && <p><strong>Assigned member:</strong> {preview.assigneeName}</p>}
    {preview.cadenceChanged
      ? <p><strong>Next drop:</strong> {oldTime ?? "Not scheduled"} → {newTime ?? "Not scheduled"}</p>
      : preview.remindersChanged && <p><strong>Next drop:</strong> Due time unchanged{oldTime ? ` (${oldTime})` : ""}.</p>}
    {preview.activeDropEffect === "overdue-reset" && <p className="schedule-preview-warning">The overdue drop will return to scheduled status at the new time.</p>}
    {preview.activeDropEffect === "created" && <p>A new active drop will be created without changing the queue order.</p>}
    {preview.remindersAdded.length > 0 && <p><strong>Add reminders:</strong> {preview.remindersAdded.map(reminderLabel).join(", ")}</p>}
    {preview.remindersRemoved.length > 0 && <p><strong>Remove reminders:</strong> {preview.remindersRemoved.map(reminderLabel).join(", ")}</p>}
  </div>;
}

export function ClubScheduleForm({
  clubSlug,
  schedule,
}: {
  clubSlug: string;
  schedule: RecurrenceConfig;
}) {
  const [baseline, setBaseline] = useState(schedule);
  const [startsOn, setStartsOn] = useState(schedule.startsOn);
  const [localTime, setLocalTime] = useState(schedule.localTime);
  const [timezone, setTimezone] = useState(schedule.timezone);
  const [frequency, setFrequency] = useState<RecurrenceConfig["frequency"]>(schedule.frequency);
  const [interval, setInterval] = useState(String(schedule.interval));
  const [preview, setPreview] = useState<ClubSchedulePreview>();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const nextReminderId = useRef(MAX_DROP_REMINDERS);
  const [reminders, setReminders] = useState<Array<{ id: number; offset: DropReminderOffset | "" }>>(
    () => normalizeDropReminderOffsets(schedule.reminderOffsetsMinutes)
      .map((offset, index) => ({ id: index, offset })),
  );
  const router = useRouter();

  function addReminder() {
    setReminders((current) => [...current, { id: nextReminderId.current++, offset: "" }]);
  }

  function updateReminder(id: number, value: string) {
    const offset = Number(value);
    if (!isDropReminderOffset(offset)) return;
    setReminders((current) => {
      const frequencyGroup = getDropReminderFrequency(offset);
      if (current.some((item) => item.id !== id && item.offset !== "" && getDropReminderFrequency(item.offset) === frequencyGroup)) return current;
      return current.map((item) => item.id === id ? { ...item, offset } : item);
    });
  }

  function body() {
    return {
      startsOn,
      localTime,
      timezone,
      frequency,
      interval: Number(interval),
      reminderOffsetsMinutes: normalizeDropReminderOffsets(
        reminders.map((item) => item.offset).filter(isDropReminderOffset),
      ),
    };
  }

  async function requestPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(undefined);
    setNotice(undefined);
    try {
      const response = await fetch(`/api/clubs/${encodeURIComponent(clubSlug)}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body()),
      });
      const result = (await response.json()) as ClubSchedulePreview & { error?: string };
      setLoading(false);
      if (!response.ok) {
        setMessage(result.error ?? "Could not preview this schedule.");
        return;
      }
      if (!result.changed) {
        setPreview(undefined);
        setNotice("No schedule or reminder changes to save.");
        return;
      }
      setPreview(result);
    } catch {
      setLoading(false);
      setMessage("Could not preview this schedule. Check your connection and try again.");
    }
  }

  async function commit() {
    if (!preview) return;
    setLoading(true);
    setMessage(undefined);
    setNotice(undefined);
    try {
      const response = await fetch(`/api/clubs/${encodeURIComponent(clubSlug)}/schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body(),
          confirmed: true,
          expectedScheduleVersion: preview.expectedScheduleVersion ?? preview.currentScheduleVersion,
          expectedActiveDropId: preview.expectedActiveDropId,
          expectedActiveDropStatus: preview.expectedActiveDropStatus,
          expectedActiveDropAssigneeId: preview.expectedActiveDropAssigneeId,
          expectedNewNextDropIso: preview.newNextDropIso,
        }),
      });
      const result = (await response.json()) as ClubSchedulePreview & { error?: string };
      setLoading(false);
      setPreview(undefined);
      if (!response.ok) {
        setMessage(response.status === 409
          ? "The schedule changed while you were reviewing it. Preview the changes again."
          : result.error ?? "Could not save this schedule.");
        return;
      }
      setBaseline(result.schedule);
      setNotice(result.warning
        ? `${result.warning} Review the active drop; adjust and save the schedule again to retry task setup.`
        : "Schedule saved.");
      router.refresh();
    } catch {
      setLoading(false);
      setPreview(undefined);
      setMessage("Could not save this schedule. Preview it again before retrying.");
    }
  }

  const intervalNumber = Number(interval);
  return <>
    <form className="form-shell club-schedule-form" onSubmit={requestPreview}>
      <section className="form-section" id="schedule"><span className="section-kicker">Schedule</span><h2>Drop ritual</h2><p>Preview cadence and reminder consequences before changing the active drop.</p><div className="form-grid"><div className="field"><label htmlFor="schedule-starts-on">Start date</label><input id="schedule-starts-on" type="date" required value={startsOn} onChange={(event) => setStartsOn(event.target.value)} /></div><div className="field"><label htmlFor="schedule-local-time">Start time</label><input id="schedule-local-time" type="time" required value={localTime} onChange={(event) => setLocalTime(event.target.value)} /></div><div className="field"><label htmlFor="schedule-timezone">Timezone</label><TimezoneField id="schedule-timezone" value={timezone} onValueChange={setTimezone} /></div><div className="field ritual-repeat-field"><label htmlFor="schedule-interval" id="schedule-repeat-label">Repeat</label><div className="ritual-repeat-row" role="group" aria-labelledby="schedule-repeat-label"><span>Every</span><input id="schedule-interval" type="number" min="1" max="52" required aria-label="Repeat interval" value={interval} onChange={(event) => setInterval(event.target.value)} /><select aria-label="Repeat unit" value={frequency} onChange={(event) => setFrequency(event.target.value as RecurrenceConfig["frequency"])}><option value="daily">{intervalNumber === 1 ? "day" : "days"}</option><option value="weekly">{intervalNumber === 1 ? "week" : "weeks"}</option><option value="monthly">{intervalNumber === 1 ? "month" : "months"}</option></select></div></div></div></section>
      <section className="form-section"><span className="section-kicker">Notifications</span><h2>Next drop reminders</h2><div className="drop-reminder-list">{reminders.length === 0 && <p className="drop-reminder-empty">No reminders set. Add one when you want Dropday to contact the assigned member.</p>}{reminders.map((selection, index) => <div className="drop-reminder-row" key={selection.id}><div className="field"><label htmlFor={`schedule-reminder-${selection.id}`}>Reminder {index + 1}</label><select id={`schedule-reminder-${selection.id}`} value={selection.offset} onChange={(event) => updateReminder(selection.id, event.target.value)} required><option value="" disabled>Choose a reminder time</option>{DROP_REMINDER_OPTIONS.map((option) => <option value={option.minutes} key={option.minutes} disabled={reminders.some((other) => other.id !== selection.id && other.offset !== "" && getDropReminderFrequency(other.offset) === option.frequency)}>{option.label}</option>)}</select></div><button type="button" className="button button-ghost button-small drop-reminder-remove" aria-label={`Remove reminder ${index + 1}`} onClick={() => setReminders((current) => current.filter((item) => item.id !== selection.id))}><Trash2 size={15} /></button></div>)}<div className="drop-reminder-actions"><button type="button" className="button button-ghost button-small" onClick={addReminder} disabled={reminders.length >= MAX_DROP_REMINDERS || reminders.some((item) => item.offset === "")}><Plus size={15} /> Add reminder</button><span className="form-note">Add at most one weekly, daily, and hourly reminder.</span></div></div></section>
      {message && <p className="form-note form-error" role="alert">{message}</p>}
      {notice && <p className="form-note schedule-save-notice" role="status">{notice}</p>}
      <div className="form-actions"><button className="button button-dark" disabled={loading}>{loading ? "Reviewing…" : "Review changes"}</button></div>
    </form>
    <ConfirmationDialog open={Boolean(preview)} title="Review schedule changes" description={preview ? <SchedulePreviewDetails preview={preview} currentTimezone={baseline.timezone} /> : null} confirmLabel={preview ? scheduleCommitLabel(preview) : "Save schedule"} pending={loading} onCancel={() => setPreview(undefined)} onConfirm={commit} />
  </>;
}
