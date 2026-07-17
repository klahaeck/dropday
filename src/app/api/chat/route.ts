import { Rest } from "ably";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { env, integrations } from "@/lib/env";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createId, getClubMemberships, getDropById, insertMessage } from "@/lib/repository";
import type { ChatMessage } from "@/types/domain";

const schema = z.object({ threadType: z.enum(["club", "drop"]), threadId: z.string().min(1).max(120), body: z.string().trim().min(1).max(1000) });

export async function POST(request: Request) {
  const { profile, features } = await requireViewer();
  if (!features.clubChat) return NextResponse.json({ error: "Your current plan does not include chat." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  const clubId = parsed.data.threadType === "club" ? parsed.data.threadId : (await getDropById(parsed.data.threadId))?.clubId;
  if (!clubId) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  const memberships = await getClubMemberships(clubId);
  if (!memberships.some((item) => item.userId === profile.id)) return NextResponse.json({ error: "Members only" }, { status: 403 });
  if (!(await consumeRateLimit(`chat:${profile.id}`, 30, 60))) return NextResponse.json({ error: "Slow down for a moment." }, { status: 429 });
  const message: ChatMessage = {
    id: createId("message"), threadType: parsed.data.threadType, threadId: parsed.data.threadId,
    authorId: profile.id, authorName: profile.displayName, authorInitials: profile.initials,
    body: parsed.data.body, reactions: [], createdAt: new Date().toISOString(),
  };
  await insertMessage(message);
  if (integrations.ably && env.ablyApiKey) {
    const ably = new Rest({ key: env.ablyApiKey });
    await ably.channels.get(`${parsed.data.threadType}:${parsed.data.threadId}`).publish("message", message);
  }
  return NextResponse.json({ message }, { status: 201 });
}
