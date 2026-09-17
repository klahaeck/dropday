import { clerkClient } from "@clerk/nextjs/server";
import { applyBillingPlan } from "@/lib/billing-service";
import { highestPlan, planFromPrivateMetadata } from "@/lib/entitlements";
import type { PlanKey } from "@/types/domain";

const CLERK_PLAN_KEYS: Record<string, PlanKey> = {
  free_user: "free",
  selector: "entry",
  resident: "middle",
  resident_unlimited: "highest",
};

const MAX_ACTIVE_EVENT_CONVERGENCE_ATTEMPTS = 3;

function planFromClerkSlug(slug: string): PlanKey {
  const plan = CLERK_PLAN_KEYS[slug];
  if (!plan) throw new Error(`Unsupported active Clerk billing plan: ${slug}`);
  return plan;
}

interface ClerkBillingSubscriptionItemLike {
  id: string;
  status: string;
  periodEnd?: number | null;
  plan: { slug: string } | null;
}

interface ClerkBillingSubscriptionLike {
  status: string;
  subscriptionItems: ClerkBillingSubscriptionItemLike[];
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === "object"
    && "status" in error
    && (error as { status?: unknown }).status === 404
  );
}

export function billedPlanFromSubscription(
  subscription: ClerkBillingSubscriptionLike | null,
  now = Date.now(),
): PlanKey {
  if (!subscription) return "free";
  if (["ended", "abandoned", "incomplete", "expired"].includes(subscription.status)) return "free";

  const entitledItems = subscription.subscriptionItems.filter((item) => (
    item.status === "active"
    || item.status === "past_due"
    || (item.status === "canceled" && item.periodEnd !== null && item.periodEnd !== undefined && item.periodEnd > now)
  ));
  if (!entitledItems.length) return "free";

  return entitledItems.reduce<PlanKey>((plan, item) => {
    const slug = item.plan?.slug;
    if (!slug) throw new Error("Unsupported active Clerk billing plan: missing");
    return highestPlan(plan, planFromClerkSlug(slug));
  }, "free");
}

export async function reconcileClerkBillingEntitlement(
  userId: string,
  options: {
    complimentaryPlan?: PlanKey | null;
    expectedActivePlanSlug?: string;
    expectedActiveSubscriptionItemId?: string;
    convergenceAttempt?: number;
  } = {},
) {
  const client = await clerkClient();
  const subscriptionPromise = client.billing.getUserBillingSubscription(userId)
    .catch((error: unknown) => {
      if (isNotFoundError(error)) return null;
      throw error;
    });
  const complimentaryPlanPromise = options.complimentaryPlan === undefined
    ? client.users.getUser(userId).then((user) => planFromPrivateMetadata(user.privateMetadata))
    : Promise.resolve(options.complimentaryPlan);
  const [subscription, complimentaryPlan] = await Promise.all([
    subscriptionPromise,
    complimentaryPlanPromise,
  ]);
  const billedPlan = billedPlanFromSubscription(subscription);
  if (options.expectedActivePlanSlug) {
    const expectedPlan = planFromClerkSlug(options.expectedActivePlanSlug);
    if (highestPlan(billedPlan, expectedPlan) !== billedPlan) {
      const expectedItem = options.expectedActiveSubscriptionItemId
        ? subscription?.subscriptionItems.find(
            (item) => item.id === options.expectedActiveSubscriptionItemId,
          )
        : undefined;
      const authoritativeItemProvesEventIsStale = Boolean(
        expectedItem
        && (
          expectedItem.status !== "active"
          || expectedItem.plan?.slug !== options.expectedActivePlanSlug
        ),
      );
      const convergenceAttempt = Math.max(1, options.convergenceAttempt ?? 1);
      if (
        !authoritativeItemProvesEventIsStale
        && convergenceAttempt < MAX_ACTIVE_EVENT_CONVERGENCE_ATTEMPTS
      ) {
        throw new Error("Clerk billing state has not converged to the active webhook event");
      }
    }
  }
  return applyBillingPlan(userId, billedPlan, complimentaryPlan);
}
