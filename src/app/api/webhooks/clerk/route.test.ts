import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyWebhook: vi.fn(),
  getDb: vi.fn(),
  reconcileClerkBillingEntitlement: vi.fn(),
  claimWebhookReceipt: vi.fn(),
  completeWebhookReceipt: vi.fn(),
  failWebhookReceipt: vi.fn(),
  reportOperationalError: vi.fn(),
}));

vi.mock("@clerk/nextjs/webhooks", () => ({
  verifyWebhook: mocks.verifyWebhook,
}));

vi.mock("@/lib/db", () => ({
  getDb: mocks.getDb,
}));

vi.mock("@/lib/clerk-billing", () => ({
  reconcileClerkBillingEntitlement: mocks.reconcileClerkBillingEntitlement,
}));

vi.mock("@/lib/env", () => ({
  authentication: { mode: "clerk", issues: [] },
  env: { clerkWebhookSecret: "whsec_test" },
  integrations: { clerk: true, mongo: true },
}));

vi.mock("@/lib/webhook-receipts", () => ({
  claimWebhookReceipt: mocks.claimWebhookReceipt,
  completeWebhookReceipt: mocks.completeWebhookReceipt,
  failWebhookReceipt: mocks.failWebhookReceipt,
}));

vi.mock("@/lib/observability", () => ({
  reportOperationalError: mocks.reportOperationalError,
}));

import { POST } from "@/app/api/webhooks/clerk/route";

function request() {
  return new Request("http://localhost/api/webhooks/clerk", {
    method: "POST",
    headers: { "svix-id": "evt_1" },
  });
}

function subscriptionEvent(type: string, status: string) {
  return {
    type,
    data: {
      id: "sub_item_1",
      status,
      plan: { slug: "selector" },
      payer: { user_id: "user_1" },
    },
  };
}

describe("Clerk webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDb.mockResolvedValue({ collection: vi.fn(() => ({})) });
    mocks.claimWebhookReceipt.mockResolvedValue({
      status: "claimed",
      claimId: "claim_1",
      attempts: 2,
    });
    mocks.completeWebhookReceipt.mockResolvedValue(undefined);
    mocks.failWebhookReceipt.mockResolvedValue(undefined);
    mocks.reconcileClerkBillingEntitlement.mockResolvedValue({ nextPlan: "entry" });
  });

  it("reconciles active subscription items from authoritative Clerk state", async () => {
    mocks.verifyWebhook.mockResolvedValue(subscriptionEvent("subscriptionItem.active", "active"));

    const response = await POST(request() as never);

    expect(response.status).toBe(200);
    expect(mocks.reconcileClerkBillingEntitlement).toHaveBeenCalledWith("user_1", {
      expectedActivePlanSlug: "selector",
      expectedActiveSubscriptionItemId: "sub_item_1",
      convergenceAttempt: 2,
    });
    expect(mocks.completeWebhookReceipt).toHaveBeenCalledWith({}, "evt_1", "claim_1");
  });

  it("ignores incomplete events instead of granting their plan", async () => {
    mocks.verifyWebhook.mockResolvedValue(subscriptionEvent("subscriptionItem.incomplete", "incomplete"));

    const response = await POST(request() as never);

    expect(response.status).toBe(200);
    expect(mocks.reconcileClerkBillingEntitlement).not.toHaveBeenCalled();
    expect(mocks.completeWebhookReceipt).toHaveBeenCalledOnce();
  });

  it("marks processing failures retryable and returns a server error", async () => {
    mocks.verifyWebhook.mockResolvedValue(subscriptionEvent("subscriptionItem.ended", "ended"));
    mocks.reconcileClerkBillingEntitlement.mockRejectedValue(new Error("Clerk unavailable"));

    const response = await POST(request() as never);

    expect(response.status).toBe(500);
    expect(mocks.failWebhookReceipt).toHaveBeenCalledWith(
      {},
      "evt_1",
      "claim_1",
      expect.objectContaining({ message: "Clerk unavailable" }),
    );
    expect(mocks.completeWebhookReceipt).not.toHaveBeenCalled();
    expect(mocks.reportOperationalError).toHaveBeenCalledWith(
      "clerk-webhook.process",
      expect.objectContaining({ message: "Clerk unavailable" }),
      {
        eventId: "evt_1",
        eventType: "subscriptionItem.ended",
        userId: "user_1",
      },
    );
  });

  it("does not repeat completed events", async () => {
    mocks.verifyWebhook.mockResolvedValue(subscriptionEvent("subscriptionItem.active", "active"));
    mocks.claimWebhookReceipt.mockResolvedValue({ status: "completed" });

    const response = await POST(request() as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ duplicate: true });
    expect(mocks.reconcileClerkBillingEntitlement).not.toHaveBeenCalled();
  });

  it("keeps an in-flight event retryable until its processing lease completes", async () => {
    mocks.verifyWebhook.mockResolvedValue(subscriptionEvent("subscriptionItem.active", "active"));
    mocks.claimWebhookReceipt.mockResolvedValue({ status: "processing" });

    const response = await POST(request() as never);

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("5");
    expect(mocks.reconcileClerkBillingEntitlement).not.toHaveBeenCalled();
  });

  it("returns a client error only for signature verification failures", async () => {
    mocks.verifyWebhook.mockRejectedValue(new Error("bad signature"));

    const response = await POST(request() as never);

    expect(response.status).toBe(400);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
});
