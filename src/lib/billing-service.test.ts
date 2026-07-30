import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getMongoClient: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: mocks.getDb,
  getMongoClient: mocks.getMongoClient,
}));

import { applyBillingPlan } from "@/lib/billing-service";

function configureBillingCollections(remainingOwnerId?: string) {
  const ownerMembership = {
    id: "membership-owner",
    clubId: "club-1",
    userId: "user-owner",
    role: "owner",
    status: "active",
  };
  const club = {
    id: "club-1",
    createdAt: "2026-07-01T12:00:00.000Z",
    custody: {
      status: "active",
      activeOwnerId: "user-owner",
      recoveryClaimantId: null,
    },
  };
  const membershipUpdate = vi.fn().mockResolvedValue({ matchedCount: 1 });
  const clubUpdate = vi.fn().mockResolvedValue({ matchedCount: 1 });
  const auditInsert = vi.fn().mockResolvedValue({ insertedId: "audit-1" });
  const collections: Record<string, unknown> = {
    memberships: {
      find: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([ownerMembership]),
      })),
      findOne: vi.fn().mockResolvedValue(
        remainingOwnerId
          ? {
            id: "membership-co-owner",
            clubId: "club-1",
            userId: remainingOwnerId,
            role: "owner",
            status: "active",
            joinedAt: "2026-07-02T12:00:00.000Z",
          }
          : null,
      ),
      updateOne: membershipUpdate,
    },
    clubs: {
      find: vi.fn(() => ({
        sort: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue([club]),
        })),
      })),
      updateOne: clubUpdate,
    },
    users: {
      updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 }),
    },
    auditEvents: {
      insertOne: auditInsert,
    },
  };
  mocks.getDb.mockResolvedValue({
    collection: vi.fn((name: string) => collections[name]),
  });
  mocks.getMongoClient.mockResolvedValue({
    withSession: async (
      work: (session: {
        withTransaction: (transaction: () => Promise<void>) => Promise<void>;
      }) => Promise<void>,
    ) => work({
      withTransaction: async (transaction) => transaction(),
    }),
  });
  return {
    membershipUpdate,
    clubUpdate,
    auditInsert,
  };
}

describe("billing ownership changes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps a co-owned club active when one owner loses eligibility", async () => {
    const { membershipUpdate, clubUpdate, auditInsert } =
      configureBillingCollections("user-co-owner");

    const result = await applyBillingPlan("user-owner", "free");

    expect(result.excessClubIds).toEqual(["club-1"]);
    expect(membershipUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        clubId: "club-1",
        userId: "user-owner",
        role: "owner",
      }),
      expect.objectContaining({
        $set: expect.objectContaining({ role: "admin" }),
      }),
      expect.objectContaining({ session: expect.any(Object) }),
    );
    expect(clubUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "club-1",
        "custody.status": "active",
      }),
      {
        $set: expect.objectContaining({
          "custody.activeOwnerId": "user-co-owner",
        }),
      },
      expect.objectContaining({ session: expect.any(Object) }),
    );
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ownership.removed-after-plan-change",
        metadata: expect.objectContaining({
          remainingOwnerId: "user-co-owner",
        }),
      }),
      expect.objectContaining({ session: expect.any(Object) }),
    );
  });

  it("uses system custody only when no eligible co-owner remains", async () => {
    const { membershipUpdate, clubUpdate, auditInsert } =
      configureBillingCollections();

    await applyBillingPlan("user-owner", "free");

    expect(membershipUpdate).not.toHaveBeenCalled();
    expect(clubUpdate).toHaveBeenCalledWith(
      {
        id: "club-1",
        "custody.activeOwnerId": "user-owner",
      },
      {
        $set: expect.objectContaining({
          custody: expect.objectContaining({
            status: "grace",
            activeOwnerId: null,
            recoveryClaimantId: "user-owner",
          }),
        }),
      },
      expect.objectContaining({ session: expect.any(Object) }),
    );
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ownership.entered-system-custody",
      }),
      expect.objectContaining({ session: expect.any(Object) }),
    );
  });
});
