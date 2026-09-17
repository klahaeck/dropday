import { describe, expect, it, vi } from "vitest";
import { ChatAccessError } from "@/lib/chat-access";
import {
  ChatReactionError,
  persistChatReaction,
  type ChatReactionPersistence,
  type ChatReactionPublisher,
} from "@/lib/chat-reaction-service";
import type { ChatMessage } from "@/types/domain";

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "message-1",
    threadType: "club",
    threadId: "club-1",
    authorId: "author-1",
    authorName: "Author",
    authorInitials: "A",
    body: "hello",
    reactions: [],
    reactionRevision: 0,
    createdAt: "2026-09-17T18:00:00.000Z",
    ...overrides,
  };
}

function harness(initial: ChatMessage, conflicts = 0) {
  let stored = message(initial);
  let remainingConflicts = conflicts;
  const persistence: ChatReactionPersistence = {
    getMessage: vi.fn(async () => message(stored)),
    compareAndSwap: vi.fn(async (_messageId, expectedRevision, reactions) => {
      if (remainingConflicts > 0) {
        remainingConflicts -= 1;
        stored = {
          ...stored,
          reactions: [{ emoji: "🔥", userIds: ["concurrent-user"] }],
          reactionRevision: (stored.reactionRevision ?? 0) + 1,
        };
        return null;
      }
      if ((stored.reactionRevision ?? 0) !== expectedRevision) return null;
      stored = {
        ...stored,
        reactions,
        reactionRevision: expectedRevision + 1,
      };
      return message(stored);
    }),
  };
  const publisher: ChatReactionPublisher = { publish: vi.fn(async () => undefined) };
  const authorize = vi.fn(async () => undefined);
  return { persistence, publisher, authorize, stored: () => stored };
}

function persist(
  setup: ReturnType<typeof harness>,
  emoji = "❤️",
  actorUserId = "user-1",
  maxAttempts = 3,
) {
  return persistChatReaction({
    messageId: "message-1",
    actorUserId,
    clubChatEnabled: true,
    emoji,
    dependencies: { ...setup, maxAttempts },
  });
}

describe("chat reaction persistence", () => {
  it("adds a reaction and publishes the persisted canonical result", async () => {
    const setup = harness(message());

    const update = await persist(setup);

    expect(update).toEqual({
      messageId: "message-1",
      reactions: [{ emoji: "❤️", userIds: ["user-1"] }],
      reactionRevision: 1,
    });
    expect(setup.publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ reactionRevision: 1 }),
      update,
    );
  });

  it("replaces the actor's reaction without changing another user's reaction", async () => {
    const setup = harness(message({
      reactions: [
        { emoji: "🔥", userIds: ["user-1", "user-2"] },
        { emoji: "💿", userIds: ["user-3"] },
      ],
    }));

    await expect(persist(setup)).resolves.toMatchObject({
      reactions: [
        { emoji: "🔥", userIds: ["user-2"] },
        { emoji: "💿", userIds: ["user-3"] },
        { emoji: "❤️", userIds: ["user-1"] },
      ],
    });
  });

  it("removes the actor's reaction when toggled again", async () => {
    const setup = harness(message({
      reactions: [{ emoji: "❤️", userIds: ["user-1", "user-2"] }],
    }));

    await expect(persist(setup)).resolves.toMatchObject({
      reactions: [{ emoji: "❤️", userIds: ["user-2"] }],
    });
  });

  it("rejects an invalid emoji before persistence", async () => {
    const setup = harness(message());

    await expect(persist(setup, "🎸")).rejects.toMatchObject({
      status: 400,
    } satisfies Partial<ChatReactionError>);
    expect(setup.persistence.compareAndSwap).not.toHaveBeenCalled();
  });

  it("rejects missing and deleted messages", async () => {
    const missing = harness(message());
    vi.mocked(missing.persistence.getMessage).mockResolvedValue(null);
    const deleted = harness(message({ deletedAt: "2026-09-17T19:00:00.000Z" }));

    await expect(persist(missing)).rejects.toMatchObject({ status: 404 });
    await expect(persist(deleted)).rejects.toMatchObject({ status: 404 });
  });

  it("preserves centralized access denial", async () => {
    const setup = harness(message());
    setup.authorize.mockRejectedValue(new ChatAccessError("Members only.", 403));

    await expect(persist(setup)).rejects.toMatchObject({ status: 403 });
    expect(setup.persistence.compareAndSwap).not.toHaveBeenCalled();
  });

  it("retries a CAS conflict and preserves the concurrent reaction", async () => {
    const setup = harness(message(), 1);

    await expect(persist(setup)).resolves.toEqual({
      messageId: "message-1",
      reactions: [
        { emoji: "🔥", userIds: ["concurrent-user"] },
        { emoji: "❤️", userIds: ["user-1"] },
      ],
      reactionRevision: 2,
    });
    expect(setup.persistence.compareAndSwap).toHaveBeenCalledTimes(2);
  });

  it("returns 409 after bounded CAS conflicts", async () => {
    const setup = harness(message(), 4);

    await expect(persist(setup, "❤️", "user-1", 3)).rejects.toMatchObject({
      status: 409,
    } satisfies Partial<ChatReactionError>);
    expect(setup.persistence.compareAndSwap).toHaveBeenCalledTimes(3);
  });

  it("keeps the persisted change successful when realtime publication fails", async () => {
    const setup = harness(message());
    vi.mocked(setup.publisher.publish).mockRejectedValue(new Error("Ably unavailable"));

    await expect(persist(setup)).resolves.toMatchObject({ reactionRevision: 1 });
    expect(setup.stored().reactionRevision).toBe(1);
  });
});
