import { NextRequest, NextResponse } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { applyBillingPlan } from "@/lib/billing-service";
import { getDb } from "@/lib/db";
import { DEFAULT_EMAIL_PREFERENCES } from "@/lib/email-preferences";
import { integrations } from "@/lib/env";
import { persistWithUniqueUserName, type ResolvedUserName } from "@/lib/user-name";
import type { PlanKey, UserProfile } from "@/types/domain";

function planFromPayload(payload: unknown): PlanKey {
  const text = JSON.stringify(payload).toLowerCase();
  if (text.includes("resident_unlimited")) return "highest";
  if (text.includes("resident")) return "middle";
  if (text.includes("selector")) return "entry";
  return "free";
}

function userIdFromPayload(payload: unknown): string | undefined {
  const data = payload as Record<string, unknown>;
  const payer = data.payer as Record<string, unknown> | undefined;
  return [data.user_id, data.userId, payer?.user_id, payer?.id].find((value): value is string => typeof value === "string");
}

export async function POST(request: NextRequest) {
  if (!integrations.mongo) return NextResponse.json({ error: "MongoDB is required for webhooks" }, { status: 503 });
  try {
    const event = await verifyWebhook(request);
    const eventId = request.headers.get("svix-id") ?? `${event.type}:${"id" in event.data ? event.data.id : Date.now()}`;
    const db = await getDb();
    try {
      await db.collection("webhookReceipts").insertOne({ eventId, eventType: event.type, receivedAt: new Date().toISOString() });
    } catch (error) {
      if (error instanceof Error && error.message.includes("duplicate key")) return NextResponse.json({ duplicate: true });
      throw error;
    }

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
    }

    if (event.type.startsWith("subscriptionItem.")) {
      const userId = userIdFromPayload(event.data);
      if (userId) {
        const nextPlan = event.type === "subscriptionItem.ended" ? "free" : planFromPayload(event.data);
        if (event.type !== "subscriptionItem.canceled" && event.type !== "subscriptionItem.upcoming") await applyBillingPlan(userId, nextPlan);
      }
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid webhook" }, { status: 400 });
  }
}
