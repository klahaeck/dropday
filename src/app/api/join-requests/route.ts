import { NextResponse } from "next/server";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getMembershipEntitlement } from "@/lib/entitlements";
import { integrations } from "@/lib/env";
import { countActiveMemberships, createId, getClubMemberships } from "@/lib/repository";
import type { JoinRequest } from "@/types/domain";

const schema = z.object({ clubId: z.string().min(1).max(100), message: z.string().max(500).optional() });

export async function POST(request: Request) {
  const { profile, features } = await requireViewer();
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid join request" }, { status: 400 });
  const [activeCount, memberships] = await Promise.all([countActiveMemberships(profile.id), getClubMemberships(parsed.data.clubId)]);
  if (memberships.some((item) => item.userId === profile.id)) return NextResponse.json({ error: "You are already a member" }, { status: 409 });
  const entitlement = getMembershipEntitlement(profile.plan, activeCount, features.unlimitedMemberships);
  if (!entitlement.canActivateMembership) return NextResponse.json({ error: "Free accounts can join up to three clubs. Upgrade or leave a club before joining another.", entitlement }, { status: 402 });
  const timestamp = new Date().toISOString();
  const joinRequest: JoinRequest = {
    id: createId("join"), clubId: parsed.data.clubId, userId: profile.id, message: parsed.data.message,
    status: "pending", createdAt: timestamp, updatedAt: timestamp,
  };
  if (integrations.mongo) await (await getDb()).collection<JoinRequest>("joinRequests").insertOne(joinRequest);
  return NextResponse.json({ request: joinRequest, demo: !integrations.mongo }, { status: 201 });
}
