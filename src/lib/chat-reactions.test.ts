import { describe, expect, it } from "vitest";
import { toggleChatReaction } from "@/lib/chat-reactions";

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
});
