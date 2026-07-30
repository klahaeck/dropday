import { describe, expect, it } from "vitest";
import {
  buildClubAdminPromotionNotification,
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
      role: "admin",
      timestamp: "2026-07-30T19:00:00.000Z",
    });

    expect(result).toEqual({
      changed: true,
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
      role: "admin",
      timestamp,
    })).toEqual({ membership: target, changed: false });
  });

  it("does not let an admin assign more admins", () => {
    expect(() => planClubMemberRoleChange({
      actorMembership: membership({ userId: "user-admin", role: "admin" }),
      targetMembership: membership({ userId: "user-member", role: "member" }),
      activeOwnerId: "user-owner",
      role: "admin",
      timestamp,
    })).toThrowError(ClubMemberRoleError);
  });

  it("does not change the owner role through member administration", () => {
    expect(() => planClubMemberRoleChange({
      actorMembership: membership(),
      targetMembership: membership(),
      activeOwnerId: "user-owner",
      role: "member",
      timestamp,
    })).toThrowError(/owner’s role cannot be changed/i);
  });

  it("builds an account notification for a new admin", () => {
    expect(buildClubAdminPromotionNotification({
      club: { name: "Club One", slug: "club-one" },
      membership: { userId: "user-member", role: "admin" },
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
    expect(buildClubAdminPromotionNotification({
      club: { name: "Club One", slug: "club-one" },
      membership: { userId: "user-member", role: "admin" },
      changed: false,
      notificationId: "notification-repeated",
      timestamp,
    })).toBeUndefined();
    expect(buildClubAdminPromotionNotification({
      club: { name: "Club One", slug: "club-one" },
      membership: { userId: "user-member", role: "member" },
      changed: true,
      notificationId: "notification-demotion",
      timestamp,
    })).toBeUndefined();
  });
});
