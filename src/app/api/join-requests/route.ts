import { NextResponse } from "next/server";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { getMembershipEntitlement } from "@/lib/entitlements";
import {
  countActiveMemberships,
  createId,
  createOrGetPendingJoinRequest,
  getClubById,
  getClubMemberships,
  getPendingJoinRequest,
} from "@/lib/repository";
import type { JoinRequest } from "@/types/domain";

const schema = z.object({ clubId: z.string().min(1).max(100), message: z.string().max(500).optional() });

export async function POST(request: Request) {
  const { profile, features } = await requireViewer();
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid join request" }, { status: 400 });
  const [activeCount, club, memberships, existingRequest] = await Promise.all([
    countActiveMemberships(profile.id),
    getClubById(parsed.data.clubId),
    getClubMemberships(parsed.data.clubId),
    getPendingJoinRequest(parsed.data.clubId, profile.id),
  ]);
  if (!club || club.custody.status === "archived") return NextResponse.json({ error: "Club not found" }, { status: 404 });
  if (memberships.some((item) => item.userId === profile.id)) return NextResponse.json({ error: "You are already a member" }, { status: 409 });
  if (existingRequest) return NextResponse.json({ request: existingRequest });
  const entitlement = getMembershipEntitlement(profile.plan, activeCount, features.unlimitedMemberships);
  if (!entitlement.canActivateMembership) return NextResponse.json({ error: "Free accounts can join up to three clubs. Upgrade or leave a club before joining another.", entitlement }, { status: 402 });
  const timestamp = new Date().toISOString();
  const joinRequest: JoinRequest = {
    id: createId("join"), clubId: parsed.data.clubId, userId: profile.id, message: parsed.data.message,
    status: "pending", createdAt: timestamp, updatedAt: timestamp,
  };
  const result = await createOrGetPendingJoinRequest(joinRequest);
  return NextResponse.json({ request: result.request }, { status: result.created ? 201 : 200 });
}
