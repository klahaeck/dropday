import { Rest } from "ably";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import {
  authorizeChatThread,
  ChatAccessError,
} from "@/lib/chat-access";
import { chatNotificationPreview, resolveMentionedUserIds } from "@/lib/chat-mentions";
import { canViewDropContent } from "@/lib/drop-visibility";
import { env, integrations } from "@/lib/env";
import { consumeRateLimit } from "@/lib/rate-limit";
import { reportOperationalError } from "@/lib/observability";
import {
  createId,
  getUsersByIds,
  InvalidMessageCursorError,
  insertMessage,
  listMessagesPage,
} from "@/lib/repository";
import type { ChatMessage, Notification } from "@/types/domain";

const schema = z.object({
  threadType: z.enum(["club", "drop"]),
  threadId: z.string().min(1).max(120),
  clientMessageId: z.string().uuid(),
  mentionedUserIds: z.array(z.string().min(1).max(120)).max(100).optional(),
  body: z.string().trim().min(1).max(1000),
});

const historySchema = z.object({
  threadType: z.enum(["club", "drop"]),
  threadId: z.string().min(1).max(120),
  before: z.string().min(1).max(500).optional(),
  after: z.string().min(1).max(500).optional(),
}).refine((value) => !(value.before && value.after));

export async function GET(request: Request) {
  const { profile, features } = await requireViewer();
  const url = new URL(request.url);
  const parsed = historySchema.safeParse({
    threadType: url.searchParams.get("threadType"),
    threadId: url.searchParams.get("threadId"),
    before: url.searchParams.get("before") ?? undefined,
    after: url.searchParams.get("after") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid message history request" }, { status: 400 });
  try {
    await authorizeChatThread({
      threadType: parsed.data.threadType,
      threadId: parsed.data.threadId,
      viewerUserId: profile.id,
      clubChatEnabled: features.clubChat,
    });
    const page = await listMessagesPage(parsed.data.threadType, parsed.data.threadId, {
      before: parsed.data.before,
      after: parsed.data.after,
    });
    return NextResponse.json(page);
  } catch (error) {
    if (error instanceof ChatAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof InvalidMessageCursorError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

export async function POST(request: Request) {
  const { profile, features } = await requireViewer();
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  const timestamp = new Date().toISOString();
  let access: Awaited<ReturnType<typeof authorizeChatThread>>;
  try {
    access = await authorizeChatThread({
      threadType: parsed.data.threadType,
      threadId: parsed.data.threadId,
      viewerUserId: profile.id,
      clubChatEnabled: features.clubChat,
      timestamp,
    });
  } catch (error) {
    if (error instanceof ChatAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
  const { club, drop, memberships } = access;
  if (!(await consumeRateLimit(`chat:${profile.id}`, 30, 60))) return NextResponse.json({ error: "Slow down for a moment." }, { status: 429 });
  const members = await getUsersByIds(memberships.map((membership) => membership.userId));
  const mentionedUserIds = resolveMentionedUserIds(
    parsed.data.body,
    members,
    parsed.data.mentionedUserIds,
    profile.id,
  ).filter((userId) => !drop || canViewDropContent(drop, userId, timestamp));
  const message: ChatMessage = {
    id: createId("message"), threadType: parsed.data.threadType, threadId: parsed.data.threadId,
    authorId: profile.id, authorName: profile.displayName, authorInitials: profile.initials,
    clientMessageId: parsed.data.clientMessageId,
    body: parsed.data.body, mentionedUserIds, reactions: [], reactionRevision: 0, createdAt: timestamp,
  };
  const chatLabel = parsed.data.threadType === "club" ? "club chat" : "drop chat";
  const href = parsed.data.threadType === "club"
    ? `/app/clubs/${club.slug}#club-chat`
    : `/app/clubs/${club.slug}/drops/${parsed.data.threadId}`;
  const notifications: Notification[] = mentionedUserIds.map((userId) => ({
    id: `notification_mention_${message.id}_${userId}`,
    userId,
    kind: "mention",
    title: `${profile.displayName} mentioned you`,
    body: `In ${club.name} ${chatLabel}: ${chatNotificationPreview(parsed.data.body)}`,
    href,
    createdAt: timestamp,
  }));
  const stored = await insertMessage(message, notifications);
  if (stored.created && integrations.ably && env.ablyApiKey) {
    const ably = new Rest({ key: env.ablyApiKey });
    try {
      await ably.channels.get(`${parsed.data.threadType}:${parsed.data.threadId}`).publish("message", {
        ...stored.message,
      });
    } catch (error) {
      // The stored message remains successful even if realtime delivery is interrupted.
      reportOperationalError("chat.realtime.publish", error, {
        messageId: stored.message.id,
        threadType: parsed.data.threadType,
        threadId: parsed.data.threadId,
      });
    }
  }
  return NextResponse.json({ message: stored.message }, { status: stored.created ? 201 : 200 });
}
