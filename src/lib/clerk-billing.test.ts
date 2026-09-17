import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clerkClient: vi.fn(),
  getUserBillingSubscription: vi.fn(),
  getUser: vi.fn(),
  applyBillingPlan: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: mocks.clerkClient,
}));

vi.mock("@/lib/billing-service", () => ({
  applyBillingPlan: mocks.applyBillingPlan,
}));

import {
  billedPlanFromSubscription,
  reconcileClerkBillingEntitlement,
} from "@/lib/clerk-billing";

function subscription(
  status: string,
  items: Array<{ id?: string; status: string; slug: string; periodEnd?: number | null }>,
) {
  return {
    status,
    subscriptionItems: items.map((item, index) => ({
      id: item.id ?? `item_${index + 1}`,
      status: item.status,
      periodEnd: item.periodEnd,
      plan: { slug: item.slug },
    })),
  };
}

describe("Clerk billing reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clerkClient.mockResolvedValue({
      billing: { getUserBillingSubscription: mocks.getUserBillingSubscription },
      users: { getUser: mocks.getUser },
    });
    mocks.getUser.mockResolvedValue({ privateMetadata: {} });
    mocks.applyBillingPlan.mockResolvedValue({ nextPlan: "free" });
  });

  it("maps only exact Clerk plan slugs", () => {
    expect(billedPlanFromSubscription(subscription("active", [
      { status: "active", slug: "selector" },
      { status: "active", slug: "resident_unlimited" },
    ]))).toBe("highest");

    expect(() => billedPlanFromSubscription(subscription("active", [
      { status: "active", slug: "resident_unlimited_preview" },
    ]))).toThrow("Unsupported active Clerk billing plan");
  });

  it("retains a canceled plan until its paid period ends", () => {
    expect(billedPlanFromSubscription(subscription("canceled", [
      { status: "canceled", slug: "resident", periodEnd: 2_000 },
    ]), 1_000)).toBe("middle");
    expect(billedPlanFromSubscription(subscription("canceled", [
      { status: "canceled", slug: "resident", periodEnd: 2_000 },
    ]), 3_000)).toBe("free");
  });

  it("reconciles the current subscription with complimentary metadata", async () => {
    mocks.getUserBillingSubscription.mockResolvedValue(subscription("active", [
      { status: "active", slug: "selector" },
    ]));
    mocks.getUser.mockResolvedValue({
      privateMetadata: { complimentaryPlan: "resident" },
    });

    await reconcileClerkBillingEntitlement("user_1");

    expect(mocks.applyBillingPlan).toHaveBeenCalledWith("user_1", "entry", "middle");
  });

  it("treats an authoritative missing subscription as free", async () => {
    mocks.getUserBillingSubscription.mockRejectedValue({ status: 404 });

    await reconcileClerkBillingEntitlement("user_1", { complimentaryPlan: null });

    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.applyBillingPlan).toHaveBeenCalledWith("user_1", "free", null);
  });

  it("retries when an active webhook is ahead of the billing read model", async () => {
    mocks.getUserBillingSubscription.mockResolvedValue(subscription("active", [
      { status: "active", slug: "free_user" },
    ]));

    await expect(reconcileClerkBillingEntitlement("user_1", {
      complimentaryPlan: null,
      expectedActivePlanSlug: "resident",
      expectedActiveSubscriptionItemId: "item_expected",
      convergenceAttempt: 1,
    })).rejects.toThrow("has not converged");
    expect(mocks.applyBillingPlan).not.toHaveBeenCalled();
  });

  it("accepts authoritative evidence that an out-of-order active event is stale", async () => {
    mocks.getUserBillingSubscription.mockResolvedValue(subscription("active", [
      { id: "item_old", status: "ended", slug: "resident_unlimited" },
      { id: "item_current", status: "active", slug: "selector" },
    ]));

    await reconcileClerkBillingEntitlement("user_1", {
      complimentaryPlan: null,
      expectedActivePlanSlug: "resident_unlimited",
      expectedActiveSubscriptionItemId: "item_old",
      convergenceAttempt: 1,
    });

    expect(mocks.applyBillingPlan).toHaveBeenCalledWith("user_1", "entry", null);
  });

  it("stops retrying an absent active item after bounded convergence attempts", async () => {
    mocks.getUserBillingSubscription.mockResolvedValue(subscription("active", [
      { id: "item_current", status: "active", slug: "selector" },
    ]));

    await reconcileClerkBillingEntitlement("user_1", {
      complimentaryPlan: null,
      expectedActivePlanSlug: "resident_unlimited",
      expectedActiveSubscriptionItemId: "item_missing",
      convergenceAttempt: 3,
    });

    expect(mocks.applyBillingPlan).toHaveBeenCalledWith("user_1", "entry", null);
  });
});
