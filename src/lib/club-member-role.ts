import type {
  Club,
  ClubLifecycle,
  ClubMembership,
  Notification,
} from "@/types/domain";

export type AssignableClubRole = "owner" | "admin" | "member";

export class ClubMemberRoleError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ClubMemberRoleError";
  }
}

export function planClubMemberRoleChange({
  actorMembership,
  targetMembership,
  activeOwnerId,
  custodyStatus,
  canChangeOwnership,
  targetCanOwnAnotherClub,
  transferOwnership = false,
  role,
  timestamp,
}: {
  actorMembership: ClubMembership | null | undefined;
  targetMembership: ClubMembership | null | undefined;
  activeOwnerId: string | null;
  custodyStatus: ClubLifecycle;
  canChangeOwnership: boolean;
  targetCanOwnAnotherClub: boolean;
  transferOwnership?: boolean;
  role: AssignableClubRole;
  timestamp: string;
}): {
  membership: ClubMembership;
  actorMembership?: ClubMembership;
  changed: boolean;
  primaryOwnerId: string;
} {
  if (
    !actorMembership
    || actorMembership.status !== "active"
    || actorMembership.role !== "owner"
    || custodyStatus !== "active"
  ) {
    throw new ClubMemberRoleError("Only a club owner can change member roles.", 403);
  }
  if (
    !targetMembership
    || targetMembership.status !== "active"
    || targetMembership.clubId !== actorMembership.clubId
  ) {
    throw new ClubMemberRoleError("Member not found.", 404);
  }
  if (
    (role === "owner" || targetMembership.role === "owner" || transferOwnership)
    && !canChangeOwnership
  ) {
    throw new ClubMemberRoleError(
      "Your current plan does not include ownership changes.",
      403,
    );
  }
  if (transferOwnership) {
    if (role !== "owner") {
      throw new ClubMemberRoleError("Ownership can only be transferred to an owner.", 400);
    }
    if (targetMembership.userId === actorMembership.userId) {
      throw new ClubMemberRoleError("Choose another member to receive ownership.", 409);
    }
    if (targetMembership.role !== "owner" && !targetCanOwnAnotherClub) {
      throw new ClubMemberRoleError(
        "This member’s current plan cannot own another club.",
        409,
      );
    }
    return {
      changed: true,
      primaryOwnerId: targetMembership.userId,
      actorMembership: {
        ...actorMembership,
        role: "admin",
        updatedAt: timestamp,
      },
      membership: {
        ...targetMembership,
        role: "owner",
        updatedAt: timestamp,
      },
    };
  }
  if (
    targetMembership.userId === actorMembership.userId
    && targetMembership.role === "owner"
    && role !== "owner"
  ) {
    throw new ClubMemberRoleError("You cannot remove your own club ownership.", 409);
  }
  if (
    role === "owner"
    && targetMembership.role !== "owner"
    && !targetCanOwnAnotherClub
  ) {
    throw new ClubMemberRoleError(
      "This member’s current plan cannot own another club.",
      409,
    );
  }
  const primaryOwnerId = activeOwnerId ?? actorMembership.userId;
  if (targetMembership.role === role) {
    return {
      membership: targetMembership,
      changed: false,
      primaryOwnerId,
    };
  }

  return {
    changed: true,
    primaryOwnerId:
      targetMembership.role === "owner"
      && targetMembership.userId === primaryOwnerId
      && role !== "owner"
        ? actorMembership.userId
        : primaryOwnerId,
    membership: {
      ...targetMembership,
      role,
      updatedAt: timestamp,
    },
  };
}

export function buildClubRolePromotionNotification({
  club,
  membership,
  previousRole,
  changed,
  ownershipTransfer = false,
  notificationId,
  timestamp,
}: {
  club: Pick<Club, "name" | "slug">;
  membership: Pick<ClubMembership, "userId" | "role">;
  previousRole: AssignableClubRole;
  changed: boolean;
  ownershipTransfer?: boolean;
  notificationId: string;
  timestamp: string;
}): Notification | undefined {
  const isAdminPromotion =
    membership.role === "admin" && previousRole === "member";
  const isOwnerPromotion =
    membership.role === "owner"
    && (previousRole !== "owner" || ownershipTransfer);
  if (!changed || (!isAdminPromotion && !isOwnerPromotion)) {
    return undefined;
  }
  const isOwner = membership.role === "owner";

  return {
    id: notificationId,
    userId: membership.userId,
    kind: "membership",
    title: ownershipTransfer
      ? `Ownership of ${club.name} was transferred to you`
      : isOwner
        ? `You’re now a co-owner of ${club.name}`
        : `You’re now an admin of ${club.name}`,
    body: ownershipTransfer
      ? "You are now the club’s primary owner and can manage its owners, admins, settings, and recovery."
      : isOwner
        ? "You can now manage the club, appoint admins and co-owners, and share ownership responsibilities."
        : "You can now manage club settings, members, themes, backups, and the queue.",
    href: `/app/clubs/${club.slug}/settings`,
    createdAt: timestamp,
  };
}
