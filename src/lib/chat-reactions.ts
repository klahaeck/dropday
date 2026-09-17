import type { ChatMessage, ChatReaction } from "@/types/domain";

export const CHAT_QUICK_REACTIONS = ["🔥", "💿", "❤️", "🫡", "☀️"] as const;

export type ChatQuickReaction = (typeof CHAT_QUICK_REACTIONS)[number];

export interface ChatReactionUpdate {
  messageId: string;
  reactions: ChatReaction[];
  reactionRevision: number;
}

export interface PendingChatReaction {
  desiredEmoji: string | null;
  canonicalReactions: ChatReaction[];
  canonicalRevision: number;
}

export interface ChatReactionClientState {
  messages: ChatMessage[];
  pendingByMessageId: Record<string, PendingChatReaction>;
}

function cloneReactions(reactions: ChatReaction[]): ChatReaction[] {
  return reactions.map((reaction) => ({
    emoji: reaction.emoji,
    userIds: [...reaction.userIds],
  }));
}

function withoutPending(
  pendingByMessageId: Record<string, PendingChatReaction>,
  messageId: string,
) {
  const next = { ...pendingByMessageId };
  delete next[messageId];
  return next;
}

export function chatReactionRevision(
  message: Pick<ChatMessage, "reactionRevision">,
) {
  return message.reactionRevision ?? 0;
}

export function isAllowedChatReaction(emoji: string): emoji is ChatQuickReaction {
  return (CHAT_QUICK_REACTIONS as readonly string[]).includes(emoji);
}

export function chatReactionForUser(
  reactions: ChatReaction[],
  userId: string,
): string | null {
  return reactions.find((reaction) => reaction.userIds.includes(userId))?.emoji ?? null;
}

export function setChatReaction(
  reactions: ChatReaction[],
  userId: string,
  emoji: string | null,
): ChatReaction[] {
  const reactionsWithoutUser = reactions
    .map((reaction) => ({
      ...reaction,
      userIds: reaction.userIds.filter((id) => id !== userId),
    }))
    .filter((reaction) => reaction.userIds.length > 0);

  if (!emoji) return reactionsWithoutUser;

  const existingReaction = reactionsWithoutUser.find((reaction) => reaction.emoji === emoji);
  if (existingReaction) {
    return reactionsWithoutUser.map((reaction) => reaction.emoji === emoji
      ? { ...reaction, userIds: [...reaction.userIds, userId] }
      : reaction);
  }

  return [...reactionsWithoutUser, { emoji, userIds: [userId] }];
}

export function toggleChatReaction(
  reactions: ChatReaction[],
  userId: string,
  emoji: string,
): ChatReaction[] {
  const desiredEmoji = chatReactionForUser(reactions, userId) === emoji ? null : emoji;
  return setChatReaction(reactions, userId, desiredEmoji);
}

export function startOptimisticChatReaction(
  state: ChatReactionClientState,
  messageId: string,
  userId: string,
  emoji: string,
): ChatReactionClientState {
  if (state.pendingByMessageId[messageId]) return state;
  const message = state.messages.find((candidate) => candidate.id === messageId);
  if (!message || message.deletedAt) return state;

  const currentEmoji = chatReactionForUser(message.reactions, userId);
  const desiredEmoji = currentEmoji === emoji ? null : emoji;
  const pending: PendingChatReaction = {
    desiredEmoji,
    canonicalReactions: cloneReactions(message.reactions),
    canonicalRevision: chatReactionRevision(message),
  };

  return {
    messages: state.messages.map((candidate) => candidate.id === messageId
      ? { ...candidate, reactions: setChatReaction(candidate.reactions, userId, desiredEmoji) }
      : candidate),
    pendingByMessageId: {
      ...state.pendingByMessageId,
      [messageId]: pending,
    },
  };
}

export function applyCanonicalChatReaction(
  state: ChatReactionClientState,
  update: ChatReactionUpdate,
  userId: string,
  settlePendingRequest = false,
): ChatReactionClientState {
  const message = state.messages.find((candidate) => candidate.id === update.messageId);
  if (!message) return state;
  const pending = state.pendingByMessageId[update.messageId];
  const currentCanonicalRevision = pending?.canonicalRevision ?? chatReactionRevision(message);

  if (update.reactionRevision < currentCanonicalRevision) {
    if (!pending || !settlePendingRequest) return state;
    return {
      messages: state.messages.map((candidate) => candidate.id === update.messageId
        ? {
          ...candidate,
          reactions: cloneReactions(pending.canonicalReactions),
          reactionRevision: pending.canonicalRevision,
        }
        : candidate),
      pendingByMessageId: withoutPending(state.pendingByMessageId, update.messageId),
    };
  }
  if (update.reactionRevision === currentCanonicalRevision && !settlePendingRequest) return state;

  const canonicalReactions = cloneReactions(update.reactions);
  const visibleReactions = pending && !settlePendingRequest
    ? setChatReaction(canonicalReactions, userId, pending.desiredEmoji)
    : canonicalReactions;

  return {
    messages: state.messages.map((candidate) => candidate.id === update.messageId
      ? {
        ...candidate,
        reactions: visibleReactions,
        reactionRevision: update.reactionRevision,
      }
      : candidate),
    pendingByMessageId: pending && !settlePendingRequest
      ? {
        ...state.pendingByMessageId,
        [update.messageId]: {
          ...pending,
          canonicalReactions,
          canonicalRevision: update.reactionRevision,
        },
      }
      : withoutPending(state.pendingByMessageId, update.messageId),
  };
}

export function rollbackOptimisticChatReaction(
  state: ChatReactionClientState,
  messageId: string,
): ChatReactionClientState {
  const pending = state.pendingByMessageId[messageId];
  if (!pending) return state;

  return {
    messages: state.messages.map((candidate) => candidate.id === messageId
      ? {
        ...candidate,
        reactions: cloneReactions(pending.canonicalReactions),
        reactionRevision: pending.canonicalRevision,
      }
      : candidate),
    pendingByMessageId: withoutPending(state.pendingByMessageId, messageId),
  };
}
