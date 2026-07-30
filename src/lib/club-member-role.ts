import type { Club, ClubMembership, Notification } from "@/types/domain";

export type AssignableClubRole = "admin" | "member";

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
  role,
  timestamp,
}: {
  actorMembership: ClubMembership | null | undefined;
  targetMembership: ClubMembership | null | undefined;
  activeOwnerId: string | null;
  role: AssignableClubRole;
  timestamp: string;
}): { membership: ClubMembership; changed: boolean } {
  if (
    !actorMembership
    || actorMembership.status !== "active"
    || actorMembership.role !== "owner"
    || actorMembership.userId !== activeOwnerId
  ) {
    throw new ClubMemberRoleError("Only the club owner can change admin access.", 403);
  }
  if (
    !targetMembership
    || targetMembership.status !== "active"
    || targetMembership.clubId !== actorMembership.clubId
  ) {
    throw new ClubMemberRoleError("Member not found.", 404);
  }
  if (targetMembership.role === "owner") {
    throw new ClubMemberRoleError("The club owner’s role cannot be changed here.", 409);
  }
  if (targetMembership.role === role) {
    return { membership: targetMembership, changed: false };
  }

  return {
    changed: true,
    membership: {
      ...targetMembership,
      role,
      updatedAt: timestamp,
    },
  };
}

export function buildClubAdminPromotionNotification({
  club,
  membership,
  changed,
  notificationId,
  timestamp,
}: {
  club: Pick<Club, "name" | "slug">;
  membership: Pick<ClubMembership, "userId" | "role">;
  changed: boolean;
  notificationId: string;
  timestamp: string;
}): Notification | undefined {
  if (!changed || membership.role !== "admin") return undefined;

  return {
    id: notificationId,
    userId: membership.userId,
    kind: "membership",
    title: `You’re now an admin of ${club.name}`,
    body: "You can now manage club settings, members, themes, backups, and the queue.",
    href: `/app/clubs/${club.slug}/settings`,
    createdAt: timestamp,
  };
}
