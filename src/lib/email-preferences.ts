import type {
  EmailPreferenceKey,
  EmailPreferences,
  NotificationKind,
  UserProfile,
} from "@/types/domain";

export const EMAIL_PREFERENCE_KEYS = [
  "assignments",
  "reminders",
  "clubActivity",
  "membership",
  "billing",
] as const satisfies readonly EmailPreferenceKey[];

export const DEFAULT_EMAIL_PREFERENCES: EmailPreferences = {
  assignments: true,
  reminders: true,
  clubActivity: true,
  membership: true,
  billing: true,
};

const preferenceForNotificationKind: Record<NotificationKind, EmailPreferenceKey> = {
  invitation: "membership",
  membership: "membership",
  mention: "clubActivity",
  assignment: "assignments",
  theme: "clubActivity",
  reminder: "reminders",
  published: "clubActivity",
  overdue: "reminders",
  entitlement: "billing",
  custody: "billing",
  billing: "billing",
};

type EmailPreferenceProfile = Pick<
  UserProfile,
  "emailNotifications" | "emailPreferences" | "primaryEmail"
>;

export function normalizeEmailPreferences(
  profile: Pick<EmailPreferenceProfile, "emailNotifications" | "emailPreferences">,
): EmailPreferences {
  const legacyDefault = profile.emailNotifications !== false;
  return Object.fromEntries(
    EMAIL_PREFERENCE_KEYS.map((key) => [
      key,
      typeof profile.emailPreferences?.[key] === "boolean"
        ? profile.emailPreferences[key]
        : legacyDefault,
    ]),
  ) as EmailPreferences;
}

export function emailPreferenceForNotification(kind: NotificationKind): EmailPreferenceKey {
  return preferenceForNotificationKind[kind];
}

export function shouldSendDropdayEmail(
  profile: EmailPreferenceProfile,
  kind: NotificationKind,
): profile is EmailPreferenceProfile & { primaryEmail: string } {
  if (!profile.primaryEmail) return false;
  const preferences = normalizeEmailPreferences(profile);
  return preferences[emailPreferenceForNotification(kind)];
}
