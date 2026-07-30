import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DROP_REMINDER_OFFSETS,
  formatDropReminderOffset,
  hasDuplicateDropReminderFrequencies,
  normalizeDropReminderOffsets,
} from "@/lib/drop-reminder-settings";
import { deliverDropReminder } from "@/lib/drop-reminders";

describe("drop reminder settings", () => {
  it("defaults to one day and one hour before the drop", () => {
    expect(normalizeDropReminderOffsets(undefined)).toEqual(DEFAULT_DROP_REMINDER_OFFSETS);
  });

  it("deduplicates, validates, and orders a dynamic reminder list", () => {
    expect(normalizeDropReminderOffsets([60, 10_080, 1_440, 180, 60, 42]))
      .toEqual([10_080, 1_440, 180]);
    expect(normalizeDropReminderOffsets([])).toEqual([]);
  });

  it("detects duplicate reminder frequencies for API validation", () => {
    expect(hasDuplicateDropReminderFrequencies([2_880, 1_440])).toBe(true);
    expect(hasDuplicateDropReminderFrequencies([10_080, 1_440, 180])).toBe(false);
  });

  it("formats reminder lead times for notification copy", () => {
    expect(formatDropReminderOffset(1_440)).toBe("1 day");
    expect(formatDropReminderOffset(2_880)).toBe("2 days");
    expect(formatDropReminderOffset(60)).toBe("1 hour");
    expect(formatDropReminderOffset(180)).toBe("3 hours");
  });
});

describe("drop reminder delivery", () => {
  it("persists the account notification and sends browser push and email", async () => {
    const persistNotification = vi.fn().mockResolvedValue(true);
    const deliverBrowser = vi.fn().mockResolvedValue(undefined);
    const sendEmail = vi.fn().mockResolvedValue({ id: "email-1" });

    const notification = await deliverDropReminder({
      drop: { occurrenceKey: "club-1:2026-08-01T18:00:00.000Z:v3" },
      club: { name: "Needle Exchange", slug: "needle-exchange" },
      user: {
        id: "user-1",
        primaryEmail: "listener@example.com",
        emailNotifications: true,
      },
      offsetMinutes: 1_440,
      createdAt: "2026-07-31T18:00:00.000Z",
      persistNotification,
      delivery: { deliverBrowser, sendEmail },
    });

    expect(notification).toMatchObject({
      userId: "user-1",
      kind: "reminder",
      body: "1 day reminder for your freeform drop.",
      href: "/app/clubs/needle-exchange",
    });
    expect(persistNotification).toHaveBeenCalledWith(notification);
    expect(deliverBrowser).toHaveBeenCalledWith(notification);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      user: expect.objectContaining({ id: "user-1" }),
      kind: "reminder",
      subject: "Your Needle Exchange drop is coming up",
      idempotencyKey: notification.id,
    }));
  });

  it("keeps email idempotent and does not duplicate browser push on a task retry", async () => {
    const deliverBrowser = vi.fn().mockResolvedValue(undefined);
    const sendEmail = vi.fn().mockResolvedValue({ id: "email-1" });

    await deliverDropReminder({
      drop: { occurrenceKey: "club-1:2026-08-01T18:00:00.000Z:v3" },
      club: { name: "Needle Exchange", slug: "needle-exchange" },
      user: {
        id: "user-1",
        primaryEmail: "listener@example.com",
        emailNotifications: true,
      },
      offsetMinutes: 60,
      persistNotification: vi.fn().mockResolvedValue(false),
      delivery: { deliverBrowser, sendEmail },
    });

    expect(deliverBrowser).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: "notification_reminder_club-1:2026-08-01T18:00:00.000Z:v3_60",
    }));
  });
});
