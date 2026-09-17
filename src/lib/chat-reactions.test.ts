import { describe, expect, it } from "vitest";
import {
  applyCanonicalChatReaction,
  rollbackOptimisticChatReaction,
  startOptimisticChatReaction,
  toggleChatReaction,
  type ChatReactionClientState,
} from "@/lib/chat-reactions";

function clientState(): ChatReactionClientState {
  return {
    messages: [{
      id: "message-1",
      threadType: "club",
      threadId: "club-1",
      authorId: "author-1",
      authorName: "Author",
      authorInitials: "A",
      body: "hello",
      reactions: [{ emoji: "🔥", userIds: ["another-user"] }],
      reactionRevision: 1,
      createdAt: "2026-09-17T18:00:00.000Z",
    }],
    pendingByMessageId: {},
  };
}

describe("chat reactions", () => {
  it("replaces a user's existing reaction on the same message", () => {
    const reactions = [
      { emoji: "🔥", userIds: ["current-user", "another-user"] },
      { emoji: "❤️", userIds: ["third-user"] },
    ];

    expect(toggleChatReaction(reactions, "current-user", "❤️")).toEqual([
      { emoji: "🔥", userIds: ["another-user"] },
      { emoji: "❤️", userIds: ["third-user", "current-user"] },
    ]);
  });

  it("removes the user's active reaction when they select it again", () => {
    const reactions = [{ emoji: "🔥", userIds: ["current-user", "another-user"] }];

    expect(toggleChatReaction(reactions, "current-user", "🔥")).toEqual([
      { emoji: "🔥", userIds: ["another-user"] },
    ]);
  });

  it("does not mutate the existing reactions", () => {
    const reactions = [{ emoji: "🔥", userIds: ["current-user"] }];

    toggleChatReaction(reactions, "current-user", "❤️");

    expect(reactions).toEqual([{ emoji: "🔥", userIds: ["current-user"] }]);
  });

  it("settles an optimistic reaction with the canonical response", () => {
    const optimistic = startOptimisticChatReaction(
      clientState(),
      "message-1",
      "current-user",
      "❤️",
    );

    const settled = applyCanonicalChatReaction(optimistic, {
      messageId: "message-1",
      reactions: [
        { emoji: "🔥", userIds: ["another-user"] },
        { emoji: "❤️", userIds: ["current-user"] },
      ],
      reactionRevision: 2,
    }, "current-user", true);

    expect(settled.pendingByMessageId).toEqual({});
    expect(settled.messages[0].reactions).toEqual([
      { emoji: "🔥", userIds: ["another-user"] },
      { emoji: "❤️", userIds: ["current-user"] },
    ]);
  });

  it("preserves an optimistic reaction over a remote canonical update", () => {
    const optimistic = startOptimisticChatReaction(
      clientState(),
      "message-1",
      "current-user",
      "❤️",
    );

    const reconciled = applyCanonicalChatReaction(optimistic, {
      messageId: "message-1",
      reactions: [{ emoji: "💿", userIds: ["remote-user"] }],
      reactionRevision: 2,
    }, "current-user");

    expect(reconciled.messages[0].reactions).toEqual([
      { emoji: "💿", userIds: ["remote-user"] },
      { emoji: "❤️", userIds: ["current-user"] },
    ]);
  });

  it("ignores a duplicate realtime revision", () => {
    const state = clientState();

    expect(applyCanonicalChatReaction(state, {
      messageId: "message-1",
      reactions: [{ emoji: "💿", userIds: ["remote-user"] }],
      reactionRevision: 1,
    }, "current-user")).toBe(state);
  });

  it("settles a stale HTTP success against a newer realtime canonical state", () => {
    const optimistic = startOptimisticChatReaction(
      clientState(),
      "message-1",
      "current-user",
      "❤️",
    );
    const realtime = applyCanonicalChatReaction(optimistic, {
      messageId: "message-1",
      reactions: [
        { emoji: "💿", userIds: ["remote-user"] },
        { emoji: "❤️", userIds: ["current-user"] },
      ],
      reactionRevision: 3,
    }, "current-user");

    const settled = applyCanonicalChatReaction(realtime, {
      messageId: "message-1",
      reactions: [{ emoji: "❤️", userIds: ["current-user"] }],
      reactionRevision: 2,
    }, "current-user", true);

    expect(settled.pendingByMessageId).toEqual({});
    expect(settled.messages[0]).toMatchObject({
      reactions: [
        { emoji: "💿", userIds: ["remote-user"] },
        { emoji: "❤️", userIds: ["current-user"] },
      ],
      reactionRevision: 3,
    });
  });

  it("rolls back only the optimistic actor while preserving a remote update", () => {
    const optimistic = startOptimisticChatReaction(
      clientState(),
      "message-1",
      "current-user",
      "❤️",
    );
    const reconciled = applyCanonicalChatReaction(optimistic, {
      messageId: "message-1",
      reactions: [{ emoji: "💿", userIds: ["remote-user"] }],
      reactionRevision: 2,
    }, "current-user");

    const rolledBack = rollbackOptimisticChatReaction(reconciled, "message-1");

    expect(rolledBack.messages[0].reactions).toEqual([
      { emoji: "💿", userIds: ["remote-user"] },
    ]);
    expect(rolledBack.messages[0].reactionRevision).toBe(2);
  });
});
