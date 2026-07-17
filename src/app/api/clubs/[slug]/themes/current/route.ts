import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { integrations } from "@/lib/env";
import { getClubBySlug, getClubMemberships } from "@/lib/repository";
import type { Club } from "@/types/domain";

export async function DELETE(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { profile, features } = await requireViewer();
  if (!features.clubAdminTools || !features.clubThemes) {
    return NextResponse.json({ error: "Your current plan does not include club themes." }, { status: 403 });
  }

  const club = await getClubBySlug(slug);
  if (!club) return NextResponse.json({ error: "Club not found." }, { status: 404 });
  const memberships = await getClubMemberships(club.id);
  const membership = memberships.find((item) => item.userId === profile.id);
  if (!membership || membership.role === "member") {
    return NextResponse.json({ error: "You cannot manage this club." }, { status: 403 });
  }
  if (!club.currentTheme) return NextResponse.json({ freeform: true });
  if (!integrations.mongo) return NextResponse.json({ demo: true, freeform: true });

  const timestamp = new Date().toISOString();
  try {
    const result = await (await getDb()).collection<Club>("clubs").updateOne(
      { id: club.id, "currentTheme.version": club.currentTheme.version, "savedThemes.version": { $ne: club.currentTheme.version } },
      {
        $set: { updatedAt: timestamp },
        $unset: { currentTheme: "" },
        $push: { savedThemes: club.currentTheme },
      },
    );
    if (!result.matchedCount) {
      return NextResponse.json({ error: "The theme list changed. Refresh and try again." }, { status: 409 });
    }
  } catch {
    return NextResponse.json({ error: "Could not switch this club to freeform." }, { status: 500 });
  }

  return NextResponse.json({ freeform: true });
}
