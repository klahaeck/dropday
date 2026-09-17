import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockChatAccessError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  }
  class MockChatReactionError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  }
  return {
    requireViewer: vi.fn(),
    persistChatReaction: vi.fn(),
    ChatAccessError: MockChatAccessError,
    ChatReactionError: MockChatReactionError,
  };
});

vi.mock("@/lib/auth", () => ({ requireViewer: mocks.requireViewer }));
vi.mock("@/lib/chat-access", () => ({ ChatAccessError: mocks.ChatAccessError }));
vi.mock("@/lib/chat-reaction-service", () => ({
  ChatReactionError: mocks.ChatReactionError,
  persistChatReaction: mocks.persistChatReaction,
}));

import { POST } from "@/app/api/chat/messages/[messageId]/reaction/route";

function request(body: unknown) {
  return new Request("http://localhost/api/chat/messages/message-1/reaction", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function react(body: unknown) {
  return POST(request(body), {
    params: Promise.resolve({ messageId: "message-1" }),
  });
}

describe("chat reaction route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireViewer.mockResolvedValue({
      profile: { id: "viewer-1" },
      features: { clubChat: true },
    });
    mocks.persistChatReaction.mockResolvedValue({
      messageId: "message-1",
      reactions: [{ emoji: "❤️", userIds: ["viewer-1"] }],
      reactionRevision: 1,
    });
  });

  it("derives the actor from the authenticated viewer", async () => {
    const response = await react({ emoji: "❤️" });

    expect(response.status).toBe(200);
    expect(mocks.persistChatReaction).toHaveBeenCalledWith({
      messageId: "message-1",
      actorUserId: "viewer-1",
      clubChatEnabled: true,
      emoji: "❤️",
    });
    await expect(response.json()).resolves.toEqual({
      messageId: "message-1",
      reactions: [{ emoji: "❤️", userIds: ["viewer-1"] }],
      reactionRevision: 1,
    });
  });

  it("rejects client-supplied actor identity", async () => {
    const response = await react({ emoji: "❤️", userId: "someone-else" });

    expect(response.status).toBe(400);
    expect(mocks.persistChatReaction).not.toHaveBeenCalled();
  });

  it("returns validation failures without mutating state", async () => {
    mocks.persistChatReaction.mockRejectedValue(
      new mocks.ChatReactionError("Choose an available reaction.", 400),
    );

    const response = await react({ emoji: "🎸" });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Choose an available reaction.",
    });
  });

  it("returns centralized access errors", async () => {
    mocks.persistChatReaction.mockRejectedValue(
      new mocks.ChatAccessError("Members only.", 403),
    );

    const response = await react({ emoji: "❤️" });

    expect(response.status).toBe(403);
  });

  it("returns missing, deleted, and bounded CAS failures from the service", async () => {
    for (const status of [404, 409]) {
      mocks.persistChatReaction.mockRejectedValueOnce(
        new mocks.ChatReactionError(status === 404 ? "Message not found." : "Try again.", status),
      );
      const response = await react({ emoji: "❤️" });
      expect(response.status).toBe(status);
    }
  });
});
