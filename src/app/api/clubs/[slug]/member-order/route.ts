import { NextResponse } from "next/server";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { canUseClubManagement } from "@/lib/club-management";
import { getDb } from "@/lib/db";
import { integrations } from "@/lib/env";
import { hasSameMembers } from "@/lib/queue";
import { getClubBySlug, getClubMemberships } from "@/lib/repository";
import type { Club } from "@/types/domain";

const schema = z.object({
  memberIds: z.array(z.string().min(1)).min(1).max(1_000),
  previousMemberIds: z.array(z.string().min(1)).min(1).max(1_000),
});

function ordersMatch(first: string[], second: string[]): boolean {
  return first.length === second.length && first.every((memberId, index) => memberId === second[index]);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { profile, features } = await requireViewer();
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a valid member order." }, { status: 400 });
  }
  const club = await getClubBySlug(slug);
  if (!club) return NextResponse.json({ error: "Club not found." }, { status: 404 });

  const memberships = await getClubMemberships(club.id);
  const membership = memberships.find((item) => item.userId === profile.id);
  if (!canUseClubManagement(membership, features.clubAdminTools)) {
    return NextResponse.json({ error: "You cannot manage this club." }, { status: 403 });
  }

  const memberIds = parsed.data.memberIds;
  if (
    !ordersMatch(club.rotationMemberIds, parsed.data.previousMemberIds)
    || !hasSameMembers(club.rotationMemberIds, memberIds)
  ) {
    return NextResponse.json(
      { error: "The member list changed. Review the latest queue and try again.", memberIds: club.rotationMemberIds },
      { status: 409 },
    );
  }

  const timestamp = new Date().toISOString();
  if (!integrations.mongo) {
    club.rotationMemberIds = memberIds;
    club.updatedAt = timestamp;
    return NextResponse.json({ memberIds, demo: true });
  }

  const result = await (await getDb()).collection<Club>("clubs").updateOne(
    { id: club.id, rotationMemberIds: club.rotationMemberIds },
    { $set: { rotationMemberIds: memberIds, updatedAt: timestamp } },
  );
  if (!result.matchedCount) {
    const currentClub = await getClubBySlug(slug);
    return NextResponse.json(
      {
        error: "The member list changed while you were reordering it. Review the latest queue and try again.",
        memberIds: currentClub?.rotationMemberIds,
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ memberIds });
}
