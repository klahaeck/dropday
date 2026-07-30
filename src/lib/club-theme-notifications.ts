import { deliverBrowserNotifications } from "@/lib/browser-push";
import { shouldSendDropdayEmail } from "@/lib/email-preferences";
import { sendDropdayEmail } from "@/lib/email";
import { createId, getUsersByIds } from "@/lib/repository";
import type {
  Club,
  ClubMembership,
  ClubTheme,
  Notification,
  UserProfile,
} from "@/types/domain";

type ThemeEmailProfile = Pick<
  UserProfile,
  "id" | "primaryEmail" | "emailNotifications" | "emailPreferences"
>;

export function buildCurrentThemeNotifications({
  club,
  theme,
  memberships,
  timestamp,
}: {
  club: Pick<Club, "id" | "slug" | "name">;
  theme: ClubTheme;
  memberships: Array<Pick<ClubMembership, "userId">>;
  timestamp: string;
}): Notification[] {
  const body = `${theme.name} is now the current theme for ${club.name}.`;
  return [...new Set(memberships.map((membership) => membership.userId))].map((userId) => ({
    id: createId("notification"),
    userId,
    kind: "theme",
    title: `New theme in ${club.name}`,
    body,
    href: `/app/clubs/${club.slug}`,
    createdAt: timestamp,
  }));
}

export function currentThemeEmailRecipients<T extends ThemeEmailProfile>(
  users: T[],
): Array<T & { primaryEmail: string }> {
  return users.filter(
    (user): user is T & { primaryEmail: string } =>
      shouldSendDropdayEmail(user, "theme"),
  );
}

export async function deliverCurrentThemeNotifications({
  notifications,
}: {
  notifications: Notification[];
}): Promise<void> {
  await deliverBrowserNotifications(notifications);
  if (!notifications.length) return;

  try {
    const notificationsByUserId = new Map(
      notifications.map((notification) => [notification.userId, notification]),
    );
    const users = await getUsersByIds([...notificationsByUserId.keys()]);
    const recipients = currentThemeEmailRecipients(users);
    const results = await Promise.allSettled(recipients.map((user) => {
      const notification = notificationsByUserId.get(user.id);
      if (!notification) return;
      return sendDropdayEmail({
        user,
        kind: "theme",
        subject: notification.title,
        heading: "A new club theme is current.",
        body: notification.body,
        href: notification.href,
        idempotencyKey: notification.id,
      });
    }));

    for (const [index, result] of results.entries()) {
      if (result.status === "rejected") {
        console.error("Could not deliver current theme email", {
          userId: recipients[index]?.id,
          notificationId: recipients[index]
            ? notificationsByUserId.get(recipients[index].id)?.id
            : undefined,
          error: result.reason instanceof Error
            ? result.reason.message
            : "Unknown email delivery error",
        });
      }
    }
  } catch (error) {
    console.error("Could not prepare current theme emails", {
      notificationIds: notifications.map((notification) => notification.id),
      error: error instanceof Error ? error.message : "Unknown email preparation error",
    });
  }
}
