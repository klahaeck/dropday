import { afterEach, describe, expect, it } from "vitest";
import {
  canManageJoinRequests,
  JoinRequestDecisionError,
  planJoinRequestApproval,
  withdrawJoinRequest,
} from "@/lib/join-request-service";
import { demoJoinRequests } from "@/lib/demo-data";
import { createOrGetPendingJoinRequest } from "@/lib/repository";
import type { ClubMembership, JoinRequest, UserProfile } from "@/types/domain";

const timestamp = "2026-07-17T18:00:00.000Z";
const withdrawalRequestIds = new Set<string>();

afterEach(() => {
  for (let index = demoJoinRequests.length - 1; index >= 0; index -= 1) {
    if (withdrawalRequestIds.has(demoJoinRequests[index].id)) {
      demoJoinRequests.splice(index, 1);
    }
  }
  withdrawalRequestIds.clear();
});

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
  it("uses the club role to sponsor admin access while preserving owner feature gates", () => {
    expect(canManageJoinRequests(membership(), true)).toBe(true);
    expect(canManageJoinRequests(membership({ role: "admin" }), true)).toBe(true);
    expect(canManageJoinRequests(membership({ role: "admin" }), false)).toBe(true);
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

describe("join-request withdrawal", () => {
  function addRequest(overrides: Partial<JoinRequest> = {}) {
    const next: JoinRequest = {
      id: `join-withdraw-${withdrawalRequestIds.size + 1}`,
      clubId: "club-needle",
      userId: "user-requester",
      message: "Please let me join.",
      status: "pending",
      createdAt: timestamp,
      updatedAt: timestamp,
      ...overrides,
    };
    withdrawalRequestIds.add(next.id);
    demoJoinRequests.push(next);
    return next;
  }

  it("lets a requester withdraw their own pending request", async () => {
    const pending = addRequest();

    await expect(withdrawJoinRequest({
      requestId: pending.id,
      actorUserId: pending.userId,
    })).resolves.toMatchObject({
      request: { id: pending.id, status: "withdrawn" },
      demo: true,
    });
  });

  it("rejects another user and a non-pending or repeated withdrawal", async () => {
    const pending = addRequest();
    const handled = addRequest({ id: "join-withdraw-handled", status: "approved" });

    await expect(withdrawJoinRequest({
      requestId: pending.id,
      actorUserId: "different-user",
    })).rejects.toMatchObject({ status: 403 });
    await expect(withdrawJoinRequest({
      requestId: handled.id,
      actorUserId: handled.userId,
    })).rejects.toMatchObject({ status: 409 });
    await withdrawJoinRequest({ requestId: pending.id, actorUserId: pending.userId });
    await expect(withdrawJoinRequest({
      requestId: pending.id,
      actorUserId: pending.userId,
    })).rejects.toMatchObject({ status: 409 });
  });

  it("allows a new request with a message after withdrawal", async () => {
    const pending = addRequest();
    await withdrawJoinRequest({ requestId: pending.id, actorUserId: pending.userId });
    const replacement: JoinRequest = {
      ...pending,
      id: "join-withdraw-replacement",
      message: "A new note for the managers.",
      status: "pending",
    };
    withdrawalRequestIds.add(replacement.id);

    const result = await createOrGetPendingJoinRequest(replacement);

    expect(result).toMatchObject({
      created: true,
      request: {
        id: replacement.id,
        message: "A new note for the managers.",
        status: "pending",
      },
    });
  });
});
