import { beforeEach, describe, expect, it, vi } from "vitest";
import * as webPush from "web-push";
import {
  deliverBrowserNotificationToSubscription,
  getBrowserPushDeliveryTargets,
} from "@/lib/browser-push";
import type {
  BrowserPushSubscription,
  Notification,
} from "@/types/domain";

const mocks = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  getDb: vi.fn(),
  find: vi.fn(),
  toArray: vi.fn(),
  deleteOne: vi.fn(),
  integrations: { browserPush: true, mongo: true },
}));

vi.mock("web-push", () => ({
  sendNotification: mocks.sendNotification,
  WebPushError: class WebPushError extends Error {
    constructor(
      message: string,
      readonly statusCode: number,
      readonly headers: Record<string, string>,
      readonly body: string,
      readonly endpoint: string,
    ) {
      super(message);
    }
  },
}));

vi.mock("@/lib/db", () => ({ getDb: mocks.getDb }));

vi.mock("@/lib/env", () => ({
  env: {
    vapidPublicKey: "public-key",
    vapidPrivateKey: "private-key",
    vapidSubject: "mailto:ops@example.com",
  },
  integrations: mocks.integrations,
}));

const notification: Notification = {
  id: "notification-1",
  userId: "user-1",
  kind: "published",
  title: "A new playlist landed",
  body: "Listen now.",
  href: "/app/clubs/club-1",
  createdAt: "2026-09-17T12:00:00.000Z",
};

const subscription: BrowserPushSubscription = {
  id: "subscription-1",
  userId: notification.userId,
  endpoint: "https://fcm.googleapis.com/fcm/send/subscription-1",
  expirationTime: null,
  keys: { p256dh: "p256dh", auth: "auth" },
  createdAt: notification.createdAt,
  updatedAt: notification.createdAt,
};

describe("strict browser push delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.integrations.browserPush = true;
    mocks.integrations.mongo = true;
    mocks.find.mockReturnValue({ toArray: mocks.toArray });
    mocks.getDb.mockResolvedValue({
      collection: vi.fn(() => ({ find: mocks.find, deleteOne: mocks.deleteOne })),
    });
    mocks.toArray.mockResolvedValue([subscription]);
    mocks.sendNotification.mockResolvedValue({ statusCode: 201 });
    mocks.deleteOne.mockResolvedValue({ deletedCount: 1 });
  });

  it("distinguishes disabled and empty recipient targets", async () => {
    mocks.integrations.browserPush = false;
    await expect(getBrowserPushDeliveryTargets(notification.userId)).resolves.toEqual({
      status: "skipped",
      reason: "disabled",
    });

    mocks.integrations.browserPush = true;
    mocks.toArray.mockResolvedValue([]);
    await expect(getBrowserPushDeliveryTargets(notification.userId)).resolves.toEqual({
      status: "skipped",
      reason: "no-subscriptions",
    });
  });

  it("returns success but propagates retryable provider failures", async () => {
    await expect(deliverBrowserNotificationToSubscription(notification, subscription))
      .resolves.toBe("delivered");

    mocks.sendNotification.mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(deliverBrowserNotificationToSubscription(notification, subscription))
      .rejects.toThrow("provider unavailable");
    expect(mocks.deleteOne).not.toHaveBeenCalled();
  });

  it("returns expired and deletes a permanently invalid subscription", async () => {
    mocks.sendNotification.mockRejectedValueOnce(new webPush.WebPushError(
      "expired",
      410,
      {},
      "gone",
      subscription.endpoint,
    ));

    await expect(deliverBrowserNotificationToSubscription(notification, subscription))
      .resolves.toBe("expired");
    expect(mocks.deleteOne).toHaveBeenCalledWith({ id: subscription.id });
  });
});
