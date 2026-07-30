import { NextResponse } from "next/server";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { canUseClubManagement } from "@/lib/club-management";
import { getDb, getMongoClient } from "@/lib/db";
import { integrations } from "@/lib/env";
import { getClubBySlug, getClubMemberships } from "@/lib/repository";
import type { Club, ClubMembership } from "@/types/domain";

const schema = z.object({
  paused: z.boolean(),
  previousMemberIds: z.array(z.string().min(1)).min(1).max(1_000),
});

type QueueUpdateResult = {
  status: number;
  error?: string;
  memberIds: string[];
  paused: boolean;
};

function ordersMatch(first: string[], second: string[]): boolean {
  return first.length === second.length && first.every((memberId, index) => memberId === second[index]);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string; memberId: string }> },
) {
  const { slug, memberId } = await params;
  const { profile, features } = await requireViewer();
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a valid queue state." }, { status: 400 });
  }
  const club = await getClubBySlug(slug);
  if (!club) return NextResponse.json({ error: "Club not found." }, { status: 404 });

  const memberships = await getClubMemberships(club.id);
  const manager = memberships.find((membership) => membership.userId === profile.id);
  const target = memberships.find((membership) => membership.userId === memberId);
  if (!canUseClubManagement(manager, features.clubAdminTools)) {
    return NextResponse.json({ error: "You cannot manage this club." }, { status: 403 });
  }
  if (!target) return NextResponse.json({ error: "Member not found." }, { status: 404 });

  const { paused, previousMemberIds } = parsed.data;
  if (!integrations.mongo) {
    if (!ordersMatch(club.rotationMemberIds, previousMemberIds)) {
      return NextResponse.json(
        { error: "The queue changed. Review the latest order and try again.", memberIds: club.rotationMemberIds, paused: target.queuePaused },
        { status: 409 },
      );
    }
    const activeQueueMemberCount = club.rotationMemberIds.filter((userId) =>
      !memberships.find((membership) => membership.userId === userId)?.queuePaused
    ).length;
    if (paused && !target.queuePaused && activeQueueMemberCount === 1) {
      return NextResponse.json(
        { error: "At least one member must remain in the rotation.", memberIds: club.rotationMemberIds, paused: false },
        { status: 409 },
      );
    }

    const timestamp = new Date().toISOString();
    club.updatedAt = timestamp;
    target.queuePaused = paused;
    target.updatedAt = timestamp;
    return NextResponse.json({ memberIds: club.rotationMemberIds, paused, demo: true });
  }

  const db = await getDb();
  const client = await getMongoClient();
  let outcome: QueueUpdateResult | undefined;

  try {
    await client.withSession(async (session) => session.withTransaction(async () => {
      const currentClub = await db.collection<Club>("clubs").findOne({ id: club.id }, { session });

      if (!currentClub) {
        outcome = { status: 404, error: "Club not found.", memberIds: [], paused };
        return;
      }
      const currentMemberships = await db.collection<ClubMembership>("memberships")
        .find({ clubId: club.id, status: "active" }, { session })
        .toArray();
      const currentManager = currentMemberships.find((membership) => membership.userId === profile.id);
      const currentTarget = currentMemberships.find((membership) => membership.userId === memberId);
      if (!canUseClubManagement(currentManager, features.clubAdminTools)) {
        outcome = { status: 403, error: "You cannot manage this club.", memberIds: currentClub.rotationMemberIds, paused };
        return;
      }
      if (!currentTarget) {
        outcome = { status: 404, error: "Member not found.", memberIds: currentClub.rotationMemberIds, paused };
        return;
      }
      if (!ordersMatch(currentClub.rotationMemberIds, previousMemberIds)) {
        outcome = {
          status: 409,
          error: "The queue changed. Review the latest order and try again.",
          memberIds: currentClub.rotationMemberIds,
          paused: currentTarget.queuePaused,
        };
        return;
      }
      const activeQueueMemberCount = currentClub.rotationMemberIds.filter((userId) =>
        !currentMemberships.find((membership) => membership.userId === userId)?.queuePaused
      ).length;
      if (paused && !currentTarget.queuePaused && activeQueueMemberCount === 1) {
        outcome = {
          status: 409,
          error: "At least one member must remain in the rotation.",
          memberIds: currentClub.rotationMemberIds,
          paused: false,
        };
        return;
      }

      const timestamp = new Date().toISOString();
      const clubUpdate = await db.collection<Club>("clubs").updateOne(
        { id: currentClub.id, rotationMemberIds: currentClub.rotationMemberIds },
        { $set: { updatedAt: timestamp } },
        { session },
      );
      const membershipUpdate = await db.collection<ClubMembership>("memberships").updateOne(
        { id: currentTarget.id, status: "active" },
        { $set: { queuePaused: paused, updatedAt: timestamp } },
        { session },
      );
      if (!clubUpdate.matchedCount || !membershipUpdate.matchedCount) {
        throw new Error("Queue state changed during the update");
      }
      outcome = { status: 200, memberIds: currentClub.rotationMemberIds, paused };
    }));
  } catch {
    return NextResponse.json({ error: "Could not update this member's queue state." }, { status: 500 });
  }

  if (!outcome) {
    return NextResponse.json({ error: "Could not update this member's queue state." }, { status: 500 });
  }
  return NextResponse.json(
    {
      ...(outcome.error ? { error: outcome.error } : {}),
      memberIds: outcome.memberIds,
      paused: outcome.paused,
    },
    { status: outcome.status },
  );
}
