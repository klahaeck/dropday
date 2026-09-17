import type { Db } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { reconcileClerkBillingEntitlement } from "@/lib/clerk-billing";
import { getDb } from "@/lib/db";
import { DEFAULT_EMAIL_PREFERENCES } from "@/lib/email-preferences";
import { authentication, env, integrations } from "@/lib/env";
import { reportOperationalError } from "@/lib/observability";
import { persistWithUniqueUserName, type ResolvedUserName } from "@/lib/user-name";
import {
  claimWebhookReceipt,
  completeWebhookReceipt,
  failWebhookReceipt,
  type WebhookReceipt,
} from "@/lib/webhook-receipts";
import type { UserProfile } from "@/types/domain";

type ClerkWebhookEvent = Awaited<ReturnType<typeof verifyWebhook>>;

function userIdForEvent(event: ClerkWebhookEvent): string | undefined {
  if (event.type === "user.created" || event.type === "user.updated") return event.data.id;
  if ("payer" in event.data) return event.data.payer?.user_id;
  return undefined;
}

async function processWebhookEvent(
  event: ClerkWebhookEvent,
  db: Db,
  deliveryAttempt: number,
): Promise<void> {
  if (event.type === "user.created" || event.type === "user.updated") {
    const data = event.data;
    const timestamp = new Date().toISOString();
    const users = db.collection<UserProfile>("users");
    const existingProfile = await users.findOne({ clerkUserId: data.id });
    const identity = {
      userId: data.id,
      firstName: data.first_name,
      lastName: data.last_name,
    };
    await persistWithUniqueUserName({
      identity,
      existing: existingProfile,
      persist: async (name: ResolvedUserName) => users.updateOne(
        { clerkUserId: data.id },
        {
          $set: {
            id: data.id,
            clerkUserId: data.id,
            firstName: name.firstName,
            lastName: name.lastName,
            displayName: name.displayName,
            initials: name.initials,
            ...(name.generatedNameKey ? { generatedNameKey: name.generatedNameKey } : {}),
            imageUrl: data.image_url,
            primaryEmail: data.email_addresses?.find((email) => email.id === data.primary_email_address_id)?.email_address,
            updatedAt: timestamp,
          },
          $setOnInsert: {
            plan: "free",
            billedPlan: "free",
            emailNotifications: true,
            emailPreferences: DEFAULT_EMAIL_PREFERENCES,
            themePreference: "system",
            skinPreference: "classic",
            createdAt: timestamp,
          },
          ...(!name.generatedNameKey ? { $unset: { generatedNameKey: "" } } : {}),
        },
        { upsert: true },
      ),
    });
    return;
  }

  // Cancellation retains access through the paid period. Incomplete,
  // abandoned, upcoming, and past-due events cannot grant new access.
  if (event.type === "subscriptionItem.active") {
    const userId = event.data.payer?.user_id;
    const planSlug = event.data.plan?.slug;
    if (userId) {
      if (!planSlug) throw new Error("Active Clerk subscription item is missing a plan slug");
      await reconcileClerkBillingEntitlement(userId, {
        expectedActivePlanSlug: planSlug,
        expectedActiveSubscriptionItemId: event.data.id,
        convergenceAttempt: deliveryAttempt,
      });
    }
    return;
  }
  if (event.type === "subscriptionItem.ended") {
    const userId = event.data.payer?.user_id;
    if (userId) await reconcileClerkBillingEntitlement(userId);
  }
}

export async function POST(request: NextRequest) {
  if (
    authentication.mode !== "clerk"
    || !integrations.mongo
    || !env.clerkWebhookSecret
  ) {
    return NextResponse.json(
      { error: "Clerk, MongoDB, and the Clerk webhook secret are required for webhooks." },
      { status: 503 },
    );
  }

  let event: ClerkWebhookEvent;
  try {
    event = await verifyWebhook(request);
  } catch (error) {
    reportOperationalError("clerk-webhook.verify", error, {
      eventId: request.headers.get("svix-id"),
    });
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  const eventId = request.headers.get("svix-id");
  if (!eventId) {
    return NextResponse.json({ error: "Webhook event ID is required." }, { status: 400 });
  }

  let db: Db;
  try {
    db = await getDb();
  } catch (error) {
    reportOperationalError("clerk-webhook.storage", error, {
      eventId,
      eventType: event.type,
      userId: userIdForEvent(event),
    });
    return NextResponse.json({ error: "Webhook storage is unavailable." }, { status: 503 });
  }

  const receipts = db.collection<WebhookReceipt>("webhookReceipts");
  let claim;
  try {
    claim = await claimWebhookReceipt(receipts, eventId, event.type);
  } catch (error) {
    reportOperationalError("clerk-webhook.claim", error, {
      eventId,
      eventType: event.type,
      userId: userIdForEvent(event),
    });
    return NextResponse.json({ error: "Webhook receipt could not be claimed." }, { status: 503 });
  }
  if (claim.status === "completed") return NextResponse.json({ duplicate: true });
  if (claim.status === "processing") {
    // Do not acknowledge an in-flight delivery: if the original worker dies,
    // Clerk must retry until the receipt lease can be reclaimed.
    return NextResponse.json(
      { error: "Webhook processing is already in progress." },
      { status: 503, headers: { "Retry-After": "5" } },
    );
  }

  try {
    await processWebhookEvent(event, db, claim.attempts);
    await completeWebhookReceipt(receipts, eventId, claim.claimId);
    return NextResponse.json({ received: true });
  } catch (error) {
    await failWebhookReceipt(receipts, eventId, claim.claimId, error).catch((receiptError) => {
      reportOperationalError("clerk-webhook.fail-receipt", receiptError, {
        eventId,
        eventType: event.type,
        userId: userIdForEvent(event),
      });
    });
    reportOperationalError("clerk-webhook.process", error, {
      eventId,
      eventType: event.type,
      userId: userIdForEvent(event),
    });
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
