import { describe, expect, it, vi } from "vitest";
import type { ClientSession, Db } from "mongodb";
import {
  assertMembershipCapacity,
  assertOwnershipCapacity,
  EntitlementCapacityError,
} from "@/lib/entitlement-capacity";

const session = {} as ClientSession;
const timestamp = "2026-09-17T18:00:00.000Z";

function capacityDb({
  plan = "entry",
  ownedClubCount = 0,
  activeMembershipCount = 0,
}: {
  plan?: "free" | "entry" | "middle" | "highest";
  ownedClubCount?: number;
  activeMembershipCount?: number;
} = {}) {
  const lock = vi.fn().mockResolvedValue({ modifiedCount: 1 });
  const findUser = vi.fn().mockResolvedValue({ id: "user-1", plan });
  const findOwnerMemberships = vi.fn().mockReturnValue({
    toArray: vi.fn().mockResolvedValue(
      ownedClubCount ? [{ clubId: "club-1" }] : [],
    ),
  });
  const countOwnedClubs = vi.fn().mockResolvedValue(ownedClubCount);
  const countMemberships = vi.fn().mockResolvedValue(activeMembershipCount);
  const db = {
    collection: vi.fn((name: string) => {
      if (name === "entitlementLocks") return { updateOne: lock };
      if (name === "users") return { findOne: findUser };
      if (name === "memberships") {
        return { find: findOwnerMemberships, countDocuments: countMemberships };
      }
      if (name === "clubs") return { countDocuments: countOwnedClubs };
      throw new Error(`Unexpected collection ${name}`);
    }),
  } as unknown as Db;
  return { db, lock, findUser, findOwnerMemberships, countOwnedClubs, countMemberships };
}

describe("transactional entitlement capacity", () => {
  it("serializes ownership consumers before reading current usage", async () => {
    const mocks = capacityDb();

    await expect(assertOwnershipCapacity({
      db: mocks.db,
      session,
      userId: "user-1",
      timestamp,
    })).resolves.toBeUndefined();

    expect(mocks.lock).toHaveBeenCalledWith(
      { _id: "user-1" },
      { $inc: { revision: 1 }, $set: { updatedAt: timestamp } },
      { upsert: true, session },
    );
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.findUser.mock.invocationCallOrder[0]!,
    );
    expect(mocks.findUser.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.findOwnerMemberships.mock.invocationCallOrder[0]!,
    );
  });

  it("rejects ownership after the serialized count reaches the plan limit", async () => {
    const mocks = capacityDb({ plan: "entry", ownedClubCount: 1 });

    await expect(assertOwnershipCapacity({
      db: mocks.db,
      session,
      userId: "user-1",
      timestamp,
    })).rejects.toBeInstanceOf(EntitlementCapacityError);
  });

  it("rejects a free membership after locking and counting three active memberships", async () => {
    const mocks = capacityDb({ plan: "free", activeMembershipCount: 3 });

    await expect(assertMembershipCapacity({
      db: mocks.db,
      session,
      userId: "user-1",
      timestamp,
    })).rejects.toMatchObject({
      message: "This person has reached their current club membership limit.",
      status: 409,
    });
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.findUser.mock.invocationCallOrder[0]!,
    );
    expect(mocks.findUser.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.countMemberships.mock.invocationCallOrder[0]!,
    );
  });

  it("uses the stored plan after locking instead of a stale caller entitlement", async () => {
    const mocks = capacityDb({ plan: "free" });

    await expect(assertOwnershipCapacity({
      db: mocks.db,
      session,
      userId: "user-1",
      timestamp,
    })).rejects.toMatchObject({
      message: "This account has reached its club ownership limit.",
      status: 409,
    });
  });
});
