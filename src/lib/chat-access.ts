import { canViewDropContent } from "@/lib/drop-visibility";
import {
  getClubById,
  getClubMemberships,
  getDropById,
} from "@/lib/repository";
import type { Club, ClubMembership, DropSlot } from "@/types/domain";

export type ChatThreadType = "club" | "drop";

export class ChatAccessError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ChatAccessError";
  }
}

export interface ChatThreadAuthorizationInput {
  threadType: ChatThreadType;
  threadId: string;
  viewerUserId: string;
  clubChatEnabled: boolean;
  timestamp?: string;
}

export interface ChatThreadAccess {
  club: Club;
  drop: DropSlot | null;
  memberships: ClubMembership[];
}

export async function authorizeChatThread({
  threadType,
  threadId,
  viewerUserId,
  clubChatEnabled,
  timestamp = new Date().toISOString(),
}: ChatThreadAuthorizationInput): Promise<ChatThreadAccess> {
  if (!clubChatEnabled) {
    throw new ChatAccessError("Chat is not available.", 403);
  }

  const drop = threadType === "drop" ? await getDropById(threadId) : null;
  if (threadType === "drop" && (!drop || !canViewDropContent(drop, viewerUserId, timestamp))) {
    throw new ChatAccessError("Thread not found.", 404);
  }

  const clubId = threadType === "club" ? threadId : drop?.clubId;
  if (!clubId) throw new ChatAccessError("Thread not found.", 404);

  const [club, memberships] = await Promise.all([
    getClubById(clubId),
    getClubMemberships(clubId),
  ]);
  if (!club || club.custody.status === "archived") {
    throw new ChatAccessError("Thread not found.", 404);
  }
  if (!memberships.some((membership) => membership.userId === viewerUserId)) {
    throw new ChatAccessError("Members only.", 403);
  }

  return { club, drop, memberships };
}
