import { describe, expect, it } from "vitest";
import {
  canManageJoinRequests,
  JoinRequestDecisionError,
  planJoinRequestApproval,
} from "@/lib/join-request-service";
import type { ClubMembership, JoinRequest, UserProfile } from "@/types/domain";

const timestamp = "2026-07-17T18:00:00.000Z";

const request: JoinRequest = {
  id: "join-1",
  clubId: "club-1",
  userId: "user-requester",
  status: "pending",
  createdAt: timestamp,
  updatedAt: timestamp,
};

const requester: UserProfile = {
  id: "user-requester",
  clerkUserId: "clerk-requester",
  displayName: "Requester",
  initials: "RQ",
  plan: "free",
  emailNotifications: true,
  themePreference: "system",
  skinPreference: "classic",
  createdAt: timestamp,
  updatedAt: timestamp,
};

function membership(overrides: Partial<ClubMembership> = {}): ClubMembership {
  return {
    id: "membership-1",
    clubId: "club-1",
    userId: "user-manager",
    role: "owner",
    status: "active",
    queuePaused: false,
    joinedAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

describe("join-request decisions", () => {
  it("allows only active owners or admins with club administration access", () => {
    expect(canManageJoinRequests(membership(), true)).toBe(true);
    expect(canManageJoinRequests(membership({ role: "admin" }), true)).toBe(true);
    expect(canManageJoinRequests(membership({ role: "member" }), true)).toBe(false);
    expect(canManageJoinRequests(membership({ status: "removed" }), true)).toBe(false);
    expect(canManageJoinRequests(membership(), false)).toBe(false);
  });

  it("creates a new active membership when the requester has capacity", () => {
    const result = planJoinRequestApproval({
      request,
      requester,
      activeMembershipCount: 2,
      timestamp,
      membershipId: "membership-new",
    });

    expect(result).toEqual({
      addsMember: true,
      membership: {
        id: "membership-new",
        clubId: "club-1",
        userId: "user-requester",
        role: "member",
        status: "active",
        queuePaused: false,
        joinedAt: timestamp,
        updatedAt: timestamp,
      },
    });
  });

  it("reactivates a former membership without changing its identity", () => {
    const existingMembership = membership({
      id: "membership-former",
      userId: request.userId,
      role: "admin",
      status: "removed",
      queuePaused: true,
    });
    const result = planJoinRequestApproval({
      request,
      requester,
      existingMembership,
      activeMembershipCount: 0,
      timestamp,
      membershipId: "membership-unused",
    });

    expect(result.addsMember).toBe(true);
    expect(result.membership).toMatchObject({
      id: "membership-former",
      role: "member",
      status: "active",
      queuePaused: false,
    });
  });

  it("leaves an existing active membership unchanged", () => {
    const existingMembership = membership({ userId: request.userId });
    expect(planJoinRequestApproval({
      request,
      requester: null,
      existingMembership,
      activeMembershipCount: 0,
      timestamp,
      membershipId: "membership-unused",
    })).toEqual({ membership: existingMembership, addsMember: false });
  });

  it("blocks approval when a free requester has reached their membership limit", () => {
    try {
      planJoinRequestApproval({
        request,
        requester,
        activeMembershipCount: 3,
        timestamp,
        membershipId: "membership-new",
      });
      throw new Error("Expected approval planning to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(JoinRequestDecisionError);
      expect(error).toMatchObject({ status: 409 });
    }
  });
});
