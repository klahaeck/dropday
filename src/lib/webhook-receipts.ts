import { randomUUID } from "node:crypto";
import type { Collection } from "mongodb";

const PROCESSING_LEASE_MS = 5 * 60 * 1000;

export interface WebhookReceipt {
  eventId: string;
  eventType: string;
  status: "pending" | "processing" | "completed" | "failed";
  attempts: number;
  receivedAt: string;
  updatedAt: string;
  claimId?: string;
  lockedUntil?: string;
  completedAt?: string;
  lastError?: string;
}

export type WebhookReceiptClaim =
  | { status: "claimed"; claimId: string; attempts: number }
  | { status: "completed" }
  | { status: "processing" };

export async function claimWebhookReceipt(
  receipts: Collection<WebhookReceipt>,
  eventId: string,
  eventType: string,
  now = new Date(),
): Promise<WebhookReceiptClaim> {
  const timestamp = now.toISOString();
  await receipts.updateOne(
    { eventId },
    {
      $setOnInsert: {
        eventId,
        eventType,
        status: "pending",
        attempts: 0,
        receivedAt: timestamp,
        updatedAt: timestamp,
      },
    },
    { upsert: true },
  );

  // Receipts created before processing state was introduced may represent a
  // partially applied event. Reclaiming them favors convergence; downstream
  // user and entitlement writes are idempotent.
  await receipts.updateOne(
    { eventId, status: { $exists: false } },
    {
      $set: {
        eventType,
        status: "pending",
        attempts: 0,
        updatedAt: timestamp,
      },
    },
  );

  const claimId = randomUUID();
  const lockedUntil = new Date(now.getTime() + PROCESSING_LEASE_MS).toISOString();
  const claimed = await receipts.findOneAndUpdate(
    {
      eventId,
      $or: [
        { status: "pending" },
        { status: "failed" },
        { status: "processing", lockedUntil: { $lte: timestamp } },
      ],
    },
    {
      $set: {
        eventType,
        status: "processing",
        claimId,
        lockedUntil,
        updatedAt: timestamp,
      },
      $inc: { attempts: 1 },
      $unset: { completedAt: "", lastError: "" },
    },
    { returnDocument: "after" },
  );
  if (claimed) return { status: "claimed", claimId, attempts: claimed.attempts };

  const existing = await receipts.findOne({ eventId });
  return { status: existing?.status === "completed" ? "completed" : "processing" };
}

export async function completeWebhookReceipt(
  receipts: Collection<WebhookReceipt>,
  eventId: string,
  claimId: string,
  now = new Date(),
): Promise<void> {
  const timestamp = now.toISOString();
  const result = await receipts.updateOne(
    { eventId, status: "processing", claimId },
    {
      $set: {
        status: "completed",
        completedAt: timestamp,
        updatedAt: timestamp,
      },
      $unset: { claimId: "", lockedUntil: "", lastError: "" },
    },
  );
  if (!result.matchedCount) throw new Error("Webhook receipt lease was lost before completion");
}

export async function failWebhookReceipt(
  receipts: Collection<WebhookReceipt>,
  eventId: string,
  claimId: string,
  error: unknown,
  now = new Date(),
): Promise<void> {
  const timestamp = now.toISOString();
  await receipts.updateOne(
    { eventId, status: "processing", claimId },
    {
      $set: {
        status: "failed",
        lastError: error instanceof Error ? error.message.slice(0, 500) : "Unknown processing error",
        updatedAt: timestamp,
      },
      $unset: { claimId: "", lockedUntil: "" },
    },
  );
}
