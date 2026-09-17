import { NextResponse } from "next/server";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { ChatAccessError } from "@/lib/chat-access";
import {
  ChatReactionError,
  persistChatReaction,
} from "@/lib/chat-reaction-service";

const schema = z.object({
  emoji: z.string().min(1).max(16),
}).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const { profile, features } = await requireViewer();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid reaction." }, { status: 400 });
  }

  const { messageId } = await params;
  try {
    const update = await persistChatReaction({
      messageId,
      actorUserId: profile.id,
      clubChatEnabled: features.clubChat,
      emoji: parsed.data.emoji,
    });
    return NextResponse.json(update);
  } catch (error) {
    if (error instanceof ChatReactionError || error instanceof ChatAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
