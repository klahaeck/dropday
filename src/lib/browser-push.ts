import * as webPush from "web-push";
import { getDb } from "@/lib/db";
import { env, integrations } from "@/lib/env";
import type {
  BrowserPushSubscription,
  Notification,
} from "@/types/domain";

const PUSH_TTL_SECONDS = 7 * 24 * 60 * 60;
const PUSH_ENDPOINT_HOSTS = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "push.services.mozilla.com",
  "push.apple.com",
  "notify.windows.com",
] as const;

export interface BrowserNotificationPayload {
  id: string;
  title: string;
  body: string;
  href: string;
}

export function browserNotificationPayload(
  notification: Notification,
): BrowserNotificationPayload {
  return {
    id: notification.id,
    title: notification.title,
    body: notification.body,
    href: notification.href ?? "/app/notifications",
  };
}

export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase();
    return PUSH_ENDPOINT_HOSTS.some((allowedHost) =>
      hostname === allowedHost || hostname.endsWith(`.${allowedHost}`)
    );
  } catch {
    return false;
  }
}

export function isExpiredPushSubscriptionError(error: unknown): boolean {
  return error instanceof webPush.WebPushError
    && (error.statusCode === 404 || error.statusCode === 410);
}

function vapidDetails() {
  if (
    !integrations.browserPush
    || !env.vapidPublicKey
    || !env.vapidPrivateKey
    || !env.vapidSubject
  ) {
    return null;
  }
  return {
    subject: env.vapidSubject,
    publicKey: env.vapidPublicKey,
    privateKey: env.vapidPrivateKey,
  };
}

export async function deliverBrowserNotifications(
  notifications: Notification[],
): Promise<void> {
  const details = vapidDetails();
  if (!details || !integrations.mongo || notifications.length === 0) return;

  try {
    const db = await getDb();
    const recipientIds = [...new Set(notifications.map((notification) => notification.userId))];
    const subscriptions = await db
      .collection<BrowserPushSubscription>("browserPushSubscriptions")
      .find({ userId: { $in: recipientIds } })
      .toArray();
    const subscriptionsByUser = new Map<string, BrowserPushSubscription[]>();
    for (const subscription of subscriptions) {
      const userSubscriptions = subscriptionsByUser.get(subscription.userId) ?? [];
      userSubscriptions.push(subscription);
      subscriptionsByUser.set(subscription.userId, userSubscriptions);
    }

    await Promise.all(notifications.flatMap((notification) =>
      (subscriptionsByUser.get(notification.userId) ?? []).map(async (subscription) => {
        try {
          await webPush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: subscription.keys,
            },
            JSON.stringify(browserNotificationPayload(notification)),
            {
              TTL: PUSH_TTL_SECONDS,
              urgency: notification.kind === "reminder" || notification.kind === "overdue"
                ? "high"
                : "normal",
              vapidDetails: details,
            },
          );
        } catch (error) {
          if (isExpiredPushSubscriptionError(error)) {
            await db.collection<BrowserPushSubscription>("browserPushSubscriptions")
              .deleteOne({ id: subscription.id });
            return;
          }
          console.error("Could not deliver browser notification", {
            notificationId: notification.id,
            subscriptionId: subscription.id,
            error: error instanceof Error ? error.message : "Unknown push delivery error",
          });
        }
      })
    ));
  } catch (error) {
    console.error("Could not prepare browser notifications", {
      notificationIds: notifications.map((notification) => notification.id),
      error: error instanceof Error ? error.message : "Unknown push preparation error",
    });
  }
}

export async function deliverBrowserNotification(
  notification: Notification,
): Promise<void> {
  return deliverBrowserNotifications([notification]);
}
