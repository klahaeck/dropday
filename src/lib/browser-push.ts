import * as webPush from "web-push";
import { getDb } from "@/lib/db";
import { env, integrations } from "@/lib/env";
import { reportOperationalError } from "@/lib/observability";
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

export type BrowserPushDeliveryTargets =
  | { status: "skipped"; reason: "disabled" | "no-subscriptions" }
  | { status: "ready"; subscriptions: BrowserPushSubscription[] };

export type BrowserPushSubscriptionOutcome = "delivered" | "expired";

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

export async function getBrowserPushDeliveryTargets(
  userId: string,
): Promise<BrowserPushDeliveryTargets> {
  if (!vapidDetails() || !integrations.mongo) {
    return { status: "skipped", reason: "disabled" };
  }
  const subscriptions = await (await getDb())
    .collection<BrowserPushSubscription>("browserPushSubscriptions")
    .find({ userId })
    .toArray();
  return subscriptions.length
    ? { status: "ready", subscriptions }
    : { status: "skipped", reason: "no-subscriptions" };
}

/**
 * Strict single-device delivery for durable workers. Expired endpoints are a
 * successful terminal outcome; every other provider or preparation failure is
 * thrown so the caller can persist a retryable state.
 */
export async function deliverBrowserNotificationToSubscription(
  notification: Notification,
  subscription: BrowserPushSubscription,
): Promise<BrowserPushSubscriptionOutcome> {
  const details = vapidDetails();
  if (!details || !integrations.mongo) {
    throw new Error("Browser push is not configured");
  }
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
    return "delivered";
  } catch (error) {
    if (!isExpiredPushSubscriptionError(error)) throw error;
    await (await getDb()).collection<BrowserPushSubscription>("browserPushSubscriptions")
      .deleteOne({ id: subscription.id });
    return "expired";
  }
}

export async function deliverBrowserNotifications(
  notifications: Notification[],
): Promise<void> {
  if (!vapidDetails() || !integrations.mongo || notifications.length === 0) return;

  try {
    const db = await getDb();
    const recipientIds = [...new Set(notifications.map((notification) => notification.userId))];
    const subscriptions = await db.collection<BrowserPushSubscription>("browserPushSubscriptions")
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
          await deliverBrowserNotificationToSubscription(notification, subscription);
        } catch (error) {
          reportOperationalError("browser-push.delivery", error, {
            notificationId: notification.id,
            subscriptionId: subscription.id,
          });
        }
      })
    ));
  } catch (error) {
    reportOperationalError("browser-push.prepare", error, {
      notificationCount: notifications.length,
    });
  }
}

export async function deliverBrowserNotification(
  notification: Notification,
): Promise<void> {
  return deliverBrowserNotifications([notification]);
}
