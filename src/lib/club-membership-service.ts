import { deliverBrowserNotification } from "@/lib/browser-push";
import { canUseClubManagement } from "@/lib/club-management";
import { getDb, getMongoClient } from "@/lib/db";
import {
  demoAuditEvents,
  demoClubs,
  demoDrops,
  demoMemberships,
  demoNotifications,
} from "@/lib/demo-data";
import { integrations } from "@/lib/env";
import { createId } from "@/lib/repository";
import type {
  AuditEvent,
  Club,
  ClubMembership,
  DropSlot,
  Notification,
} from "@/types/domain";

export type ClubMembershipTransitionKind = "leave" | "remove";

export class ClubMembershipTransitionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ClubMembershipTransitionError";
  }
}

export interface ClubMembershipTransitionOutcome {
  changed: boolean;
  membershipId: string;
  memberId: string;
  status: "left" | "removed";
  memberIds: string[];
  memberCount: number;
  redirectRequired: boolean;
  reassignedMemberId?: string;
  playlistDetached: boolean;
  demo: boolean;
}

export interface ClubMembershipTransitionPlan {
  changed: boolean;
  membership: ClubMembership;
  club: Club;
  drop?: DropSlot;
  audit?: AuditEvent;
  notification?: Notification;
  outcome: Omit<ClubMembershipTransitionOutcome, "demo">;
}

function expectedStatus(kind: ClubMembershipTransitionKind) {
  return kind === "leave" ? "left" as const : "removed" as const;
}

function assertRemovalAllowed({
  actorMembership,
  targetMembership,
  actorUserId,
  hasClubAdminTools,
}: {
  actorMembership: ClubMembership | null | undefined;
  targetMembership: ClubMembership;
  actorUserId: string;
  hasClubAdminTools: boolean;
}) {
  if (actorUserId === targetMembership.userId) {
    throw new ClubMembershipTransitionError(
      "Use the leave-club action to remove your own membership.",
      409,
    );
  }
  if (!canUseClubManagement(actorMembership, hasClubAdminTools)) {
    throw new ClubMembershipTransitionError("You cannot remove members from this club.", 403);
  }
  if (targetMembership.role === "owner") {
    throw new ClubMembershipTransitionError(
      "Owners must be demoted or transfer ownership before removal.",
      409,
    );
  }
  if (actorMembership?.role === "admin" && targetMembership.role !== "member") {
    throw new ClubMembershipTransitionError(
      "Only an owner can remove a club administrator.",
      403,
    );
  }
}

export function planClubMembershipTransition({
  club,
  memberships,
  actorMembership,
  targetMembership,
  activeDrop,
  kind,
  actorUserId,
  targetUserId,
  hasClubAdminTools,
  timestamp,
  auditId,
  notificationId,
}: {
  club: Club;
  memberships: ClubMembership[];
  actorMembership?: ClubMembership | null;
  targetMembership?: ClubMembership | null;
  activeDrop?: DropSlot | null;
  kind: ClubMembershipTransitionKind;
  actorUserId: string;
  targetUserId: string;
  hasClubAdminTools: boolean;
  timestamp: string;
  auditId: string;
  notificationId: string;
}): ClubMembershipTransitionPlan {
  if (club.custody.status === "archived") {
    throw new ClubMembershipTransitionError("This club is archived.", 409);
  }
  if (!targetMembership || targetMembership.clubId !== club.id || targetMembership.userId !== targetUserId) {
    throw new ClubMembershipTransitionError("Member not found.", 404);
  }

  if (kind === "leave") {
    if (actorUserId !== targetUserId) {
      throw new ClubMembershipTransitionError("You can only leave your own membership.", 403);
    }
    if (club.custody.activeOwnerId === targetUserId) {
      throw new ClubMembershipTransitionError(
        "Transfer primary ownership before leaving this club.",
        409,
      );
    }
  } else {
    assertRemovalAllowed({
      actorMembership,
      targetMembership,
      actorUserId,
      hasClubAdminTools,
    });
  }

  const terminalStatus = expectedStatus(kind);
  if (targetMembership.status !== "active") {
    if (targetMembership.status !== terminalStatus) {
      throw new ClubMembershipTransitionError("This membership is no longer active.", 409);
    }
    return {
      changed: false,
      membership: targetMembership,
      club,
      outcome: {
        changed: false,
        membershipId: targetMembership.id,
        memberId: targetMembership.userId,
        status: terminalStatus,
        memberIds: [...club.rotationMemberIds],
        memberCount: club.memberCount,
        redirectRequired: kind === "leave",
        playlistDetached: false,
      },
    };
  }

  if (!club.rotationMemberIds.includes(targetUserId) || club.memberCount < 1) {
    throw new ClubMembershipTransitionError(
      "Club membership state changed. Refresh and try again.",
      409,
    );
  }

  if (club.activeDropId && (!activeDrop || activeDrop.id !== club.activeDropId)) {
    throw new ClubMembershipTransitionError(
      "The active drop could not be loaded. Refresh and try again.",
      409,
    );
  }

  const memberIds = club.rotationMemberIds.filter((userId) => userId !== targetUserId);
  const isActiveTurn = Boolean(
    activeDrop
    && activeDrop.id === club.activeDropId
    && activeDrop.assignedUserId === targetUserId
    && (activeDrop.status === "scheduled" || activeDrop.status === "overdue"),
  );
  let reassignedMemberId: string | undefined;
  let nextDrop: DropSlot | undefined;
  if (isActiveTurn && activeDrop) {
    const activeMemberships = new Map(
      memberships
        .filter((membership) => membership.status === "active" && membership.userId !== targetUserId)
        .map((membership) => [membership.userId, membership]),
    );
    const targetQueueIndex = club.rotationMemberIds.indexOf(targetUserId);
    const circularCandidates = [
      ...club.rotationMemberIds.slice(targetQueueIndex + 1),
      ...club.rotationMemberIds.slice(0, targetQueueIndex),
    ];
    reassignedMemberId = circularCandidates.find((userId) => {
      const membership = activeMemberships.get(userId);
      return membership && !membership.queuePaused;
    });
    if (!reassignedMemberId) {
      throw new ClubMembershipTransitionError(
        "No eligible member can take over the active drop. Resume or add another member first.",
        409,
      );
    }
    nextDrop = {
      ...activeDrop,
      assignedUserId: reassignedMemberId,
      updatedAt: timestamp,
    };
    delete nextDrop.playlist;
  }

  const membership: ClubMembership = {
    ...targetMembership,
    status: terminalStatus,
    queuePaused: false,
    updatedAt: timestamp,
  };
  const nextClub: Club = {
    ...club,
    rotationMemberIds: memberIds,
    memberCount: club.memberCount - 1,
    updatedAt: timestamp,
  };
  const audit: AuditEvent = {
    id: auditId,
    clubId: club.id,
    actorUserId,
    action: kind === "leave" ? "membership.left" : "membership.removed",
    metadata: {
      memberUserId: targetUserId,
      previousRole: targetMembership.role,
      ...(reassignedMemberId ? { reassignedMemberId } : {}),
      playlistDetached: Boolean(activeDrop?.playlist && isActiveTurn),
    },
    createdAt: timestamp,
  };
  const notification: Notification | undefined = kind === "remove"
    ? {
      id: notificationId,
      userId: targetUserId,
      kind: "membership",
      title: `You were removed from ${club.name}`,
      body: reassignedMemberId
        ? "Your membership ended and your active drop was reassigned."
        : "A club manager ended your membership.",
      href: "/app/clubs",
      createdAt: timestamp,
    }
    : undefined;

  return {
    changed: true,
    membership,
    club: nextClub,
    ...(nextDrop ? { drop: nextDrop } : {}),
    audit,
    ...(notification ? { notification } : {}),
    outcome: {
      changed: true,
      membershipId: membership.id,
      memberId: membership.userId,
      status: terminalStatus,
      memberIds,
      memberCount: nextClub.memberCount,
      redirectRequired: kind === "leave",
      ...(reassignedMemberId ? { reassignedMemberId } : {}),
      playlistDetached: Boolean(activeDrop?.playlist && isActiveTurn),
    },
  };
}

export async function transitionClubMembership({
  clubSlug,
  targetUserId,
  actorUserId,
  kind,
  hasClubAdminTools,
}: {
  clubSlug: string;
  targetUserId: string;
  actorUserId: string;
  kind: ClubMembershipTransitionKind;
  hasClubAdminTools: boolean;
}): Promise<ClubMembershipTransitionOutcome> {
  if (!integrations.mongo) {
    const club = demoClubs.find((candidate) => candidate.slug === clubSlug);
    if (!club) throw new ClubMembershipTransitionError("Club not found.", 404);
    const memberships = demoMemberships.filter((membership) => membership.clubId === club.id);
    const targetMembership = memberships.find((membership) => membership.userId === targetUserId);
    const actorMembership = memberships.find((membership) => membership.userId === actorUserId);
    const activeDrop = club.activeDropId
      ? demoDrops.find((drop) => drop.id === club.activeDropId)
      : undefined;
    const timestamp = new Date().toISOString();
    const plan = planClubMembershipTransition({
      club,
      memberships,
      actorMembership,
      targetMembership,
      activeDrop,
      kind,
      actorUserId,
      targetUserId,
      hasClubAdminTools,
      timestamp,
      auditId: createId("audit"),
      notificationId: createId("notification"),
    });
    if (plan.changed) {
      if (!targetMembership || !plan.audit) {
        throw new ClubMembershipTransitionError("Could not update this membership.", 500);
      }
      Object.assign(targetMembership, plan.membership);
      Object.assign(club, plan.club);
      if (plan.drop && activeDrop) {
        Object.assign(activeDrop, plan.drop);
        delete activeDrop.playlist;
      }
      demoAuditEvents.unshift(plan.audit);
      if (plan.notification) demoNotifications.unshift(plan.notification);
    }
    return { ...plan.outcome, demo: true };
  }

  const db = await getDb();
  const client = await getMongoClient();
  let outcome: ClubMembershipTransitionOutcome | undefined;
  let browserNotification: Notification | undefined;

  await client.withSession(async (session) => session.withTransaction(async () => {
    outcome = undefined;
    browserNotification = undefined;
    const club = await db.collection<Club>("clubs").findOne({ slug: clubSlug }, { session });
    if (!club) throw new ClubMembershipTransitionError("Club not found.", 404);
    const memberships = await db.collection<ClubMembership>("memberships")
      .find({ clubId: club.id }, { session })
      .toArray();
    const targetMembership = memberships.find((membership) => membership.userId === targetUserId);
    const actorMembership = memberships.find((membership) => membership.userId === actorUserId);
    const activeDrop = club.activeDropId
      ? await db.collection<DropSlot>("drops").findOne({ id: club.activeDropId }, { session })
      : null;
    const timestamp = new Date().toISOString();
    const plan = planClubMembershipTransition({
      club,
      memberships,
      actorMembership,
      targetMembership,
      activeDrop,
      kind,
      actorUserId,
      targetUserId,
      hasClubAdminTools,
      timestamp,
      auditId: createId("audit"),
      notificationId: createId("notification"),
    });
    if (!plan.changed) {
      outcome = { ...plan.outcome, demo: false };
      return;
    }
    if (!targetMembership || !plan.audit) {
      throw new ClubMembershipTransitionError("Could not update this membership.", 500);
    }

    const clubUpdate = await db.collection<Club>("clubs").updateOne(
      {
        id: club.id,
        rotationMemberIds: club.rotationMemberIds,
        memberCount: club.memberCount,
        "custody.activeOwnerId": club.custody.activeOwnerId,
        ...(club.activeDropId
          ? { activeDropId: club.activeDropId }
          : { activeDropId: { $exists: false } }),
      },
      {
        $set: {
          rotationMemberIds: plan.club.rotationMemberIds,
          memberCount: plan.club.memberCount,
          updatedAt: timestamp,
        },
      },
      { session },
    );
    const membershipUpdate = await db.collection<ClubMembership>("memberships").updateOne(
      {
        id: targetMembership.id,
        clubId: club.id,
        userId: targetUserId,
        status: "active",
        role: targetMembership.role,
        queuePaused: targetMembership.queuePaused,
      },
      {
        $set: {
          status: plan.membership.status,
          queuePaused: false,
          updatedAt: timestamp,
        },
      },
      { session },
    );
    if (clubUpdate.modifiedCount !== 1 || membershipUpdate.modifiedCount !== 1) {
      throw new ClubMembershipTransitionError(
        "Membership state changed. Refresh and try again.",
        409,
      );
    }

    if (plan.drop && activeDrop) {
      const dropUpdate = await db.collection<DropSlot>("drops").updateOne(
        {
          id: activeDrop.id,
          clubId: club.id,
          status: activeDrop.status,
          assignedUserId: targetUserId,
          occurrenceKey: activeDrop.occurrenceKey,
          scheduleVersion: activeDrop.scheduleVersion,
          scheduledFor: activeDrop.scheduledFor,
        },
        {
          $set: {
            assignedUserId: plan.drop.assignedUserId,
            updatedAt: timestamp,
          },
          $unset: { playlist: "" },
        },
        { session },
      );
      if (dropUpdate.modifiedCount !== 1) {
        throw new ClubMembershipTransitionError(
          "The active drop changed. Refresh and try again.",
          409,
        );
      }
    }

    await db.collection<AuditEvent>("auditEvents").insertOne(plan.audit, { session });
    if (plan.notification) {
      await db.collection<Notification>("notifications").insertOne(plan.notification, { session });
      browserNotification = plan.notification;
    }
    outcome = { ...plan.outcome, demo: false };
  }));

  if (!outcome) throw new ClubMembershipTransitionError("Could not update this membership.", 500);
  if (browserNotification) await deliverBrowserNotification(browserNotification);
  return outcome;
}
