import { deliverBrowserNotification } from "@/lib/browser-push";
import { formatDropReminderOffset } from "@/lib/drop-reminder-settings";
import { sendDropdayEmail } from "@/lib/email";
import type {
  Club,
  DropSlot,
  Notification,
  UserProfile,
} from "@/types/domain";

type ReminderDrop = Pick<DropSlot, "occurrenceKey">;
type ReminderClub = Pick<Club, "name" | "slug" | "currentTheme">;
type ReminderUser = Pick<
  UserProfile,
  "id" | "primaryEmail" | "emailNotifications" | "emailPreferences"
>;
type ReminderEmail = Parameters<typeof sendDropdayEmail>[0];

interface DropReminderDelivery {
  deliverBrowser(notification: Notification): Promise<void>;
  sendEmail(email: ReminderEmail): Promise<unknown>;
}

const defaultDelivery: DropReminderDelivery = {
  deliverBrowser: deliverBrowserNotification,
  sendEmail: sendDropdayEmail,
};

export async function deliverDropReminder({
  drop,
  club,
  user,
  offsetMinutes,
  persistNotification,
  createdAt = new Date().toISOString(),
  delivery = defaultDelivery,
}: {
  drop: ReminderDrop;
  club: ReminderClub;
  user: ReminderUser;
  offsetMinutes: number;
  persistNotification(notification: Notification): Promise<boolean>;
  createdAt?: string;
  delivery?: DropReminderDelivery;
}): Promise<Notification> {
  const id = `notification_reminder_${drop.occurrenceKey}_${offsetMinutes}`;
  const notification: Notification = {
    id,
    userId: user.id,
    kind: "reminder",
    title: `Your ${club.name} drop is coming up`,
    body: `${formatDropReminderOffset(offsetMinutes)} reminder for ${club.currentTheme?.name ?? "your freeform drop"}.`,
    href: `/app/clubs/${club.slug}`,
    createdAt,
  };

  const inserted = await persistNotification(notification);
  if (inserted) await delivery.deliverBrowser(notification);
  await delivery.sendEmail({
    user,
    kind: notification.kind,
    subject: notification.title,
    heading: "You’re almost up.",
    body: notification.body,
    href: notification.href,
    idempotencyKey: id,
  });

  return notification;
}
