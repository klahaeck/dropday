import { randomUUID } from "node:crypto";
import { Rest } from "ably";
import type { ClientSession, Db, Filter } from "mongodb";
import {
  deliverBrowserNotificationToSubscription,
  getBrowserPushDeliveryTargets,
} from "@/lib/browser-push";
import { getDb } from "@/lib/db";
import { sendDropdayEmail } from "@/lib/email";
import { env, integrations } from "@/lib/env";
import { normalizeDropReminderOffsets } from "@/lib/drop-reminder-settings";
import { scheduleDropTasks } from "@/lib/scheduler";
import type {
  Club,
  ClubMembership,
  DropSlot,
  Notification,
  OutboxEvent,
  UserProfile,
} from "@/types/domain";

const OUTBOX_LEASE_MS = 5 * 60_000;
const OUTBOX_MAX_RETRY_DELAY_MS = 60 * 60_000;
const DESTINATION_LEASE_MS = 2 * OUTBOX_LEASE_MS;

export type DurableOutboxEvent = Omit<OutboxEvent, "status"> & {
  status: OutboxEvent["status"] | "processing";
  availableAt?: Date;
  claimedAt?: Date;
  leaseUntil?: Date;
  claimToken?: string;
  lastError?: string;
};

interface OutboxDelivery {
  eventId: string;
  userId: string;
  notificationId: string;
  createdAt: string;
  inAppDeliveredAt?: string;
  pushStatus?: "skipped" | "delivered";
  pushSkippedAt?: string;
  pushSkipReason?: "disabled" | "no-subscriptions" | "no-active-subscriptions";
  // Retained for backwards compatibility with delivery rows created before
  // destination leases were introduced. Attempt timestamps are not terminal.
  pushAttemptedAt?: string;
  pushDeliveredAt?: string;
  emailDeliveredAt?: string;
  broadcastAttemptedAt?: string;
  broadcastStatus?: "pending" | "processing" | "failed" | "delivered";
  broadcastAttempts?: number;
  broadcastClaimToken?: string;
  broadcastLeaseUntil?: Date;
  broadcastLastError?: string;
  broadcastDeliveredAt?: string;
}

interface OutboxPushDelivery {
  eventId: string;
  userId: string;
  subscriptionId: string;
  notificationId: string;
  status: "pending" | "processing" | "failed" | "delivered" | "expired";
  attempts: number;
  createdAt: string;
  claimToken?: string;
  leaseUntil?: Date;
  lastError?: string;
  deliveredAt?: string;
  expiredAt?: string;
}

function retryableFilter(now: Date): Filter<DurableOutboxEvent> {
  return {
    $or: [
      {
        status: { $in: ["pending", "failed"] },
        $or: [
          { availableAt: { $exists: false } },
          { availableAt: { $lte: now } },
        ],
      },
      { status: "processing", leaseUntil: { $lte: now } },
    ],
  };
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asNumberArray(value: unknown): number[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "number")
    ? value
    : undefined;
}

export function dropScheduleOutboxEvent(
  drop: DropSlot,
  reminderOffsetsMinutes: number[],
  timestamp: string,
): DurableOutboxEvent {
  return {
    id: `outbox_schedule_${drop.id}_${drop.scheduleVersion}`,
    type: "drop.schedule",
    aggregateId: drop.id,
    payload: {
      dropId: drop.id,
      occurrenceKey: drop.occurrenceKey,
      scheduleVersion: drop.scheduleVersion,
      scheduledFor: drop.scheduledFor,
      reminderOffsetsMinutes: normalizeDropReminderOffsets(reminderOffsetsMinutes),
    },
    status: "pending",
    attempts: 0,
    idempotencyKey: `drop-schedule:${drop.occurrenceKey}`,
    createdAt: timestamp,
  };
}

export async function enqueueDropScheduleOutbox({
  db,
  session,
  drop,
  reminderOffsetsMinutes,
  timestamp,
}: {
  db: Db;
  session?: ClientSession;
  drop: DropSlot;
  reminderOffsetsMinutes: number[];
  timestamp: string;
}): Promise<DurableOutboxEvent> {
  const event = dropScheduleOutboxEvent(drop, reminderOffsetsMinutes, timestamp);
  const stored = await db.collection<DurableOutboxEvent>("outbox").findOneAndUpdate(
    { idempotencyKey: event.idempotencyKey },
    { $setOnInsert: event },
    { upsert: true, returnDocument: "after", ...(session ? { session } : {}) },
  );
  if (!stored) throw new Error("Could not enqueue drop scheduling work");
  return stored;
}

export type DropScheduleDispatchState = {
  status: "idle" | DurableOutboxEvent["status"];
  attempts: number;
  retryable: boolean;
};

export async function getDropScheduleDispatchState(
  db: Db,
  drop: DropSlot | null | undefined,
): Promise<DropScheduleDispatchState> {
  if (!drop || drop.status !== "scheduled") {
    return { status: "idle", attempts: 0, retryable: false };
  }
  const event = await db.collection<DurableOutboxEvent>("outbox").findOne(
    { idempotencyKey: `drop-schedule:${drop.occurrenceKey}` },
    { projection: { _id: 0, status: 1, attempts: 1 } },
  );
  if (!event) return { status: "idle", attempts: 0, retryable: true };
  return {
    status: event.status,
    attempts: event.attempts,
    retryable: event.status !== "delivered",
  };
}

export async function requeueOutboxEvent(
  db: Db,
  outboxId: string,
  now = new Date(),
): Promise<DurableOutboxEvent | null> {
  return db.collection<DurableOutboxEvent>("outbox").findOneAndUpdate(
    {
      id: outboxId,
      status: { $ne: "delivered" },
      $or: [
        { status: { $in: ["pending", "failed"] } },
        { status: "processing", leaseUntil: { $lte: now } },
      ],
    },
    {
      $set: { status: "pending", availableAt: now },
      $unset: { claimToken: "", claimedAt: "", leaseUntil: "", lastError: "" },
    },
    { returnDocument: "after" },
  );
}

export async function claimOutboxEvent(
  db: Db,
  outboxId: string,
  now = new Date(),
): Promise<DurableOutboxEvent | null> {
  const claimToken = randomUUID();
  return db.collection<DurableOutboxEvent>("outbox").findOneAndUpdate(
    { id: outboxId, ...retryableFilter(now) },
    {
      $set: {
        status: "processing",
        claimedAt: now,
        leaseUntil: new Date(now.getTime() + OUTBOX_LEASE_MS),
        claimToken,
      },
      $inc: { attempts: 1 },
      $unset: { lastError: "", availableAt: "" },
    },
    { returnDocument: "after" },
  );
}

export async function listRetryableOutboxEvents(
  db: Db,
  now = new Date(),
  limit = 100,
): Promise<Array<Pick<DurableOutboxEvent, "id" | "idempotencyKey">>> {
  return db.collection<DurableOutboxEvent>("outbox")
    .find(retryableFilter(now), { projection: { _id: 0, id: 1, idempotencyKey: 1 } })
    .sort({ createdAt: 1 })
    .limit(limit)
    .toArray();
}

async function completeOutboxEvent(db: Db, event: DurableOutboxEvent): Promise<void> {
  await db.collection<DurableOutboxEvent>("outbox").updateOne(
    { id: event.id, status: "processing", claimToken: event.claimToken },
    {
      $set: { status: "delivered", deliveredAt: new Date().toISOString() },
      $unset: { claimToken: "", claimedAt: "", leaseUntil: "", availableAt: "", lastError: "" },
    },
  );
}

async function failOutboxEvent(db: Db, event: DurableOutboxEvent, error: unknown): Promise<void> {
  const retryDelay = Math.min(
    2 ** Math.min(event.attempts, 10) * 1_000,
    OUTBOX_MAX_RETRY_DELAY_MS,
  );
  await db.collection<DurableOutboxEvent>("outbox").updateOne(
    { id: event.id, status: "processing", claimToken: event.claimToken },
    {
      $set: {
        status: "failed",
        availableAt: new Date(Date.now() + retryDelay),
        lastError: error instanceof Error ? error.message.slice(0, 1_000) : "Unknown outbox delivery error",
      },
      $unset: { claimToken: "", claimedAt: "", leaseUntil: "" },
    },
  );
}

export async function processDropScheduleEvent(db: Db, event: DurableOutboxEvent) {
  const dropId = asString(event.payload.dropId);
  const occurrenceKey = asString(event.payload.occurrenceKey);
  const scheduleVersion = asNumber(event.payload.scheduleVersion);
  const scheduledFor = asString(event.payload.scheduledFor);
  const reminderOffsetsMinutes = asNumberArray(event.payload.reminderOffsetsMinutes);
  if (!dropId || !occurrenceKey || scheduleVersion === undefined || !scheduledFor || !reminderOffsetsMinutes) {
    throw new Error("Drop scheduling outbox payload is invalid");
  }
  const drop = await db.collection<DropSlot>("drops").findOne({ id: dropId });
  if (
    !drop
    || drop.status !== "scheduled"
    || drop.occurrenceKey !== occurrenceKey
    || drop.scheduleVersion !== scheduleVersion
    || drop.scheduledFor !== scheduledFor
  ) {
    return { status: "stale" as const };
  }
  const runIds = await scheduleDropTasks(drop, reminderOffsetsMinutes);
  if (!runIds.length) {
    throw new Error("Drop scheduling did not create the required processing task");
  }
  await db.collection<DropSlot>("drops").updateOne(
    { id: drop.id, occurrenceKey, scheduleVersion, status: "scheduled" },
    { $set: { triggerRunIds: runIds } },
  );
  return { status: "scheduled" as const, runIds };
}

async function ensureRecipientDelivery(
  db: Db,
  event: DurableOutboxEvent,
  userId: string,
): Promise<OutboxDelivery> {
  const notificationId = `notification_${event.id}_${userId}`;
  const delivery = await db.collection<OutboxDelivery>("outboxDeliveries").findOneAndUpdate(
    { eventId: event.id, userId },
    {
      $setOnInsert: {
        eventId: event.id,
        userId,
        notificationId,
        createdAt: new Date().toISOString(),
      },
    },
    { upsert: true, returnDocument: "after" },
  );
  if (!delivery) throw new Error("Could not create outbox recipient delivery state");
  return delivery;
}

function deliveryErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message.slice(0, 1_000)
    : "Unknown destination delivery error";
}

async function ensurePushDelivery(
  db: Db,
  event: DurableOutboxEvent,
  userId: string,
  notificationId: string,
  subscriptionId: string,
): Promise<OutboxPushDelivery> {
  const delivery = await db.collection<OutboxPushDelivery>("outboxPushDeliveries")
    .findOneAndUpdate(
      { eventId: event.id, userId, subscriptionId },
      {
        $setOnInsert: {
          eventId: event.id,
          userId,
          subscriptionId,
          notificationId,
          status: "pending",
          attempts: 0,
          createdAt: new Date().toISOString(),
        },
      },
      { upsert: true, returnDocument: "after" },
    );
  if (!delivery) throw new Error("Could not create browser push delivery state");
  return delivery;
}

async function claimPushDelivery(
  db: Db,
  delivery: OutboxPushDelivery,
  now: Date,
): Promise<OutboxPushDelivery | null> {
  const claimToken = randomUUID();
  return db.collection<OutboxPushDelivery>("outboxPushDeliveries").findOneAndUpdate(
    {
      eventId: delivery.eventId,
      userId: delivery.userId,
      subscriptionId: delivery.subscriptionId,
      $or: [
        { status: { $in: ["pending", "failed"] } },
        { status: "processing", leaseUntil: { $lte: now } },
      ],
    },
    {
      $set: {
        status: "processing",
        claimToken,
        leaseUntil: new Date(now.getTime() + DESTINATION_LEASE_MS),
      },
      $inc: { attempts: 1 },
      $unset: { lastError: "" },
    },
    { returnDocument: "after" },
  );
}

async function completePushDelivery(
  db: Db,
  delivery: OutboxPushDelivery,
  outcome: "delivered" | "expired",
): Promise<void> {
  const timestamp = new Date().toISOString();
  const result = await db.collection<OutboxPushDelivery>("outboxPushDeliveries").updateOne(
    {
      eventId: delivery.eventId,
      userId: delivery.userId,
      subscriptionId: delivery.subscriptionId,
      status: "processing",
      claimToken: delivery.claimToken,
    },
    {
      $set: outcome === "delivered"
        ? { status: outcome, deliveredAt: timestamp }
        : { status: outcome, expiredAt: timestamp },
      $unset: { claimToken: "", leaseUntil: "", lastError: "" },
    },
  );
  if (result.matchedCount !== 1) {
    throw new Error("Browser push delivery lease was lost before completion");
  }
}

async function failPushDelivery(
  db: Db,
  delivery: OutboxPushDelivery,
  error: unknown,
): Promise<void> {
  await db.collection<OutboxPushDelivery>("outboxPushDeliveries").updateOne(
    {
      eventId: delivery.eventId,
      userId: delivery.userId,
      subscriptionId: delivery.subscriptionId,
      status: "processing",
      claimToken: delivery.claimToken,
    },
    {
      $set: { status: "failed", lastError: deliveryErrorMessage(error) },
      $unset: { claimToken: "", leaseUntil: "" },
    },
  );
}

/**
 * Durable browser-push delivery is tracked per subscription. Confirmed devices
 * are never sent again by a later event attempt, while failed or abandoned
 * claims become retryable after their lease expires.
 */
export async function deliverOutboxBrowserPush(
  db: Db,
  event: DurableOutboxEvent,
  notification: Notification,
  recipientDelivery: OutboxDelivery,
): Promise<void> {
  if (recipientDelivery.pushDeliveredAt || recipientDelivery.pushSkippedAt) return;

  const targets = await getBrowserPushDeliveryTargets(notification.userId);
  if (targets.status === "skipped") {
    const priorDelivery = await db.collection<OutboxPushDelivery>("outboxPushDeliveries").findOne(
      { eventId: event.id, userId: notification.userId, status: "delivered" },
      { projection: { _id: 1 } },
    );
    const timestamp = new Date().toISOString();
    await db.collection<OutboxDelivery>("outboxDeliveries").updateOne(
      { eventId: event.id, userId: notification.userId },
      priorDelivery
        ? { $set: { pushStatus: "delivered", pushDeliveredAt: timestamp } }
        : {
            $set: {
              pushStatus: "skipped",
              pushSkippedAt: timestamp,
              pushSkipReason: targets.reason,
            },
          },
    );
    return;
  }

  let deliveredCount = 0;
  const failures: unknown[] = [];
  for (const subscription of targets.subscriptions) {
    const stored = await ensurePushDelivery(
      db,
      event,
      notification.userId,
      notification.id,
      subscription.id,
    );
    if (stored.status === "delivered") {
      deliveredCount += 1;
      continue;
    }
    if (stored.status === "expired") continue;

    const claimed = await claimPushDelivery(db, stored, new Date());
    if (!claimed) {
      failures.push(new Error(`Browser push subscription ${subscription.id} has an active delivery lease`));
      continue;
    }
    try {
      const outcome = await deliverBrowserNotificationToSubscription(notification, subscription);
      await completePushDelivery(db, claimed, outcome);
      if (outcome === "delivered") deliveredCount += 1;
    } catch (error) {
      await failPushDelivery(db, claimed, error);
      failures.push(error);
    }
  }

  if (failures.length) {
    throw new AggregateError(failures, "One or more browser push deliveries failed");
  }

  const timestamp = new Date().toISOString();
  await db.collection<OutboxDelivery>("outboxDeliveries").updateOne(
    { eventId: event.id, userId: notification.userId },
    deliveredCount > 0
      ? { $set: { pushStatus: "delivered", pushDeliveredAt: timestamp } }
      : {
          $set: {
            pushStatus: "skipped",
            pushSkippedAt: timestamp,
            pushSkipReason: "no-active-subscriptions",
          },
        },
  );
}

async function deliverNotificationToUser({
  db,
  event,
  club,
  user,
  title,
  body,
}: {
  db: Db;
  event: DurableOutboxEvent;
  club: Club;
  user: UserProfile;
  title: string;
  body: string;
}) {
  let delivery = await ensureRecipientDelivery(db, event, user.id);
  const notification: Notification = {
    id: delivery.notificationId,
    userId: user.id,
    kind: event.type === "drop.overdue" ? "overdue" : "published",
    title,
    body,
    href: `/app/clubs/${club.slug}`,
    createdAt: event.createdAt,
  };

  if (!delivery.inAppDeliveredAt) {
    await db.collection<Notification>("notifications").updateOne(
      { id: notification.id },
      { $setOnInsert: notification },
      { upsert: true },
    );
    const deliveredAt = new Date().toISOString();
    await db.collection<OutboxDelivery>("outboxDeliveries").updateOne(
      { eventId: event.id, userId: user.id },
      { $set: { inAppDeliveredAt: deliveredAt } },
    );
    delivery = { ...delivery, inAppDeliveredAt: deliveredAt };
  }

  await deliverOutboxBrowserPush(db, event, notification, delivery);

  if (!delivery.emailDeliveredAt) {
    await sendDropdayEmail({
      user,
      kind: notification.kind,
      subject: title,
      heading: event.type === "drop.overdue" ? "The queue is waiting." : "Needle down.",
      body,
      href: notification.href,
      idempotencyKey: `${event.idempotencyKey}:${user.id}`,
    });
    await db.collection<OutboxDelivery>("outboxDeliveries").updateOne(
      { eventId: event.id, userId: user.id },
      { $set: { emailDeliveredAt: new Date().toISOString() } },
    );
  }
}

export async function publishRealtimeNotification(
  db: Db,
  event: DurableOutboxEvent,
  club: Club,
  title: string,
  body: string,
) {
  if (!integrations.ably || !env.ablyApiKey) return;
  const userId = "__club_broadcast__";
  const delivery = await ensureRecipientDelivery(db, event, userId);
  if (delivery.broadcastDeliveredAt) return;

  const now = new Date();
  const claimToken = randomUUID();
  const claimed = await db.collection<OutboxDelivery>("outboxDeliveries").findOneAndUpdate(
    {
      eventId: event.id,
      userId,
      broadcastDeliveredAt: { $exists: false },
      $or: [
        { broadcastStatus: { $exists: false } },
        { broadcastStatus: { $in: ["pending", "failed"] } },
        { broadcastStatus: "processing", broadcastLeaseUntil: { $lte: now } },
      ],
    },
    {
      $set: {
        broadcastStatus: "processing",
        broadcastClaimToken: claimToken,
        broadcastLeaseUntil: new Date(now.getTime() + DESTINATION_LEASE_MS),
      },
      $inc: { broadcastAttempts: 1 },
      $unset: { broadcastLastError: "" },
    },
    { returnDocument: "after" },
  );
  if (!claimed) {
    const latest = await db.collection<OutboxDelivery>("outboxDeliveries").findOne(
      { eventId: event.id, userId },
      { projection: { _id: 0, broadcastDeliveredAt: 1 } },
    );
    if (latest?.broadcastDeliveredAt) return;
    throw new Error("Realtime broadcast has an active delivery lease");
  }

  try {
    const ably = new Rest({ key: env.ablyApiKey });
    await ably.channels.get(`club:${club.id}`).publish({
      id: event.id,
      name: event.type,
      data: { title, body, eventId: event.id },
    });
    const result = await db.collection<OutboxDelivery>("outboxDeliveries").updateOne(
      { eventId: event.id, userId, broadcastStatus: "processing", broadcastClaimToken: claimToken },
      {
        $set: { broadcastStatus: "delivered", broadcastDeliveredAt: new Date().toISOString() },
        $unset: { broadcastClaimToken: "", broadcastLeaseUntil: "", broadcastLastError: "" },
      },
    );
    if (result.matchedCount !== 1) {
      throw new Error("Realtime broadcast delivery lease was lost before completion");
    }
  } catch (error) {
    await db.collection<OutboxDelivery>("outboxDeliveries").updateOne(
      { eventId: event.id, userId, broadcastStatus: "processing", broadcastClaimToken: claimToken },
      {
        $set: { broadcastStatus: "failed", broadcastLastError: deliveryErrorMessage(error) },
        $unset: { broadcastClaimToken: "", broadcastLeaseUntil: "" },
      },
    );
    throw error;
  }
}

export function resolveNotificationTargetIds({
  event,
  club,
  memberships,
  currentDrop,
}: {
  event: DurableOutboxEvent;
  club: Pick<Club, "id" | "visibility">;
  memberships: ClubMembership[];
  currentDrop?: Pick<DropSlot, "status" | "assignedUserId"> | null;
}): string[] {
  if (event.type !== "drop.overdue") {
    return [...new Set(
      memberships
        .filter((membership) => membership.clubId === club.id && membership.status === "active")
        .map((membership) => membership.userId),
    )];
  }

  const queuedAssigneeId = asString(event.payload.assignedUserId);
  if (
    !queuedAssigneeId
    || !currentDrop
    || currentDrop.status !== "overdue"
    || currentDrop.assignedUserId !== queuedAssigneeId
  ) {
    return [];
  }
  if (
    club.visibility === "private"
    && !memberships.some((membership) =>
      membership.clubId === club.id
      && membership.userId === queuedAssigneeId
      && membership.status === "active"
    )
  ) {
    return [];
  }
  return [queuedAssigneeId];
}

export async function processNotificationEvent(db: Db, event: DurableOutboxEvent) {
  const clubId = asString(event.payload.clubId);
  if (!clubId) throw new Error("Notification outbox payload is missing its club");
  const club = await db.collection<Club>("clubs").findOne({ id: clubId });
  if (!club) return { status: "missing" as const };
  const memberships = await db.collection<ClubMembership>("memberships")
    .find({ clubId, status: "active" })
    .toArray();
  const currentDrop = event.type === "drop.overdue"
    ? await db.collection<DropSlot>("drops").findOne(
        { id: event.aggregateId },
        { projection: { _id: 0, status: 1, assignedUserId: 1 } },
      )
    : null;
  const targetIds = resolveNotificationTargetIds({ event, club, memberships, currentDrop });
  const users = await db.collection<UserProfile>("users").find({ id: { $in: targetIds } }).toArray();
  const title = event.type === "drop.overdue"
    ? `A ${club.name} drop is overdue`
    : `A new playlist landed in ${club.name}`;
  const body = event.type === "drop.overdue"
    ? "The queue is holding. Add a late playlist or ask an admin to use a backup."
    : `${String(event.payload.title ?? "A new playlist")} is ready for the club.`;
  for (const user of users) {
    await deliverNotificationToUser({ db, event, club, user, title, body });
  }
  await publishRealtimeNotification(db, event, club, title, body);
  return { status: "delivered" as const, recipients: users.length };
}

export async function processOutboxEvent(outboxId: string) {
  if (!integrations.mongo) return { status: "demo" as const };
  const db = await getDb();
  const event = await claimOutboxEvent(db, outboxId);
  if (!event) return { status: "duplicate" as const };
  try {
    const result = event.type === "drop.schedule"
      ? await processDropScheduleEvent(db, event)
      : await processNotificationEvent(db, event);
    await completeOutboxEvent(db, event);
    return result;
  } catch (error) {
    await failOutboxEvent(db, event, error);
    throw error;
  }
}
