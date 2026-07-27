import { Rest } from "ably";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { chatNotificationPreview, resolveMentionedUserIds } from "@/lib/chat-mentions";
import { env, integrations } from "@/lib/env";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  createId,
  getClubById,
  getClubMemberships,
  getDropById,
  getUsersByIds,
  insertMessage,
} from "@/lib/repository";
import type { ChatMessage, Notification } from "@/types/domain";

const schema = z.object({
  threadType: z.enum(["club", "drop"]),
  threadId: z.string().min(1).max(120),
  clientMessageId: z.string().uuid().optional(),
  mentionedUserIds: z.array(z.string().min(1).max(120)).max(100).optional(),
  body: z.string().trim().min(1).max(1000),
});

export async function POST(request: Request) {
  const { profile, features } = await requireViewer();
  if (!features.clubChat) return NextResponse.json({ error: "Your current plan does not include chat." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  const drop = parsed.data.threadType === "drop" ? await getDropById(parsed.data.threadId) : null;
  const clubId = parsed.data.threadType === "club" ? parsed.data.threadId : drop?.clubId;
  if (!clubId) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  const [club, memberships] = await Promise.all([
    getClubById(clubId),
    getClubMemberships(clubId),
  ]);
  if (!club) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  if (!memberships.some((item) => item.userId === profile.id)) return NextResponse.json({ error: "Members only" }, { status: 403 });
  if (!(await consumeRateLimit(`chat:${profile.id}`, 30, 60))) return NextResponse.json({ error: "Slow down for a moment." }, { status: 429 });
  const members = await getUsersByIds(memberships.map((membership) => membership.userId));
  const mentionedUserIds = resolveMentionedUserIds(
    parsed.data.body,
    members,
    parsed.data.mentionedUserIds,
    profile.id,
  );
  const timestamp = new Date().toISOString();
  const message: ChatMessage = {
    id: createId("message"), threadType: parsed.data.threadType, threadId: parsed.data.threadId,
    authorId: profile.id, authorName: profile.displayName, authorInitials: profile.initials,
    body: parsed.data.body, mentionedUserIds, reactions: [], createdAt: timestamp,
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
  await insertMessage(message, notifications);
  if (integrations.ably && env.ablyApiKey) {
    const ably = new Rest({ key: env.ablyApiKey });
    await ably.channels.get(`${parsed.data.threadType}:${parsed.data.threadId}`).publish("message", {
      ...message,
      clientMessageId: parsed.data.clientMessageId,
    });
  }
  return NextResponse.json({ message }, { status: 201 });
}
