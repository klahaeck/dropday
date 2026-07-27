import { Rest } from "ably";
import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/auth";
import { canViewDropContent } from "@/lib/drop-visibility";
import { env, integrations } from "@/lib/env";
import { getClubMemberships, getDropById } from "@/lib/repository";

export async function GET(request: Request) {
  if (!integrations.ably || !env.ablyApiKey) return NextResponse.json({ error: "Realtime is not configured" }, { status: 503 });
  const { profile, features } = await requireViewer();
  if (!features.clubChat) return NextResponse.json({ error: "Your current plan does not include chat." }, { status: 403 });
  const url = new URL(request.url);
  const threadType = url.searchParams.get("threadType");
  const threadId = url.searchParams.get("threadId");
  if ((threadType !== "club" && threadType !== "drop") || !threadId) return NextResponse.json({ error: "Invalid thread" }, { status: 400 });
  const drop = threadType === "drop" ? await getDropById(threadId) : null;
  if (threadType === "drop" && (!drop || !canViewDropContent(drop, profile.id))) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
  const clubId = threadType === "club" ? threadId : drop?.clubId;
  if (!clubId) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  const memberships = await getClubMemberships(clubId);
  if (!memberships.some((item) => item.userId === profile.id)) return NextResponse.json({ error: "Members only" }, { status: 403 });
  const channelName = `${threadType}:${threadId}`;
  const capability = JSON.stringify({
    [channelName]: ["subscribe", "presence", "publish"],
    [`user:${profile.id}`]: ["subscribe"],
  });
  const ably = new Rest({ key: env.ablyApiKey });
  const tokenRequest = await ably.auth.createTokenRequest({ clientId: profile.id, capability, ttl: 60 * 60 * 1000 });
  return NextResponse.json(tokenRequest);
}
