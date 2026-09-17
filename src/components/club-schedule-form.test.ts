import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ClubScheduleForm,
  SchedulePreviewDetails,
  scheduleCommitLabel,
  type ClubSchedulePreview,
} from "@/components/club-schedule-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const schedule = {
  timezone: "America/Chicago",
  startsOn: "2026-09-20",
  localTime: "19:30",
  frequency: "weekly" as const,
  interval: 1,
  weekdays: [7],
  rrule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=SU",
  reminderOffsetsMinutes: [1440, 60],
  version: 3,
  paused: false,
};
const preview: ClubSchedulePreview = {
  changed: true,
  cadenceChanged: true,
  remindersChanged: true,
  currentScheduleVersion: 3,
  nextScheduleVersion: 4,
  expectedActiveDropId: "drop-1",
  expectedActiveDropStatus: "scheduled",
  expectedActiveDropAssigneeId: "user-1",
  expectedNewNextDropIso: "2026-09-21T01:30:00.000Z",
  oldNextDropIso: "2026-09-20T00:30:00.000Z",
  newNextDropIso: "2026-09-21T01:30:00.000Z",
  activeDropEffect: "moved",
  remindersAdded: [10080],
  remindersRemoved: [1440],
  schedule: { ...schedule, localTime: "20:30", reminderOffsetsMinutes: [10080, 60], version: 4 },
  assigneeName: "Alex Listener",
};

describe("ClubScheduleForm", () => {
  it("renders a preview-first form with preserved schedule values", () => {
    const html = renderToStaticMarkup(createElement(ClubScheduleForm, { clubSlug: "needle-exchange", schedule }));
    expect(html).toContain("Review changes");
    expect(html).not.toContain("Save schedule");
    expect(html).toContain('value="America/Chicago"');
  });

  it("shows truthful failed automation state with an idempotent retry action", () => {
    const html = renderToStaticMarkup(createElement(ClubScheduleForm, {
      clubSlug: "needle-exchange",
      schedule,
      initialDispatchState: { status: "failed", attempts: 2, retryable: true },
    }));
    expect(html).toContain("Drop tasks need attention");
    expect(html).toContain("Automatic retries remain active");
    expect(html).toContain("Retry task scheduling");
  });

  it("renders timing, assignee, and reminder consequences", () => {
    const html = renderToStaticMarkup(createElement(SchedulePreviewDetails, { preview, currentTimezone: schedule.timezone }));
    expect(html).toContain("Alex Listener");
    expect(html).toContain("→");
    expect(html).toContain("Add reminders");
    expect(html).toContain("Remove reminders");
    expect(scheduleCommitLabel(preview)).toBe("Move drop and save schedule");
  });

  it("states reminder-only timing and overdue reset explicitly", () => {
    const reminderOnly = { ...preview, cadenceChanged: false, activeDropEffect: "unchanged" as const };
    const overdue = { ...preview, activeDropEffect: "overdue-reset" as const };
    expect(renderToStaticMarkup(createElement(SchedulePreviewDetails, { preview: reminderOnly, currentTimezone: schedule.timezone }))).toContain("Due time unchanged");
    expect(renderToStaticMarkup(createElement(SchedulePreviewDetails, { preview: overdue, currentTimezone: schedule.timezone }))).toContain("overdue drop will return to scheduled");
    expect(scheduleCommitLabel(overdue)).toBe("Save and reset overdue drop");
  });
});
