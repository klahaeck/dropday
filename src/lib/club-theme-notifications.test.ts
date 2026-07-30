import { describe, expect, it } from "vitest";
import {
  buildCurrentThemeNotifications,
  currentThemeEmailRecipients,
} from "@/lib/club-theme-notifications";
import { DEFAULT_EMAIL_PREFERENCES } from "@/lib/email-preferences";
import type { UserProfile } from "@/types/domain";

const timestamp = "2026-07-30T15:00:00.000Z";

function user(
  id: string,
  overrides: Partial<UserProfile> = {},
): UserProfile {
  return {
    id,
    clerkUserId: `clerk-${id}`,
    displayName: id,
    initials: id.slice(0, 2).toUpperCase(),
    primaryEmail: `${id}@example.com`,
    plan: "free",
    emailNotifications: true,
    emailPreferences: DEFAULT_EMAIL_PREFERENCES,
    themePreference: "system",
    skinPreference: "classic",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

describe("current club theme notifications", () => {
  it("builds one account notification for every unique active member", () => {
    const notifications = buildCurrentThemeNotifications({
      club: { id: "club-1", slug: "needle-exchange", name: "Needle Exchange" },
      theme: {
        name: "Heatwave at midnight",
        version: 4,
        updatedAt: timestamp,
      },
      memberships: [
        { userId: "user-owner" },
        { userId: "user-member" },
        { userId: "user-member" },
      ],
      timestamp,
    });

    expect(notifications).toHaveLength(2);
    expect(notifications.map((notification) => notification.userId)).toEqual([
      "user-owner",
      "user-member",
    ]);
    expect(notifications[0]).toMatchObject({
      kind: "theme",
      title: "New theme in Needle Exchange",
      body: "Heatwave at midnight is now the current theme for Needle Exchange.",
      href: "/app/clubs/needle-exchange",
      createdAt: timestamp,
    });
  });

  it("emails only members whose club activity setting is enabled", () => {
    const enabled = user("enabled");
    const disabledClubActivity = user("disabled-club", {
      emailPreferences: {
        ...DEFAULT_EMAIL_PREFERENCES,
        clubActivity: false,
      },
    });
    const disabledLegacy = user("disabled-legacy", {
      emailNotifications: false,
      emailPreferences: undefined,
    });
    const noAddress = user("no-address", { primaryEmail: undefined });
    const disabledOtherCategory = user("disabled-reminders", {
      emailPreferences: {
        ...DEFAULT_EMAIL_PREFERENCES,
        reminders: false,
      },
    });

    expect(currentThemeEmailRecipients([
      enabled,
      disabledClubActivity,
      disabledLegacy,
      noAddress,
      disabledOtherCategory,
    ]).map((profile) => profile.id)).toEqual([
      "enabled",
      "disabled-reminders",
    ]);
  });
});
