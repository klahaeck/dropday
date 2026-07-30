import { NextResponse } from "next/server";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import {
  buildClubRolePromotionNotification,
  ClubMemberRoleError,
  planClubMemberRoleChange,
  type AssignableClubRole,
} from "@/lib/club-member-role";
import { deliverBrowserNotification } from "@/lib/browser-push";
import { getDb, getMongoClient } from "@/lib/db";
import { demoNotifications } from "@/lib/demo-data";
import { getOwnershipEntitlement } from "@/lib/entitlements";
import { integrations } from "@/lib/env";
import {
  countOwnedClubs,
  createId,
  getClubBySlug,
  getClubMemberships,
  getUserProfile,
} from "@/lib/repository";
import type {
  Club,
  ClubMembership,
  Notification,
  UserProfile,
} from "@/types/domain";

const schema = z.object({
  role: z.enum(["owner", "admin", "member"]),
  transferOwnership: z.boolean().optional().default(false),
}).refine(
  (value) => !value.transferOwnership || value.role === "owner",
  { message: "Ownership can only be transferred to an owner." },
);

type RoleUpdateResult = {
  status: number;
  error?: string;
  memberId?: string;
  role?: AssignableClubRole;
  actorRole?: AssignableClubRole;
  primaryOwnerId?: string;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string; memberId: string }> },
) {
  const { slug, memberId } = await params;
  const { profile, features } = await requireViewer();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a valid club role." }, { status: 400 });
  }
  if (!features.clubAdminTools) {
    return NextResponse.json(
      { error: "Your current plan does not include club administration tools." },
      { status: 403 },
    );
  }

  const club = await getClubBySlug(slug);
  if (!club) return NextResponse.json({ error: "Club not found." }, { status: 404 });

  const memberships = await getClubMemberships(club.id);
  const timestamp = new Date().toISOString();

  if (!integrations.mongo) {
    try {
      const targetMembership = memberships.find(
        (membership) => membership.userId === memberId,
      );
      let targetCanOwnAnotherClub = true;
      if (parsed.data.role === "owner" && targetMembership?.role !== "owner") {
        const [targetProfile, ownedClubCount] = await Promise.all([
          getUserProfile(memberId),
          countOwnedClubs(memberId),
        ]);
        targetCanOwnAnotherClub = Boolean(
          targetProfile
          && targetProfile.plan !== "free"
          && getOwnershipEntitlement(targetProfile.plan, ownedClubCount).canOwnAnotherClub,
        );
      }
      const result = planClubMemberRoleChange({
        actorMembership: memberships.find((membership) => membership.userId === profile.id),
        targetMembership,
        activeOwnerId: club.custody.activeOwnerId,
        custodyStatus: club.custody.status,
        canChangeOwnership: features.ownershipTransfer,
        targetCanOwnAnotherClub,
        transferOwnership: parsed.data.transferOwnership,
        role: parsed.data.role,
        timestamp,
      });
      if (result.changed) {
        const previousRole = targetMembership?.role ?? "member";
        const target = memberships.find((membership) => membership.id === result.membership.id);
        if (target) Object.assign(target, result.membership);
        if (result.actorMembership) {
          const actor = memberships.find(
            (membership) => membership.id === result.actorMembership?.id,
          );
          if (actor) Object.assign(actor, result.actorMembership);
        }
        club.updatedAt = timestamp;
        club.custody.activeOwnerId = result.primaryOwnerId;
        const notification = buildClubRolePromotionNotification({
          club,
          membership: result.membership,
          previousRole,
          changed: result.changed,
          ownershipTransfer: parsed.data.transferOwnership,
          notificationId: createId("notification"),
          timestamp,
        });
        if (notification) demoNotifications.unshift(notification);
      }
      return NextResponse.json({
        memberId: result.membership.userId,
        role: result.membership.role,
        ...(result.actorMembership
          ? { actorRole: result.actorMembership.role }
          : {}),
        primaryOwnerId: result.primaryOwnerId,
        demo: true,
      });
    } catch (error) {
      if (error instanceof ClubMemberRoleError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      return NextResponse.json({ error: "Could not update this member’s role." }, { status: 500 });
    }
  }

  const db = await getDb();
  const client = await getMongoClient();
  let outcome: RoleUpdateResult | undefined;
  let browserNotification: Notification | undefined;

  try {
    await client.withSession(async (session) => session.withTransaction(async () => {
      outcome = undefined;
      browserNotification = undefined;

      const currentClub = await db.collection<Club>("clubs").findOne(
        { id: club.id },
        { session },
      );
      if (!currentClub) {
        outcome = { status: 404, error: "Club not found." };
        return;
      }

      const currentMemberships = await db.collection<ClubMembership>("memberships")
        .find(
          {
            clubId: currentClub.id,
            userId: { $in: [profile.id, memberId] },
            status: "active",
          },
          { session },
        )
        .toArray();
      const currentActor = currentMemberships.find((membership) => membership.userId === profile.id);
      const currentTarget = currentMemberships.find((membership) => membership.userId === memberId);

      let targetCanOwnAnotherClub = true;
      if (parsed.data.role === "owner" && currentTarget?.role !== "owner") {
        const [targetProfile, ownerMemberships] = await Promise.all([
          db.collection<UserProfile>("users").findOne(
            { id: memberId },
            { session },
          ),
          db.collection<ClubMembership>("memberships")
            .find(
              { userId: memberId, role: "owner", status: "active" },
              { session },
            )
            .toArray(),
        ]);
        const ownedClubCount = ownerMemberships.length
          ? await db.collection<Club>("clubs").countDocuments(
            {
              id: { $in: ownerMemberships.map((membership) => membership.clubId) },
              "custody.status": "active",
            },
            { session },
          )
          : 0;
        targetCanOwnAnotherClub = Boolean(
          targetProfile
          && targetProfile.plan !== "free"
          && getOwnershipEntitlement(
            targetProfile.plan,
            ownedClubCount,
          ).canOwnAnotherClub,
        );
      }

      let planned;
      try {
        planned = planClubMemberRoleChange({
          actorMembership: currentActor,
          targetMembership: currentTarget,
          activeOwnerId: currentClub.custody.activeOwnerId,
          custodyStatus: currentClub.custody.status,
          canChangeOwnership: features.ownershipTransfer,
          targetCanOwnAnotherClub,
          transferOwnership: parsed.data.transferOwnership,
          role: parsed.data.role,
          timestamp,
        });
      } catch (error) {
        if (error instanceof ClubMemberRoleError) {
          outcome = { status: error.status, error: error.message };
          return;
        }
        throw error;
      }
      if (!currentTarget) throw new Error("Role plan did not resolve a target member");

      if (!planned.changed) {
        outcome = {
          status: 200,
          memberId: planned.membership.userId,
          role: parsed.data.role,
          primaryOwnerId: planned.primaryOwnerId,
        };
        return;
      }

      const clubUpdate = await db.collection<Club>("clubs").updateOne(
        {
          id: currentClub.id,
          "custody.status": "active",
          "custody.activeOwnerId": currentClub.custody.activeOwnerId,
        },
        {
          $set: {
            updatedAt: timestamp,
            "custody.activeOwnerId": planned.primaryOwnerId,
          },
        },
        { session },
      );
      const membershipUpdate = await db.collection<ClubMembership>("memberships").updateOne(
        {
          id: planned.membership.id,
          clubId: currentClub.id,
          userId: memberId,
          role: currentTarget.role,
          status: "active",
        },
        { $set: { role: parsed.data.role, updatedAt: timestamp } },
        { session },
      );
      if (!clubUpdate.matchedCount || !membershipUpdate.matchedCount) {
        throw new Error("Club role state changed during the update");
      }
      if (planned.actorMembership) {
        if (!currentActor) throw new Error("Role plan did not resolve an acting owner");
        const actorUpdate = await db.collection<ClubMembership>("memberships").updateOne(
          {
            id: currentActor.id,
            clubId: currentClub.id,
            userId: profile.id,
            role: currentActor.role,
            status: "active",
          },
          {
            $set: {
              role: planned.actorMembership.role,
              updatedAt: timestamp,
            },
          },
          { session },
        );
        if (!actorUpdate.matchedCount) {
          throw new Error("Club owner state changed during the transfer");
        }
        await db.collection("auditEvents").insertOne(
          {
            id: createId("audit"),
            clubId: currentClub.id,
            actorUserId: profile.id,
            action: "ownership.transferred",
            metadata: {
              fromUserId: profile.id,
              toUserId: planned.membership.userId,
            },
            createdAt: timestamp,
          },
          { session },
        );
      } else if (
        currentTarget.role === "owner"
        || planned.membership.role === "owner"
      ) {
        await db.collection("auditEvents").insertOne(
          {
            id: createId("audit"),
            clubId: currentClub.id,
            actorUserId: profile.id,
            action: planned.membership.role === "owner"
              ? "ownership.co-owner-added"
              : "ownership.co-owner-removed",
            metadata: {
              memberUserId: planned.membership.userId,
              previousRole: currentTarget.role,
              nextRole: planned.membership.role,
            },
            createdAt: timestamp,
          },
          { session },
        );
      }

      browserNotification = buildClubRolePromotionNotification({
        club: currentClub,
        membership: planned.membership,
        previousRole: currentTarget.role,
        changed: planned.changed,
        ownershipTransfer: parsed.data.transferOwnership,
        notificationId: createId("notification"),
        timestamp,
      });
      if (browserNotification) {
        await db.collection<Notification>("notifications").insertOne(
          browserNotification,
          { session },
        );
      }

      outcome = {
        status: 200,
        memberId: planned.membership.userId,
        role: parsed.data.role,
        actorRole: planned.actorMembership?.role,
        primaryOwnerId: planned.primaryOwnerId,
      };
    }));
  } catch {
    return NextResponse.json({ error: "Could not update this member’s role." }, { status: 500 });
  }

  if (!outcome) {
    return NextResponse.json({ error: "Could not update this member’s role." }, { status: 500 });
  }
  if (browserNotification) await deliverBrowserNotification(browserNotification);
  return NextResponse.json(
    {
      ...(outcome.error ? { error: outcome.error } : {}),
      ...(outcome.memberId ? { memberId: outcome.memberId } : {}),
      ...(outcome.role ? { role: outcome.role } : {}),
      ...(outcome.actorRole ? { actorRole: outcome.actorRole } : {}),
      ...(outcome.primaryOwnerId
        ? { primaryOwnerId: outcome.primaryOwnerId }
        : {}),
    },
    { status: outcome.status },
  );
}
