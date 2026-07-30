import { NextResponse } from "next/server";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import {
  ClubBackupError,
  recoverOverdueDropWithBackup,
} from "@/lib/club-backups";
import { recordDropTriggerRunIds } from "@/lib/drop-attachment";
import { consumeRateLimit } from "@/lib/rate-limit";
import { dispatchOutbox, scheduleDropTasks } from "@/lib/scheduler";

const schema = z.object({
  backupId: z.string().trim().min(1).max(160),
  queueEffect: z.enum(["consumeTurn", "preserveTurn"]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { profile, features } = await requireViewer();
  if (!features.clubAdminTools || !features.backupPlaylists) {
    return NextResponse.json(
      { error: "Your current plan does not include backup recovery." },
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
    });
    let scheduleFailed = false;
    let deliveryFailed = false;
    try {
      if (result.nextDrop) {
        const runIds = await scheduleDropTasks(
          result.nextDrop,
          result.club.schedule.reminderOffsetsMinutes,
        );
        if (runIds.length) {
          await recordDropTriggerRunIds(result.nextDrop.id, runIds);
        }
      }
    } catch {
      scheduleFailed = true;
    }
    try {
      await dispatchOutbox(result.outbox.id, result.outbox.idempotencyKey);
    } catch {
      deliveryFailed = true;
    }
    const warning = scheduleFailed || deliveryFailed
      ? "The backup was published, but some follow-up tasks still need to be retried."
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
