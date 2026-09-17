import type { ClientSession, Db } from "mongodb";
import {
  featureAccessForPlan,
  getMembershipEntitlement,
  getOwnershipEntitlement,
} from "@/lib/entitlements";
import type { Club, ClubMembership, UserProfile } from "@/types/domain";

interface EntitlementLock {
  _id: string;
  revision: number;
  updatedAt: string;
}

export class EntitlementCapacityError extends Error {
  constructor(message: string, readonly status = 409) {
    super(message);
    this.name = "EntitlementCapacityError";
  }
}

/**
 * Every transaction that can consume membership or ownership capacity writes
 * the same per-user document before counting. MongoDB write conflicts then
 * serialize concurrent transactions for that user, preventing count/insert
 * write skew without maintaining a second source-of-truth counter.
 */
export async function acquireEntitlementLock(
  db: Db,
  session: ClientSession,
  userId: string,
  timestamp: string,
): Promise<void> {
  await db.collection<EntitlementLock>("entitlementLocks").updateOne(
    { _id: userId },
    {
      $inc: { revision: 1 },
      $set: { updatedAt: timestamp },
    },
    { upsert: true, session },
  );
}

export async function assertOwnershipCapacity({
  db,
  session,
  userId,
  timestamp,
}: {
  db: Db;
  session: ClientSession;
  userId: string;
  timestamp: string;
}): Promise<void> {
  await acquireEntitlementLock(db, session, userId, timestamp);
  const user = await db.collection<UserProfile>("users").findOne(
    { id: userId },
    { session },
  );
  if (!user) {
    throw new EntitlementCapacityError("This account is unavailable.");
  }
  const ownerMemberships = await db.collection<ClubMembership>("memberships")
    .find({ userId, role: "owner", status: "active" }, { session, projection: { clubId: 1 } })
    .toArray();
  const ownedClubCount = ownerMemberships.length
    ? await db.collection<Club>("clubs").countDocuments(
        {
          id: { $in: ownerMemberships.map((membership) => membership.clubId) },
          "custody.status": "active",
        },
        { session },
      )
    : 0;
  if (!getOwnershipEntitlement(user.plan, ownedClubCount).canOwnAnotherClub) {
    throw new EntitlementCapacityError("This account has reached its club ownership limit.");
  }
}

export async function assertMembershipCapacity({
  db,
  session,
  userId,
  timestamp,
}: {
  db: Db;
  session: ClientSession;
  userId: string;
  timestamp: string;
}): Promise<number> {
  await acquireEntitlementLock(db, session, userId, timestamp);
  const user = await db.collection<UserProfile>("users").findOne(
    { id: userId },
    { session },
  );
  if (!user) {
    throw new EntitlementCapacityError("This account is unavailable.");
  }
  const activeMembershipCount = await db.collection<ClubMembership>("memberships").countDocuments(
    { userId, status: "active" },
    { session },
  );
  const entitlement = getMembershipEntitlement(
    user.plan,
    activeMembershipCount,
    featureAccessForPlan(user.plan).unlimitedMemberships,
  );
  if (!entitlement.canActivateMembership) {
    throw new EntitlementCapacityError(
      "This person has reached their current club membership limit.",
    );
  }
  return activeMembershipCount;
}
