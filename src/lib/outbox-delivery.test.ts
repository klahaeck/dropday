import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import {
  deliverOutboxBrowserPush,
  publishRealtimeNotification,
  type DurableOutboxEvent,
} from "@/lib/outbox";
import type {
  BrowserPushSubscription,
  Club,
  Notification,
} from "@/types/domain";

const mocks = vi.hoisted(() => ({
  getTargets: vi.fn(),
  deliverToSubscription: vi.fn(),
  publish: vi.fn(),
}));

vi.mock("@/lib/browser-push", () => ({
  getBrowserPushDeliveryTargets: mocks.getTargets,
  deliverBrowserNotificationToSubscription: mocks.deliverToSubscription,
}));

vi.mock("@/lib/env", () => ({
  env: { ablyApiKey: "ably-key" },
  integrations: { ably: true, mongo: true },
}));

vi.mock("ably", () => ({
  Rest: class RestMock {
    channels = { get: vi.fn(() => ({ publish: mocks.publish })) };
  },
}));

const event: DurableOutboxEvent = {
  id: "outbox-drop-1",
  type: "drop.published",
  aggregateId: "drop-1",
  payload: { clubId: "club-1" },
  status: "processing",
  attempts: 1,
  idempotencyKey: "drop-published:drop-1",
  createdAt: "2026-09-17T12:00:00.000Z",
};

const notification: Notification = {
  id: "notification-outbox-drop-1-user-1",
  userId: "user-1",
  kind: "published",
  title: "A new playlist landed",
  body: "Listen now.",
  href: "/app/clubs/club-1",
  createdAt: event.createdAt,
};

const club = {
  id: "club-1",
  slug: "club-1",
} as Club;

function subscription(id: string): BrowserPushSubscription {
  return {
    id,
    userId: notification.userId,
    endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
    expirationTime: null,
    keys: { p256dh: "p256dh", auth: "auth" },
    createdAt: event.createdAt,
    updatedAt: event.createdAt,
  };
}

type TestDocument = Record<string, unknown>;
type TestUpdate = {
  $set?: TestDocument;
  $setOnInsert?: TestDocument;
  $inc?: Record<string, number>;
  $unset?: TestDocument;
};

function applyUpdate(target: TestDocument, update: TestUpdate) {
  Object.assign(target, update.$set ?? {});
  for (const [field, amount] of Object.entries<number>(update.$inc ?? {})) {
    target[field] = Number(target[field] ?? 0) + amount;
  }
  for (const field of Object.keys(update.$unset ?? {})) delete target[field];
}

function createDeliveryDb() {
  const push = new Map<string, TestDocument>();
  const recipients = new Map<string, TestDocument>();

  const pushCollection = {
    findOneAndUpdate: vi.fn(async (filter: TestDocument, update: TestUpdate) => {
      const key = String(filter.subscriptionId);
      let stored = push.get(key);
      if (update.$setOnInsert) {
        if (!stored) {
          const inserted = { ...update.$setOnInsert };
          push.set(key, inserted);
          stored = inserted;
        }
        return { ...stored };
      }
      if (!stored) return null;
      const retryable = stored.status === "pending" || stored.status === "failed"
        || (stored.status === "processing"
          && stored.leaseUntil instanceof Date
          && stored.leaseUntil <= new Date());
      if (!retryable) return null;
      applyUpdate(stored, update);
      return { ...stored };
    }),
    updateOne: vi.fn(async (filter: TestDocument, update: TestUpdate) => {
      const stored = push.get(String(filter.subscriptionId));
      if (!stored || stored.status !== filter.status || stored.claimToken !== filter.claimToken) {
        return { matchedCount: 0 };
      }
      applyUpdate(stored, update);
      return { matchedCount: 1 };
    }),
    findOne: vi.fn(async (filter: TestDocument) =>
      [...push.values()].find((delivery) =>
        delivery.eventId === filter.eventId
        && delivery.userId === filter.userId
        && delivery.status === filter.status
      ) ?? null),
  };

  const recipientCollection = {
    findOneAndUpdate: vi.fn(async (filter: TestDocument, update: TestUpdate) => {
      const key = String(filter.userId);
      let stored = recipients.get(key);
      if (update.$setOnInsert) {
        if (!stored) {
          const inserted = { ...update.$setOnInsert };
          recipients.set(key, inserted);
          stored = inserted;
        }
        return { ...stored };
      }
      if (!stored || stored.broadcastDeliveredAt) return null;
      const status = stored.broadcastStatus;
      const retryable = status === undefined || status === "pending" || status === "failed"
        || (status === "processing"
          && stored.broadcastLeaseUntil instanceof Date
          && stored.broadcastLeaseUntil <= new Date());
      if (!retryable) return null;
      applyUpdate(stored, update);
      return { ...stored };
    }),
    updateOne: vi.fn(async (filter: TestDocument, update: TestUpdate) => {
      const userId = String(filter.userId);
      const stored = recipients.get(userId) ?? {
        eventId: filter.eventId,
        userId: filter.userId,
        notificationId: notification.id,
      };
      recipients.set(userId, stored);
      if (
        filter.broadcastStatus !== undefined
        && (stored.broadcastStatus !== filter.broadcastStatus
          || stored.broadcastClaimToken !== filter.broadcastClaimToken)
      ) {
        return { matchedCount: 0 };
      }
      applyUpdate(stored, update);
      return { matchedCount: 1 };
    }),
    findOne: vi.fn(async (filter: TestDocument) => recipients.get(String(filter.userId)) ?? null),
  };

  const db = {
    collection: vi.fn((name: string) => {
      if (name === "outboxPushDeliveries") return pushCollection;
      if (name === "outboxDeliveries") return recipientCollection;
      throw new Error(`Unexpected collection ${name}`);
    }),
  } as unknown as Db;

  return { db, push, recipients };
}

describe("durable destination delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not resend a device that succeeded before another device failed", async () => {
    const first = subscription("subscription-1");
    const second = subscription("subscription-2");
    const { db, push, recipients } = createDeliveryDb();
    push.set(first.id, {
      eventId: event.id,
      userId: notification.userId,
      subscriptionId: first.id,
      notificationId: notification.id,
      status: "delivered",
      attempts: 1,
      createdAt: event.createdAt,
      deliveredAt: event.createdAt,
    });
    push.set(second.id, {
      eventId: event.id,
      userId: notification.userId,
      subscriptionId: second.id,
      notificationId: notification.id,
      status: "failed",
      attempts: 1,
      createdAt: event.createdAt,
    });
    mocks.getTargets.mockResolvedValue({ status: "ready", subscriptions: [first, second] });
    mocks.deliverToSubscription.mockResolvedValue("delivered");

    await deliverOutboxBrowserPush(db, event, notification, {
      eventId: event.id,
      userId: notification.userId,
      notificationId: notification.id,
      createdAt: event.createdAt,
    });

    expect(mocks.deliverToSubscription).toHaveBeenCalledTimes(1);
    expect(mocks.deliverToSubscription).toHaveBeenCalledWith(notification, second);
    expect(push.get(second.id)).toMatchObject({ status: "delivered", attempts: 2 });
    expect(recipients.get(notification.userId)).toMatchObject({
      pushStatus: "delivered",
      pushDeliveredAt: expect.any(String),
    });
  });

  it("persists a failed device attempt and retries it under a new lease", async () => {
    const target = subscription("subscription-1");
    const { db, push } = createDeliveryDb();
    mocks.getTargets.mockResolvedValue({ status: "ready", subscriptions: [target] });
    mocks.deliverToSubscription
      .mockRejectedValueOnce(new Error("push provider unavailable"))
      .mockResolvedValueOnce("delivered");

    await expect(deliverOutboxBrowserPush(db, event, notification, {
      eventId: event.id,
      userId: notification.userId,
      notificationId: notification.id,
      createdAt: event.createdAt,
    })).rejects.toThrow("One or more browser push deliveries failed");
    expect(push.get(target.id)).toMatchObject({
      status: "failed",
      attempts: 1,
      lastError: "push provider unavailable",
    });

    await deliverOutboxBrowserPush(db, event, notification, {
      eventId: event.id,
      userId: notification.userId,
      notificationId: notification.id,
      createdAt: event.createdAt,
    });

    expect(mocks.deliverToSubscription).toHaveBeenCalledTimes(2);
    expect(push.get(target.id)).toMatchObject({ status: "delivered", attempts: 2 });
  });

  it("reclaims an abandoned device attempt after its lease expires", async () => {
    const target = subscription("subscription-1");
    const { db, push } = createDeliveryDb();
    push.set(target.id, {
      eventId: event.id,
      userId: notification.userId,
      subscriptionId: target.id,
      notificationId: notification.id,
      status: "processing",
      attempts: 1,
      claimToken: "abandoned-claim",
      leaseUntil: new Date("2020-01-01T00:00:00.000Z"),
      createdAt: event.createdAt,
    });
    mocks.getTargets.mockResolvedValue({ status: "ready", subscriptions: [target] });
    mocks.deliverToSubscription.mockResolvedValue("delivered");

    await deliverOutboxBrowserPush(db, event, notification, {
      eventId: event.id,
      userId: notification.userId,
      notificationId: notification.id,
      createdAt: event.createdAt,
    });

    expect(mocks.deliverToSubscription).toHaveBeenCalledOnce();
    expect(push.get(target.id)).toMatchObject({ status: "delivered", attempts: 2 });
  });

  it("records expired devices without retrying them", async () => {
    const target = subscription("subscription-1");
    const { db, push, recipients } = createDeliveryDb();
    mocks.getTargets.mockResolvedValue({ status: "ready", subscriptions: [target] });
    mocks.deliverToSubscription.mockResolvedValue("expired");

    await deliverOutboxBrowserPush(db, event, notification, {
      eventId: event.id,
      userId: notification.userId,
      notificationId: notification.id,
      createdAt: event.createdAt,
    });

    expect(push.get(target.id)).toMatchObject({ status: "expired", expiredAt: expect.any(String) });
    expect(recipients.get(notification.userId)).toMatchObject({
      pushStatus: "skipped",
      pushSkipReason: "no-active-subscriptions",
    });
  });

  it("retries failed realtime publishes and uses the event id for provider deduplication", async () => {
    const { db, recipients } = createDeliveryDb();
    mocks.publish
      .mockRejectedValueOnce(new Error("Ably unavailable"))
      .mockResolvedValueOnce({ serial: "serial-1" });

    await expect(publishRealtimeNotification(db, event, club, "Title", "Body"))
      .rejects.toThrow("Ably unavailable");
    expect(recipients.get("__club_broadcast__")).toMatchObject({
      broadcastStatus: "failed",
      broadcastAttempts: 1,
      broadcastLastError: "Ably unavailable",
    });

    await publishRealtimeNotification(db, event, club, "Title", "Body");

    expect(mocks.publish).toHaveBeenCalledTimes(2);
    expect(mocks.publish).toHaveBeenLastCalledWith({
      id: event.id,
      name: event.type,
      data: { title: "Title", body: "Body", eventId: event.id },
    });
    expect(recipients.get("__club_broadcast__")).toMatchObject({
      broadcastStatus: "delivered",
      broadcastAttempts: 2,
      broadcastDeliveredAt: expect.any(String),
    });
  });

  it("reclaims an abandoned realtime publish after its lease expires", async () => {
    const { db, recipients } = createDeliveryDb();
    recipients.set("__club_broadcast__", {
      eventId: event.id,
      userId: "__club_broadcast__",
      notificationId: `notification_${event.id}___club_broadcast__`,
      createdAt: event.createdAt,
      broadcastStatus: "processing",
      broadcastAttempts: 1,
      broadcastClaimToken: "abandoned-claim",
      broadcastLeaseUntil: new Date("2020-01-01T00:00:00.000Z"),
    });
    mocks.publish.mockResolvedValue({ serial: "serial-1" });

    await publishRealtimeNotification(db, event, club, "Title", "Body");

    expect(mocks.publish).toHaveBeenCalledOnce();
    expect(recipients.get("__club_broadcast__")).toMatchObject({
      broadcastStatus: "delivered",
      broadcastAttempts: 2,
      broadcastDeliveredAt: expect.any(String),
    });
  });
});
