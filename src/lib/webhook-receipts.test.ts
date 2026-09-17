import { describe, expect, it, vi } from "vitest";
import type { Collection } from "mongodb";
import {
  claimWebhookReceipt,
  completeWebhookReceipt,
  failWebhookReceipt,
  type WebhookReceipt,
} from "@/lib/webhook-receipts";

function receiptCollection({
  claimed = null,
  existing = null,
}: {
  claimed?: WebhookReceipt | null;
  existing?: WebhookReceipt | null;
} = {}) {
  const updateOne = vi.fn().mockResolvedValue({ matchedCount: 1 });
  const findOneAndUpdate = vi.fn().mockResolvedValue(claimed);
  const findOne = vi.fn().mockResolvedValue(existing);
  return {
    collection: { updateOne, findOneAndUpdate, findOne } as unknown as Collection<WebhookReceipt>,
    updateOne,
    findOneAndUpdate,
    findOne,
  };
}

describe("webhook receipt processing", () => {
  it("claims new, failed, or lease-expired events for processing", async () => {
    const fixture = receiptCollection({
      claimed: {
        eventId: "evt_1",
        eventType: "subscriptionItem.active",
        status: "processing",
        attempts: 2,
        receivedAt: "2026-09-17T12:00:00.000Z",
        updatedAt: "2026-09-17T12:01:00.000Z",
      },
    });

    const claim = await claimWebhookReceipt(
      fixture.collection,
      "evt_1",
      "subscriptionItem.active",
      new Date("2026-09-17T12:01:00.000Z"),
    );

    expect(claim).toEqual({
      status: "claimed",
      claimId: expect.any(String),
      attempts: 2,
    });
    expect(fixture.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "evt_1",
        $or: expect.arrayContaining([
          { status: "pending" },
          { status: "failed" },
          { status: "processing", lockedUntil: { $lte: "2026-09-17T12:01:00.000Z" } },
        ]),
      }),
      expect.objectContaining({ $inc: { attempts: 1 } }),
      { returnDocument: "after" },
    );
  });

  it("does not reclaim a completed receipt", async () => {
    const fixture = receiptCollection({
      existing: {
        eventId: "evt_1",
        eventType: "subscriptionItem.active",
        status: "completed",
        attempts: 1,
        receivedAt: "2026-09-17T12:00:00.000Z",
        updatedAt: "2026-09-17T12:01:00.000Z",
      },
    });

    await expect(claimWebhookReceipt(
      fixture.collection,
      "evt_1",
      "subscriptionItem.active",
    )).resolves.toEqual({ status: "completed" });
  });

  it("marks a claimed receipt completed only with the current lease", async () => {
    const fixture = receiptCollection();

    await completeWebhookReceipt(
      fixture.collection,
      "evt_1",
      "claim_1",
      new Date("2026-09-17T12:02:00.000Z"),
    );

    expect(fixture.updateOne).toHaveBeenCalledWith(
      { eventId: "evt_1", status: "processing", claimId: "claim_1" },
      expect.objectContaining({
        $set: expect.objectContaining({ status: "completed" }),
      }),
    );
  });

  it("makes failed processing immediately reclaimable", async () => {
    const fixture = receiptCollection();

    await failWebhookReceipt(
      fixture.collection,
      "evt_1",
      "claim_1",
      new Error("temporary dependency failure"),
      new Date("2026-09-17T12:02:00.000Z"),
    );

    expect(fixture.updateOne).toHaveBeenCalledWith(
      { eventId: "evt_1", status: "processing", claimId: "claim_1" },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "failed",
          lastError: "temporary dependency failure",
        }),
        $unset: { claimId: "", lockedUntil: "" },
      }),
    );
  });
});
