import { NextResponse } from "next/server";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import {
  ClubBackupError,
  recoverOverdueDropWithBackup,
} from "@/lib/club-backups";
import { canUseClubManagement } from "@/lib/club-management";
import { consumeRateLimit } from "@/lib/rate-limit";
import { reportOperationalError } from "@/lib/observability";
import { getClubBySlug, getClubMemberships } from "@/lib/repository";
import { dispatchOutbox } from "@/lib/scheduler";

const schema = z.object({
  backupId: z.string().trim().min(1).max(160),
  queueEffect: z.enum(["consumeTurn", "preserveTurn"]),
  reviewedAction: z.literal("publish-backup"),
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
  if (!canUseClubManagement(
    membership,
    features.clubAdminTools && features.backupPlaylists,
  )) {
    return NextResponse.json(
      { error: "You cannot recover drops for this club." },
      { status: 403 },
    );
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose a backup playlist and how the missed turn should affect the queue." },
      { status: 400 },
    );
  }
  if (!(await consumeRateLimit(`drop-recovery:${profile.id}`, 10, 60))) {
    return NextResponse.json(
      { error: "Too many recovery attempts. Try again in a minute." },
      { status: 429 },
    );
  }

  try {
    const result = await recoverOverdueDropWithBackup({
      clubSlug: slug,
      backupId: parsed.data.backupId,
      actorUserId: profile.id,
      queueEffect: parsed.data.queueEffect,
      reviewedAction: parsed.data.reviewedAction,
    });
    let followUpKickFailed = false;
    for (const event of [result.scheduleOutbox, result.outbox]) {
      if (!event) continue;
      try {
        await dispatchOutbox(event.id, event.idempotencyKey);
      } catch (error) {
        reportOperationalError("drop-recovery.follow-up-dispatch", error, {
          clubId: club.id,
          outboxId: event.id,
        });
        followUpKickFailed = true;
      }
    }
    const warning = followUpKickFailed
      ? "The backup was published and its follow-up work was queued for automatic retry."
      : undefined;
    return NextResponse.json({
      drop: result.drop,
      nextDrop: result.nextDrop,
      backup: result.backup,
      warning,
    });
  } catch (error) {
    if (error instanceof ClubBackupError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Could not recover this overdue drop." }, { status: 500 });
  }
}
