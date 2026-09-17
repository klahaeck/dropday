import { NextResponse } from "next/server";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import {
  attachPlaylistToDrop,
  DropAttachmentError,
} from "@/lib/drop-attachment";
import { consumeRateLimit } from "@/lib/rate-limit";
import { reportOperationalError } from "@/lib/observability";
import { dispatchOutbox } from "@/lib/scheduler";

const schema = z.object({
  draftId: z.string().trim().min(1).max(160),
  reviewedAction: z.enum(["attach", "replace", "publish-late"]),
  expectedCurrentDraftId: z.string().trim().min(1).max(160).nullable(),
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
      reviewedAction: parsed.data.reviewedAction,
      expectedCurrentDraftId: parsed.data.expectedCurrentDraftId,
    });
    let followUpKickFailed = false;
    for (const event of [result.scheduleOutbox, result.outbox]) {
      if (!event) continue;
      try {
        await dispatchOutbox(event.id, event.idempotencyKey);
      } catch (error) {
        reportOperationalError("drop.follow-up-dispatch", error, {
          dropId: result.drop.id,
          outboxId: event.id,
        });
        followUpKickFailed = true;
      }
    }
    const warning = followUpKickFailed
      ? "The playlist was saved and its follow-up work was queued for automatic retry."
      : undefined;
    return NextResponse.json({
      drop: result.drop,
      demo: result.demo,
      recovered: result.drop.status === "published",
      action: result.action,
      playlist: {
        title: result.playlist.title,
        sourceDraftId: result.playlist.sourceDraftId,
      },
      warning,
    });
  } catch (error) {
    if (error instanceof DropAttachmentError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Could not attach this playlist." }, { status: 500 });
  }
}
