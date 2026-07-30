import { NextResponse } from "next/server";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import {
  attachPlaylistToDrop,
  DropAttachmentError,
  recordDropTriggerRunIds,
} from "@/lib/drop-attachment";
import { consumeRateLimit } from "@/lib/rate-limit";
import { dispatchOutbox, scheduleDropTasks } from "@/lib/scheduler";

const schema = z.object({
  draftId: z.string().trim().min(1).max(160),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ dropId: string }> },
) {
  const { dropId } = await params;
  const { profile, features } = await requireViewer();
  if (!features.playlistLibrary) {
    return NextResponse.json(
      { error: "Your current plan does not include the playlist library." },
      { status: 403 },
    );
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a prepared playlist." }, { status: 400 });
  }
  if (!(await consumeRateLimit(`drop-attachment:${profile.id}`, 20, 60))) {
    return NextResponse.json(
      { error: "Too many playlist changes. Try again in a minute." },
      { status: 429 },
    );
  }

  try {
    const result = await attachPlaylistToDrop({
      dropId,
      draftId: parsed.data.draftId,
      actorUserId: profile.id,
    });
    let scheduleFailed = false;
    let deliveryFailed = false;
    try {
      const dropToSchedule = result.nextDrop
        ?? (result.drop.status === "scheduled" ? result.drop : undefined);
      const runIds = dropToSchedule
        ? await scheduleDropTasks(
            dropToSchedule,
            result.club.schedule.reminderOffsetsMinutes,
          )
        : [];
      if (runIds.length) {
        await recordDropTriggerRunIds(dropToSchedule!.id, runIds);
        dropToSchedule!.triggerRunIds = runIds;
      }
    } catch {
      scheduleFailed = true;
    }
    if (result.outbox) {
      try {
        await dispatchOutbox(result.outbox.id, result.outbox.idempotencyKey);
      } catch {
        deliveryFailed = true;
      }
    }
    const warning = result.drop.status === "published"
      ? scheduleFailed || deliveryFailed
        ? "The playlist was published, but some follow-up tasks still need to be retried."
        : undefined
      : scheduleFailed
        ? "The playlist is attached, but the drop schedule could not be re-confirmed."
        : undefined;
    return NextResponse.json({
      drop: result.drop,
      demo: result.demo,
      recovered: result.drop.status === "published",
      warning,
    });
  } catch (error) {
    if (error instanceof DropAttachmentError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Could not attach this playlist." }, { status: 500 });
  }
}
