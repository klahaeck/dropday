import { NextResponse } from "next/server";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { ClubBackupError, createClubBackup } from "@/lib/club-backups";
import { canUseClubManagement } from "@/lib/club-management";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getClubBySlug, getClubMemberships } from "@/lib/repository";

const schema = z.object({
  draftId: z.string().trim().min(1).max(160),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { profile, features } = await requireViewer();
  const club = await getClubBySlug(slug);
  if (!club) return NextResponse.json({ error: "Club not found." }, { status: 404 });
  const memberships = await getClubMemberships(club.id);
  const membership = memberships.find((item) => item.userId === profile.id);
  if (
    !features.playlistLibrary
    || !canUseClubManagement(
      membership,
      features.clubAdminTools && features.backupPlaylists,
    )
  ) {
    return NextResponse.json(
      { error: "You cannot manage backup playlists for this club." },
      { status: 403 },
    );
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a prepared playlist." }, { status: 400 });
  }
  if (!(await consumeRateLimit(`club-backups:${profile.id}`, 20, 60))) {
    return NextResponse.json(
      { error: "Too many backup changes. Try again in a minute." },
      { status: 429 },
    );
  }

  try {
    const backup = await createClubBackup({
      clubSlug: slug,
      actorUserId: profile.id,
      draftId: parsed.data.draftId,
    });
    return NextResponse.json({ backup }, { status: 201 });
  } catch (error) {
    if (error instanceof ClubBackupError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Could not add this backup playlist." }, { status: 500 });
  }
}
