import { NextResponse } from "next/server";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import {
  buildClubAdminPromotionNotification,
  ClubMemberRoleError,
  planClubMemberRoleChange,
  type AssignableClubRole,
} from "@/lib/club-member-role";
import { deliverBrowserNotification } from "@/lib/browser-push";
import { getDb, getMongoClient } from "@/lib/db";
import { demoNotifications } from "@/lib/demo-data";
import { integrations } from "@/lib/env";
import { createId, getClubBySlug, getClubMemberships } from "@/lib/repository";
import type { Club, ClubMembership, Notification } from "@/types/domain";

const schema = z.object({
  role: z.enum(["admin", "member"]),
});

type RoleUpdateResult = {
  status: number;
  error?: string;
  memberId?: string;
  role?: AssignableClubRole;
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
      const result = planClubMemberRoleChange({
        actorMembership: memberships.find((membership) => membership.userId === profile.id),
        targetMembership: memberships.find((membership) => membership.userId === memberId),
        activeOwnerId: club.custody.activeOwnerId,
        role: parsed.data.role,
        timestamp,
      });
      if (result.changed) {
        const target = memberships.find((membership) => membership.id === result.membership.id);
        if (target) Object.assign(target, result.membership);
        club.updatedAt = timestamp;
        const notification = buildClubAdminPromotionNotification({
          club,
          membership: result.membership,
          changed: result.changed,
          notificationId: createId("notification"),
          timestamp,
        });
        if (notification) demoNotifications.unshift(notification);
      }
      return NextResponse.json({
        memberId: result.membership.userId,
        role: result.membership.role,
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

      let planned;
      try {
        planned = planClubMemberRoleChange({
          actorMembership: currentActor,
          targetMembership: currentTarget,
          activeOwnerId: currentClub.custody.activeOwnerId,
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
        };
        return;
      }

      const clubUpdate = await db.collection<Club>("clubs").updateOne(
        { id: currentClub.id, "custody.activeOwnerId": profile.id },
        { $set: { updatedAt: timestamp } },
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

      browserNotification = buildClubAdminPromotionNotification({
        club: currentClub,
        membership: planned.membership,
        changed: planned.changed,
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
    },
    { status: outcome.status },
  );
}
