import { describe, expect, it } from "vitest";
import {
  buildClubRolePromotionNotification,
  ClubMemberRoleError,
  planClubMemberRoleChange,
} from "@/lib/club-member-role";
import type { ClubMembership } from "@/types/domain";

const timestamp = "2026-07-30T18:00:00.000Z";

function membership(overrides: Partial<ClubMembership> = {}): ClubMembership {
  return {
    id: "membership-owner",
    clubId: "club-1",
    userId: "user-owner",
    role: "owner",
    status: "active",
    queuePaused: false,
    joinedAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

describe("club member role changes", () => {
  it("promotes a member without replacing an existing admin", () => {
    const existingAdmin = membership({
      id: "membership-admin",
      userId: "user-admin",
      role: "admin",
    });
    const target = membership({
      id: "membership-member",
      userId: "user-member",
      role: "member",
    });

    const result = planClubMemberRoleChange({
      actorMembership: membership(),
      targetMembership: target,
      activeOwnerId: "user-owner",
      custodyStatus: "active",
      canChangeOwnership: true,
      targetCanOwnAnotherClub: true,
      role: "admin",
      timestamp: "2026-07-30T19:00:00.000Z",
    });

    expect(result).toEqual({
      changed: true,
      primaryOwnerId: "user-owner",
      membership: {
        ...target,
        role: "admin",
        updatedAt: "2026-07-30T19:00:00.000Z",
      },
    });
    expect(existingAdmin.role).toBe("admin");
  });

  it("lets the owner remove an admin role", () => {
    const result = planClubMemberRoleChange({
      actorMembership: membership(),
      targetMembership: membership({
        id: "membership-admin",
        userId: "user-admin",
        role: "admin",
      }),
      activeOwnerId: "user-owner",
      custodyStatus: "active",
      canChangeOwnership: true,
      targetCanOwnAnotherClub: true,
      role: "member",
      timestamp,
    });

    expect(result.membership.role).toBe("member");
    expect(result.changed).toBe(true);
  });

  it("treats a repeated role assignment as idempotent", () => {
    const target = membership({
      id: "membership-admin",
      userId: "user-admin",
      role: "admin",
    });
    expect(planClubMemberRoleChange({
      actorMembership: membership(),
      targetMembership: target,
      activeOwnerId: "user-owner",
      custodyStatus: "active",
      canChangeOwnership: true,
      targetCanOwnAnotherClub: true,
      role: "admin",
      timestamp,
    })).toEqual({
      membership: target,
      changed: false,
      primaryOwnerId: "user-owner",
    });
  });

  it("does not let an admin assign more admins", () => {
    expect(() => planClubMemberRoleChange({
      actorMembership: membership({ userId: "user-admin", role: "admin" }),
      targetMembership: membership({ userId: "user-member", role: "member" }),
      activeOwnerId: "user-owner",
      custodyStatus: "active",
      canChangeOwnership: true,
      targetCanOwnAnotherClub: true,
      role: "admin",
      timestamp,
    })).toThrowError(ClubMemberRoleError);
  });

  it("does not let an owner remove their own ownership", () => {
    expect(() => planClubMemberRoleChange({
      actorMembership: membership(),
      targetMembership: membership(),
      activeOwnerId: "user-owner",
      custodyStatus: "active",
      canChangeOwnership: true,
      targetCanOwnAnotherClub: true,
      role: "member",
      timestamp,
    })).toThrowError(/cannot remove your own club ownership/i);
  });

  it("builds an account notification for a new admin", () => {
    expect(buildClubRolePromotionNotification({
      club: { name: "Club One", slug: "club-one" },
      membership: { userId: "user-member", role: "admin" },
      previousRole: "member",
      changed: true,
      notificationId: "notification-promotion",
      timestamp,
    })).toEqual({
      id: "notification-promotion",
      userId: "user-member",
      kind: "membership",
      title: "You’re now an admin of Club One",
      body: "You can now manage club settings, members, themes, backups, and the queue.",
      href: "/app/clubs/club-one/settings",
      createdAt: timestamp,
    });
  });

  it("does not notify for repeated assignments or demotions", () => {
    expect(buildClubRolePromotionNotification({
      club: { name: "Club One", slug: "club-one" },
      membership: { userId: "user-member", role: "admin" },
      previousRole: "admin",
      changed: false,
      notificationId: "notification-repeated",
      timestamp,
    })).toBeUndefined();
    expect(buildClubRolePromotionNotification({
      club: { name: "Club One", slug: "club-one" },
      membership: { userId: "user-member", role: "member" },
      previousRole: "admin",
      changed: true,
      notificationId: "notification-demotion",
      timestamp,
    })).toBeUndefined();
  });

  it("lets any owner add an eligible co-owner", () => {
    const coOwner = membership({
      id: "membership-co-owner",
      userId: "user-co-owner",
      role: "owner",
    });
    const target = membership({
      id: "membership-member",
      userId: "user-member",
      role: "member",
    });

    const result = planClubMemberRoleChange({
      actorMembership: coOwner,
      targetMembership: target,
      activeOwnerId: "user-owner",
      custodyStatus: "active",
      canChangeOwnership: true,
      targetCanOwnAnotherClub: true,
      role: "owner",
      timestamp,
    });

    expect(result).toMatchObject({
      changed: true,
      primaryOwnerId: "user-owner",
      membership: { userId: "user-member", role: "owner" },
    });
  });

  it("moves primary custody when a co-owner removes the primary owner", () => {
    const result = planClubMemberRoleChange({
      actorMembership: membership({
        id: "membership-co-owner",
        userId: "user-co-owner",
        role: "owner",
      }),
      targetMembership: membership(),
      activeOwnerId: "user-owner",
      custodyStatus: "active",
      canChangeOwnership: true,
      targetCanOwnAnotherClub: true,
      role: "admin",
      timestamp,
    });

    expect(result).toMatchObject({
      changed: true,
      primaryOwnerId: "user-co-owner",
      membership: { userId: "user-owner", role: "admin" },
    });
  });

  it("enforces ownership entitlement for co-owners", () => {
    expect(() => planClubMemberRoleChange({
      actorMembership: membership(),
      targetMembership: membership({
        id: "membership-member",
        userId: "user-member",
        role: "member",
      }),
      activeOwnerId: "user-owner",
      custodyStatus: "active",
      canChangeOwnership: true,
      targetCanOwnAnotherClub: false,
      role: "owner",
      timestamp,
    })).toThrowError(/cannot own another club/i);
  });

  it("keeps ownership changes behind the ownership-transfer feature", () => {
    expect(() => planClubMemberRoleChange({
      actorMembership: membership(),
      targetMembership: membership({
        id: "membership-member",
        userId: "user-member",
        role: "member",
      }),
      activeOwnerId: "user-owner",
      custodyStatus: "active",
      canChangeOwnership: false,
      targetCanOwnAnotherClub: true,
      role: "owner",
      timestamp,
    })).toThrowError(/plan does not include ownership changes/i);
  });

  it("transfers ownership atomically and keeps the former owner as an admin", () => {
    const target = membership({
      id: "membership-member",
      userId: "user-member",
      role: "member",
    });

    const result = planClubMemberRoleChange({
      actorMembership: membership(),
      targetMembership: target,
      activeOwnerId: "user-owner",
      custodyStatus: "active",
      canChangeOwnership: true,
      targetCanOwnAnotherClub: true,
      transferOwnership: true,
      role: "owner",
      timestamp,
    });

    expect(result).toEqual({
      changed: true,
      primaryOwnerId: "user-member",
      actorMembership: {
        ...membership(),
        role: "admin",
      },
      membership: {
        ...target,
        role: "owner",
      },
    });
  });

  it("notifies a member when ownership is transferred", () => {
    expect(buildClubRolePromotionNotification({
      club: { name: "Club One", slug: "club-one" },
      membership: { userId: "user-member", role: "owner" },
      previousRole: "member",
      changed: true,
      ownershipTransfer: true,
      notificationId: "notification-transfer",
      timestamp,
    })).toMatchObject({
      userId: "user-member",
      kind: "membership",
      title: "Ownership of Club One was transferred to you",
      href: "/app/clubs/club-one/settings",
    });
  });
});
