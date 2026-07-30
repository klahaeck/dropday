import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/auth";
import { ClubBackupError, retireClubBackup } from "@/lib/club-backups";
import { canUseClubManagement } from "@/lib/club-management";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getClubBySlug, getClubMemberships } from "@/lib/repository";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string; backupId: string }> },
) {
  const { slug, backupId } = await params;
  const { profile, features } = await requireViewer();
  const club = await getClubBySlug(slug);
  if (!club) return NextResponse.json({ error: "Club not found." }, { status: 404 });
  const memberships = await getClubMemberships(club.id);
  const membership = memberships.find((item) => item.userId === profile.id);
  if (!canUseClubManagement(
    membership,
    features.clubAdminTools && features.backupPlaylists,
  )) {
    return NextResponse.json(
      { error: "You cannot manage backup playlists for this club." },
      { status: 403 },
    );
  }
  if (!(await consumeRateLimit(`club-backups:${profile.id}`, 20, 60))) {
    return NextResponse.json(
      { error: "Too many backup changes. Try again in a minute." },
      { status: 429 },
    );
  }

  try {
    const backup = await retireClubBackup({
      clubSlug: slug,
      backupId,
      actorUserId: profile.id,
    });
    return NextResponse.json({ backup });
  } catch (error) {
    if (error instanceof ClubBackupError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Could not retire this backup playlist." }, { status: 500 });
  }
}
