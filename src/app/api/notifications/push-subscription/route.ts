import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { isAllowedPushEndpoint } from "@/lib/browser-push";
import { getDb } from "@/lib/db";
import { integrations } from "@/lib/env";
import type { BrowserPushSubscription } from "@/types/domain";

const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2048).refine(
    isAllowedPushEndpoint,
    "Unsupported push service",
  ),
  expirationTime: z.number().int().positive().nullable(),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
});

const deleteSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
});

function subscriptionId(endpoint: string): string {
  return `browser_push_${createHash("sha256").update(endpoint).digest("hex")}`;
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!integrations.mongo || !integrations.browserPush) {
    return NextResponse.json({ error: "Browser notifications are not configured" }, { status: 503 });
  }

  const parsed = pushSubscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 });
  }

  const timestamp = new Date().toISOString();
  const subscription: BrowserPushSubscription = {
    id: subscriptionId(parsed.data.endpoint),
    userId: viewer.profile.id,
    ...parsed.data,
    userAgent: request.headers.get("user-agent")?.slice(0, 500),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await (await getDb()).collection<BrowserPushSubscription>("browserPushSubscriptions").updateOne(
    { endpoint: subscription.endpoint },
    {
      $set: {
        id: subscription.id,
        userId: subscription.userId,
        expirationTime: subscription.expirationTime,
        keys: subscription.keys,
        userAgent: subscription.userAgent,
        updatedAt: timestamp,
      },
      $setOnInsert: { endpoint: subscription.endpoint, createdAt: timestamp },
    },
    { upsert: true },
  );

  return NextResponse.json({ subscribed: true });
}

export async function DELETE(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!integrations.mongo) {
    return NextResponse.json({ error: "Browser notifications are not configured" }, { status: 503 });
  }

  const parsed = deleteSubscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 });
  }

  await (await getDb()).collection<BrowserPushSubscription>("browserPushSubscriptions")
    .deleteOne({ endpoint: parsed.data.endpoint, userId: viewer.profile.id });
  return NextResponse.json({ subscribed: false });
}
