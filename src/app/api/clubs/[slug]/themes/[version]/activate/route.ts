import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { integrations } from "@/lib/env";
import { getClubBySlug, getClubMemberships } from "@/lib/repository";
import type { Club } from "@/types/domain";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string; version: string }> },
) {
  const { slug, version: versionParam } = await params;
  const version = Number(versionParam);
  if (!Number.isInteger(version) || version < 1) {
    return NextResponse.json({ error: "Invalid theme version." }, { status: 400 });
  }

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

  const savedTheme = club.savedThemes?.find((theme) => theme.version === version);
  if (!savedTheme) return NextResponse.json({ error: "Saved theme not found." }, { status: 404 });
  if (!integrations.mongo) return NextResponse.json({ demo: true, version });

  const timestamp = new Date().toISOString();
  const currentTheme = { ...savedTheme, updatedAt: timestamp };
  try {
    const currentThemeFilter = club.currentTheme
      ? { "currentTheme.version": club.currentTheme.version }
      : { currentTheme: { $exists: false } };
    const update = club.currentTheme
      ? {
          $set: { currentTheme, updatedAt: timestamp },
          $push: { themeHistory: club.currentTheme },
          $pull: { savedThemes: { version } },
        }
      : {
          $set: { currentTheme, updatedAt: timestamp },
          $pull: { savedThemes: { version } },
        };
    const result = await (await getDb()).collection<Club>("clubs").updateOne(
      { id: club.id, ...currentThemeFilter, "savedThemes.version": version },
      update,
    );
    if (!result.matchedCount) {
      return NextResponse.json({ error: "The theme list changed. Refresh and try again." }, { status: 409 });
    }
  } catch {
    return NextResponse.json({ error: "Could not make this theme current." }, { status: 500 });
  }

  return NextResponse.json({ theme: currentTheme });
}
