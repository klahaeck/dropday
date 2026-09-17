import { Rest } from "ably";
import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/auth";
import {
  authorizeChatThread,
  ChatAccessError,
} from "@/lib/chat-access";
import { env, integrations } from "@/lib/env";

export async function GET(request: Request) {
  if (!integrations.ably || !env.ablyApiKey) return NextResponse.json({ error: "Realtime is not configured" }, { status: 503 });
  const { profile, features } = await requireViewer();
  const url = new URL(request.url);
  const threadType = url.searchParams.get("threadType");
  const threadId = url.searchParams.get("threadId");
  if ((threadType !== "club" && threadType !== "drop") || !threadId) return NextResponse.json({ error: "Invalid thread" }, { status: 400 });
  try {
    await authorizeChatThread({
      threadType,
      threadId,
      viewerUserId: profile.id,
      clubChatEnabled: features.clubChat,
    });
  } catch (error) {
    if (error instanceof ChatAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
  const channelName = `${threadType}:${threadId}`;
  const capability = JSON.stringify({
    [channelName]: ["subscribe", "presence"],
    [`user:${profile.id}`]: ["subscribe"],
  });
  const ably = new Rest({ key: env.ablyApiKey });
  const tokenRequest = await ably.auth.createTokenRequest({ clientId: profile.id, capability, ttl: 60 * 60 * 1000 });
  return NextResponse.json(tokenRequest);
}
