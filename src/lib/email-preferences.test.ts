import { describe, expect, it } from "vitest";
import {
  DEFAULT_EMAIL_PREFERENCES,
  emailPreferenceForNotification,
  normalizeEmailPreferences,
  shouldSendDropdayEmail,
} from "@/lib/email-preferences";
import type { EmailPreferences, NotificationKind, UserProfile } from "@/types/domain";

const profile = {
  primaryEmail: "member@example.com",
  emailNotifications: true,
} satisfies Pick<UserProfile, "primaryEmail" | "emailNotifications">;

describe("email preferences", () => {
  it("keeps email enabled for legacy profiles that used the global on flag", () => {
    expect(normalizeEmailPreferences(profile)).toEqual(DEFAULT_EMAIL_PREFERENCES);
  });

  it("keeps email disabled for legacy profiles that used the global off flag", () => {
    expect(normalizeEmailPreferences({
      ...profile,
      emailNotifications: false,
    })).toEqual({
      assignments: false,
      reminders: false,
      clubActivity: false,
      membership: false,
      billing: false,
    });
  });

  it("maps every notification kind to a granular preference", () => {
    const kinds: NotificationKind[] = [
      "invitation",
      "membership",
      "mention",
      "assignment",
      "theme",
      "reminder",
      "published",
      "overdue",
      "entitlement",
      "custody",
      "billing",
    ];

    expect(kinds.map(emailPreferenceForNotification)).toEqual([
      "membership",
      "membership",
      "clubActivity",
      "assignments",
      "clubActivity",
      "reminders",
      "clubActivity",
      "reminders",
      "billing",
      "billing",
      "billing",
    ]);
  });

  it("blocks only the disabled category and profiles without an address", () => {
    const emailPreferences: EmailPreferences = {
      ...DEFAULT_EMAIL_PREFERENCES,
      reminders: false,
    };

    expect(shouldSendDropdayEmail({ ...profile, emailPreferences }, "reminder")).toBe(false);
    expect(shouldSendDropdayEmail({ ...profile, emailPreferences }, "published")).toBe(true);
    expect(shouldSendDropdayEmail({
      emailNotifications: true,
      emailPreferences,
    }, "published")).toBe(false);
  });
});
