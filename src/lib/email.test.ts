import { describe, expect, it } from "vitest";
import { sendDropdayEmail } from "@/lib/email";
import { DEFAULT_EMAIL_PREFERENCES } from "@/lib/email-preferences";

describe("Dropday email delivery", () => {
  it("stops a disabled category before reaching the email integration", async () => {
    await expect(sendDropdayEmail({
      user: {
        primaryEmail: "member@example.com",
        emailNotifications: true,
        emailPreferences: {
          ...DEFAULT_EMAIL_PREFERENCES,
          reminders: false,
        },
      },
      kind: "reminder",
      subject: "Your drop is coming up",
      heading: "You’re almost up.",
      body: "Your playlist is due tomorrow.",
      idempotencyKey: "notification-reminder-1",
    })).resolves.toEqual({ skipped: true, reason: "preference" });
  });

  it("stops delivery when the profile has no email address", async () => {
    await expect(sendDropdayEmail({
      user: {
        emailNotifications: true,
        emailPreferences: DEFAULT_EMAIL_PREFERENCES,
      },
      kind: "published",
      subject: "A new playlist landed",
      heading: "Needle down.",
      body: "A new playlist is ready for the club.",
      idempotencyKey: "notification-published-1",
    })).resolves.toEqual({ skipped: true, reason: "missing-address" });
  });
});
