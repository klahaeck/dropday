import { Rest } from "ably";
import { getDb, getMongoClient } from "@/lib/db";
import { demoMessages } from "@/lib/demo-data";
import { env, integrations } from "@/lib/env";
import {
  authorizeChatThread,
  type ChatThreadAuthorizationInput,
} from "@/lib/chat-access";
import {
  chatReactionRevision,
  isAllowedChatReaction,
  toggleChatReaction,
  type ChatReactionUpdate,
} from "@/lib/chat-reactions";
import type { ChatMessage, ChatReaction } from "@/types/domain";

const DEFAULT_MAX_CAS_ATTEMPTS = 3;

export class ChatReactionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ChatReactionError";
  }
}

export interface ChatReactionPersistence {
  getMessage(messageId: string): Promise<ChatMessage | null>;
  compareAndSwap(
    messageId: string,
    expectedRevision: number,
    reactions: ChatReaction[],
  ): Promise<ChatMessage | null>;
}

export interface ChatReactionPublisher {
  publish(
    thread: Pick<ChatMessage, "threadType" | "threadId">,
    update: ChatReactionUpdate,
  ): Promise<void>;
}

export interface ChatReactionServiceDependencies {
  persistence: ChatReactionPersistence;
  authorize: (input: ChatThreadAuthorizationInput) => Promise<unknown>;
  publisher: ChatReactionPublisher;
  maxAttempts: number;
}

function cloneMessage(message: ChatMessage): ChatMessage {
  return {
    ...message,
    reactions: message.reactions.map((reaction) => ({
      emoji: reaction.emoji,
      userIds: [...reaction.userIds],
    })),
  };
}

const defaultPersistence: ChatReactionPersistence = {
  async getMessage(messageId) {
    if (!integrations.mongo) {
      const message = demoMessages.find((candidate) => candidate.id === messageId);
      return message ? cloneMessage(message) : null;
    }
    return (await getDb()).collection<ChatMessage>("messages").findOne({ id: messageId });
  },

  async compareAndSwap(messageId, expectedRevision, reactions) {
    const nextRevision = expectedRevision + 1;
    if (!integrations.mongo) {
      const index = demoMessages.findIndex((candidate) => candidate.id === messageId);
      const current = demoMessages[index];
      if (
        !current
        || current.deletedAt
        || chatReactionRevision(current) !== expectedRevision
      ) {
        return null;
      }
      const updated: ChatMessage = {
        ...current,
        reactions: reactions.map((reaction) => ({
          emoji: reaction.emoji,
          userIds: [...reaction.userIds],
        })),
        reactionRevision: nextRevision,
      };
      demoMessages[index] = updated;
      return cloneMessage(updated);
    }

    const db = await getDb();
    const client = await getMongoClient();
    let updated: ChatMessage | null = null;
    await client.withSession(async (session) => session.withTransaction(async () => {
      const revisionFilter = expectedRevision === 0
        ? {
          $or: [
            { reactionRevision: 0 },
            { reactionRevision: { $exists: false } },
          ],
        }
        : { reactionRevision: expectedRevision };
      updated = await db.collection<ChatMessage>("messages").findOneAndUpdate(
        {
          id: messageId,
          deletedAt: { $exists: false },
          ...revisionFilter,
        },
        {
          $set: {
            reactions,
            reactionRevision: nextRevision,
          },
        },
        { returnDocument: "after", session },
      );
    }));
    return updated;
  },
};

const defaultPublisher: ChatReactionPublisher = {
  async publish(thread, update) {
    if (!integrations.ably || !env.ablyApiKey) return;
    const ably = new Rest({ key: env.ablyApiKey });
    await ably.channels
      .get(`${thread.threadType}:${thread.threadId}`)
      .publish("reaction", update);
  },
};

const defaultDependencies: ChatReactionServiceDependencies = {
  persistence: defaultPersistence,
  authorize: authorizeChatThread,
  publisher: defaultPublisher,
  maxAttempts: DEFAULT_MAX_CAS_ATTEMPTS,
};

export async function persistChatReaction({
  messageId,
  actorUserId,
  clubChatEnabled,
  emoji,
  dependencies = {},
}: {
  messageId: string;
  actorUserId: string;
  clubChatEnabled: boolean;
  emoji: string;
  dependencies?: Partial<ChatReactionServiceDependencies>;
}): Promise<ChatReactionUpdate> {
  if (!isAllowedChatReaction(emoji)) {
    throw new ChatReactionError("Choose an available reaction.", 400);
  }

  const resolved = { ...defaultDependencies, ...dependencies };
  const attempts = Math.max(1, resolved.maxAttempts);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const message = await resolved.persistence.getMessage(messageId);
    if (!message || message.deletedAt) {
      throw new ChatReactionError("Message not found.", 404);
    }

    await resolved.authorize({
      threadType: message.threadType,
      threadId: message.threadId,
      viewerUserId: actorUserId,
      clubChatEnabled,
    });

    const expectedRevision = chatReactionRevision(message);
    const reactions = toggleChatReaction(message.reactions, actorUserId, emoji);
    const persisted = await resolved.persistence.compareAndSwap(
      message.id,
      expectedRevision,
      reactions,
    );
    if (!persisted) continue;

    const update: ChatReactionUpdate = {
      messageId: persisted.id,
      reactions: persisted.reactions.map((reaction) => ({
        emoji: reaction.emoji,
        userIds: [...reaction.userIds],
      })),
      reactionRevision: chatReactionRevision(persisted),
    };
    try {
      await resolved.publisher.publish(persisted, update);
    } catch {
      // Persistence is authoritative. Realtime delivery may recover through HTTP or refresh.
    }
    return update;
  }

  throw new ChatReactionError(
    "Reactions changed while yours was being saved. Try again.",
    409,
  );
}
