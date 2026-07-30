import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/auth";
import { canUseClubManagement } from "@/lib/club-management";
import {
  buildCurrentThemeNotifications,
  deliverCurrentThemeNotifications,
} from "@/lib/club-theme-notifications";
import { getDb, getMongoClient } from "@/lib/db";
import { integrations } from "@/lib/env";
import { getClubBySlug, getClubMemberships } from "@/lib/repository";
import type { Club, Notification } from "@/types/domain";

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
  const club = await getClubBySlug(slug);
  if (!club) return NextResponse.json({ error: "Club not found." }, { status: 404 });
  const memberships = await getClubMemberships(club.id);
  const membership = memberships.find((item) => item.userId === profile.id);
  if (!canUseClubManagement(
    membership,
    features.clubAdminTools && features.clubThemes,
  )) {
    return NextResponse.json({ error: "You cannot manage this club." }, { status: 403 });
  }

  const savedTheme = club.savedThemes?.find((theme) => theme.version === version);
  if (!savedTheme) return NextResponse.json({ error: "Saved theme not found." }, { status: 404 });
  if (!integrations.mongo) return NextResponse.json({ demo: true, version });

  const timestamp = new Date().toISOString();
  const currentTheme = { ...savedTheme, updatedAt: timestamp };
  const notifications = buildCurrentThemeNotifications({
    club,
    theme: currentTheme,
    memberships,
    timestamp,
  });
  let updated = false;
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
    const db = await getDb();
    const client = await getMongoClient();
    await client.withSession(async (session) => session.withTransaction(async () => {
      const result = await db.collection<Club>("clubs").updateOne(
        { id: club.id, ...currentThemeFilter, "savedThemes.version": version },
        update,
        { session },
      );
      updated = result.matchedCount === 1;
      if (!updated || !notifications.length) return;
      await db.collection<Notification>("notifications").insertMany(notifications, { session });
    }));
  } catch {
    return NextResponse.json({ error: "Could not make this theme current." }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: "The theme list changed. Refresh and try again." }, { status: 409 });
  }

  await deliverCurrentThemeNotifications({ notifications });
  return NextResponse.json({ theme: currentTheme });
}
