import { NextResponse } from "next/server";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { ClubBackupError, createClubBackup } from "@/lib/club-backups";
import { consumeRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  draftId: z.string().trim().min(1).max(160),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { profile, features } = await requireViewer();
  if (!features.clubAdminTools || !features.backupPlaylists || !features.playlistLibrary) {
    return NextResponse.json(
      { error: "Your current plan does not include backup playlists." },
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
