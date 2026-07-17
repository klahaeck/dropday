import { getDb, getMongoClient } from "@/lib/db";
import {
  demoClubs,
  demoJoinRequests,
  demoMemberships,
  demoNotifications,
  demoUserById,
} from "@/lib/demo-data";
import { featureAccessForPlan, getMembershipEntitlement } from "@/lib/entitlements";
import { integrations } from "@/lib/env";
import { createId } from "@/lib/repository";
import type {
  Club,
  ClubMembership,
  JoinRequest,
  Notification,
  UserProfile,
} from "@/types/domain";

export type JoinRequestDecision = "approve" | "decline";

export class JoinRequestDecisionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "JoinRequestDecisionError";
  }
}

export function canManageJoinRequests(
  membership: ClubMembership | null | undefined,
  hasClubAdminTools: boolean,
): boolean {
  return Boolean(
    hasClubAdminTools
    && membership?.status === "active"
    && (membership.role === "owner" || membership.role === "admin"),
  );
}

export function planJoinRequestApproval({
  request,
  requester,
  existingMembership,
  activeMembershipCount,
  timestamp,
  membershipId,
}: {
  request: JoinRequest;
  requester: UserProfile | null;
  existingMembership?: ClubMembership | null;
  activeMembershipCount: number;
  timestamp: string;
  membershipId: string;
}): { membership: ClubMembership; addsMember: boolean } {
  if (existingMembership?.status === "active") {
    return { membership: existingMembership, addsMember: false };
  }
  if (!requester) throw new JoinRequestDecisionError("Requester profile not found.", 404);

  const features = featureAccessForPlan(requester.plan);
  const entitlement = getMembershipEntitlement(
    requester.plan,
    activeMembershipCount,
    features.unlimitedMemberships,
  );
  if (!entitlement.canActivateMembership) {
    throw new JoinRequestDecisionError(
      "This person has reached their current club membership limit.",
      409,
    );
  }

  return {
    membership: {
      id: existingMembership?.id ?? membershipId,
      clubId: request.clubId,
      userId: request.userId,
      role: "member",
      status: "active",
      queuePaused: false,
      joinedAt: timestamp,
      updatedAt: timestamp,
    },
    addsMember: true,
  };
}

function decisionNotification(
  request: JoinRequest,
  club: Club,
  decision: JoinRequestDecision,
  timestamp: string,
): Notification {
  const approved = decision === "approve";
  return {
    id: createId("notification"),
    userId: request.userId,
    kind: "membership",
    title: approved ? `You joined ${club.name}` : `Request to join ${club.name}`,
    body: approved
      ? "Your request was approved and you are now in the rotation."
      : "A club administrator declined your request.",
    href: approved ? `/app/clubs/${club.slug}` : undefined,
    createdAt: timestamp,
  };
}

function decideDemoJoinRequest(
  requestId: string,
  decision: JoinRequestDecision,
  actorUserId: string,
  hasClubAdminTools: boolean,
) {
  const request = demoJoinRequests.find((item) => item.id === requestId);
  if (!request) throw new JoinRequestDecisionError("Join request not found.", 404);
  if (request.status !== "pending") throw new JoinRequestDecisionError("This request was already handled.", 409);
  const club = demoClubs.find((item) => item.id === request.clubId);
  if (!club) throw new JoinRequestDecisionError("Club not found.", 404);
  const manager = demoMemberships.find((membership) =>
    membership.clubId === club.id && membership.userId === actorUserId && membership.status === "active"
  );
  if (!canManageJoinRequests(manager, hasClubAdminTools)) {
    throw new JoinRequestDecisionError("You cannot manage requests for this club.", 403);
  }

  const timestamp = new Date().toISOString();
  let membership: ClubMembership | undefined;
  if (decision === "approve") {
    const existingMembership = demoMemberships.find((item) =>
      item.clubId === request.clubId && item.userId === request.userId
    );
    const requester = demoUserById(request.userId) ?? null;
    const activeMembershipCount = demoMemberships.filter((item) =>
      item.userId === request.userId && item.status === "active"
    ).length;
    const approval = planJoinRequestApproval({
      request,
      requester,
      existingMembership,
      activeMembershipCount,
      timestamp,
      membershipId: createId("membership"),
    });
    membership = approval.membership;
    if (approval.addsMember) {
      if (existingMembership) Object.assign(existingMembership, membership);
      else demoMemberships.push(membership);
      if (!club.rotationMemberIds.includes(request.userId)) {
        club.rotationMemberIds.push(request.userId);
        club.memberCount += 1;
      }
      club.updatedAt = timestamp;
    }
  }

  request.status = decision === "approve" ? "approved" : "declined";
  request.updatedAt = timestamp;
  demoNotifications.unshift(decisionNotification(request, club, decision, timestamp));
  return { request, membership, demo: true };
}

export async function decideJoinRequest({
  requestId,
  decision,
  actorUserId,
  hasClubAdminTools,
}: {
  requestId: string;
  decision: JoinRequestDecision;
  actorUserId: string;
  hasClubAdminTools: boolean;
}): Promise<{ request: JoinRequest; membership?: ClubMembership; demo: boolean }> {
  if (!hasClubAdminTools) {
    throw new JoinRequestDecisionError("Your current plan does not include club administration.", 403);
  }
  if (!integrations.mongo) {
    return decideDemoJoinRequest(requestId, decision, actorUserId, hasClubAdminTools);
  }

  const db = await getDb();
  const client = await getMongoClient();
  let result: { request: JoinRequest; membership?: ClubMembership; demo: boolean } | undefined;

  await client.withSession(async (session) => session.withTransaction(async () => {
    const request = await db.collection<JoinRequest>("joinRequests").findOne({ id: requestId }, { session });
    if (!request) throw new JoinRequestDecisionError("Join request not found.", 404);
    if (request.status !== "pending") throw new JoinRequestDecisionError("This request was already handled.", 409);

    const club = await db.collection<Club>("clubs").findOne({ id: request.clubId }, { session });
    if (!club) throw new JoinRequestDecisionError("Club not found.", 404);
    const manager = await db.collection<ClubMembership>("memberships").findOne(
      { clubId: club.id, userId: actorUserId, status: "active" },
      { session },
    );
    if (!canManageJoinRequests(manager, hasClubAdminTools)) {
      throw new JoinRequestDecisionError("You cannot manage requests for this club.", 403);
    }

    const timestamp = new Date().toISOString();
    let membership: ClubMembership | undefined;
    if (decision === "approve") {
      const existingMembership = await db.collection<ClubMembership>("memberships").findOne(
        { clubId: request.clubId, userId: request.userId },
        { session },
      );
      const [requester, activeMembershipCount] = existingMembership?.status === "active"
        ? [null, 0] as const
        : await Promise.all([
          db.collection<UserProfile>("users").findOne({ id: request.userId }, { session }),
          db.collection<ClubMembership>("memberships").countDocuments(
            { userId: request.userId, status: "active" },
            { session },
          ),
        ]);
      const approval = planJoinRequestApproval({
        request,
        requester,
        existingMembership,
        activeMembershipCount,
        timestamp,
        membershipId: createId("membership"),
      });
      membership = approval.membership;

      if (approval.addsMember) {
        if (existingMembership) {
          await db.collection<ClubMembership>("memberships").updateOne(
            { id: existingMembership.id },
            { $set: membership },
            { session },
          );
        } else {
          await db.collection<ClubMembership>("memberships").insertOne(membership, { session });
        }
        await db.collection<Club>("clubs").updateOne(
          { id: club.id, rotationMemberIds: { $ne: request.userId } },
          {
            $addToSet: { rotationMemberIds: request.userId },
            $inc: { memberCount: 1 },
            $set: { updatedAt: timestamp },
          },
          { session },
        );
      }
    }

    const nextStatus = decision === "approve" ? "approved" : "declined";
    const update = await db.collection<JoinRequest>("joinRequests").updateOne(
      { id: request.id, status: "pending" },
      { $set: { status: nextStatus, updatedAt: timestamp } },
      { session },
    );
    if (update.modifiedCount !== 1) {
      throw new JoinRequestDecisionError("This request was already handled.", 409);
    }

    const resolvedRequest: JoinRequest = { ...request, status: nextStatus, updatedAt: timestamp };
    await db.collection<Notification>("notifications").insertOne(
      decisionNotification(resolvedRequest, club, decision, timestamp),
      { session },
    );
    result = { request: resolvedRequest, membership, demo: false };
  }));

  if (!result) throw new JoinRequestDecisionError("Could not update this request.", 500);
  return result;
}
