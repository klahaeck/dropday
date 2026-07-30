import { DateTime } from "luxon";
import { getDb, getMongoClient } from "@/lib/db";
import { PLAN_ENTITLEMENTS } from "@/lib/entitlements";
import { enterSystemCustody } from "@/lib/custody";
import type {
  Club,
  ClubMembership,
  PlanKey,
  UserProfile,
} from "@/types/domain";

export async function applyBillingPlan(userId: string, nextPlan: PlanKey) {
  const db = await getDb();
  const client = await getMongoClient();
  const ownerMemberships = await db.collection<ClubMembership>("memberships")
    .find({ userId, role: "owner", status: "active" })
    .toArray();
  const ownedClubs = await db.collection<Club>("clubs")
    .find({
      id: { $in: ownerMemberships.map((membership) => membership.clubId) },
      "custody.status": "active",
    })
    .sort({ createdAt: 1 })
    .toArray();
  const limit = PLAN_ENTITLEMENTS[nextPlan].ownedClubLimit;
  const allowed = limit === null ? ownedClubs.length : limit;
  const excess = ownedClubs.slice(allowed);
  const timestamp = new Date();

  await client.withSession(async (session) => {
    await session.withTransaction(async () => {
      await db.collection<UserProfile>("users").updateOne(
        { id: userId },
        { $set: { plan: nextPlan, updatedAt: timestamp.toISOString() } },
        { session },
      );
      for (const club of excess) {
        const remainingOwner = await db.collection<ClubMembership>("memberships").findOne(
          {
            clubId: club.id,
            userId: { $ne: userId },
            role: "owner",
            status: "active",
          },
          {
            session,
            sort: { joinedAt: 1 },
          },
        );
        if (remainingOwner) {
          const membershipUpdate = await db.collection<ClubMembership>("memberships").updateOne(
            {
              clubId: club.id,
              userId,
              role: "owner",
              status: "active",
            },
            {
              $set: {
                role: "admin",
                updatedAt: timestamp.toISOString(),
              },
            },
            { session },
          );
          const clubUpdate = await db.collection<Club>("clubs").updateOne(
            {
              id: club.id,
              "custody.status": "active",
              "custody.activeOwnerId": club.custody.activeOwnerId,
            },
            {
              $set: {
                updatedAt: timestamp.toISOString(),
                ...(club.custody.activeOwnerId === userId
                  ? { "custody.activeOwnerId": remainingOwner.userId }
                  : {}),
              },
            },
            { session },
          );
          if (!membershipUpdate.matchedCount || !clubUpdate.matchedCount) {
            throw new Error("Club ownership changed during the plan update");
          }
          await db.collection("auditEvents").insertOne({
            id: `audit_ownership_${club.id}_${Date.now()}`,
            clubId: club.id,
            actorUserId: userId,
            action: "ownership.removed-after-plan-change",
            metadata: {
              nextPlan,
              remainingOwnerId: remainingOwner.userId,
            },
            createdAt: timestamp.toISOString(),
          }, { session });
          continue;
        }

        const custody = enterSystemCustody(
          club,
          timestamp,
          nextPlan === "free" ? "plan-ended" : "tier-downgrade",
        );
        await db.collection<Club>("clubs").updateOne(
          { id: club.id, "custody.activeOwnerId": userId },
          { $set: { custody, updatedAt: timestamp.toISOString() } },
          { session },
        );
        await db.collection("auditEvents").insertOne({
          id: `audit_custody_${club.id}_${Date.now()}`,
          clubId: club.id,
          actorUserId: userId,
          action: "ownership.entered-system-custody",
          metadata: { nextPlan, graceEndsAt: custody.graceEndsAt },
          createdAt: timestamp.toISOString(),
        }, { session });
      }
    });
  });
  return { nextPlan, excessClubIds: excess.map((club) => club.id), appliedAt: DateTime.fromJSDate(timestamp).toISO() };
}

export async function archiveExpiredCustodyClubs() {
  const db = await getDb();
  const timestamp = new Date().toISOString();
  const result = await db.collection<Club>("clubs").updateMany(
    { "custody.status": "grace", "custody.graceEndsAt": { $lte: timestamp } },
    { $set: { "custody.status": "archived", "custody.archivedAt": timestamp, "schedule.paused": true, updatedAt: timestamp } },
  );
  return result.modifiedCount;
}
