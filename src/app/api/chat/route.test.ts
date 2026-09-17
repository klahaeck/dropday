import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockInvalidMessageCursorError extends Error {}
  return {
    requireViewer: vi.fn(),
    authorizeChatThread: vi.fn(),
    consumeRateLimit: vi.fn(),
    getUsersByIds: vi.fn(),
    insertMessage: vi.fn(),
    listMessagesPage: vi.fn(),
    InvalidMessageCursorError: MockInvalidMessageCursorError,
  };
});

vi.mock("ably", () => ({ Rest: class {} }));
vi.mock("@/lib/auth", () => ({ requireViewer: mocks.requireViewer }));
vi.mock("@/lib/chat-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chat-access")>();
  return { ...actual, authorizeChatThread: mocks.authorizeChatThread };
});
vi.mock("@/lib/env", () => ({
  env: {},
  integrations: { ably: false },
}));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: mocks.consumeRateLimit }));
vi.mock("@/lib/repository", () => ({
  createId: vi.fn(() => "message-1"),
  getUsersByIds: mocks.getUsersByIds,
  insertMessage: mocks.insertMessage,
  listMessagesPage: mocks.listMessagesPage,
  InvalidMessageCursorError: mocks.InvalidMessageCursorError,
}));

import { GET, POST } from "@/app/api/chat/route";

function post(body: unknown) {
  return POST(new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

describe("chat route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireViewer.mockResolvedValue({
      profile: { id: "user-1", displayName: "User One", initials: "UO" },
      features: { clubChat: true },
    });
    mocks.authorizeChatThread.mockResolvedValue({
      club: { id: "club-1", slug: "club-one", name: "Club One" },
      drop: null,
      memberships: [],
    });
    mocks.consumeRateLimit.mockResolvedValue(true);
    mocks.getUsersByIds.mockResolvedValue([]);
    mocks.insertMessage.mockImplementation(async (message) => ({ message, created: false }));
    mocks.listMessagesPage.mockResolvedValue({
      messages: [],
      newerCursor: "newer",
      hasMoreNewer: false,
    });
  });

  it("requires a UUID client message ID for retry-safe sends", async () => {
    const response = await post({ threadType: "club", threadId: "club-1", body: "Hello" });

    expect(response.status).toBe(400);
    expect(mocks.insertMessage).not.toHaveBeenCalled();
  });

  it("returns the canonical stored message for an idempotent retry", async () => {
    const clientMessageId = "00000000-0000-4000-8000-000000000001";
    const response = await post({
      threadType: "club",
      threadId: "club-1",
      clientMessageId,
      body: "Hello",
    });

    expect(response.status).toBe(200);
    expect(mocks.insertMessage).toHaveBeenCalledWith(
      expect.objectContaining({ clientMessageId, body: "Hello" }),
      [],
    );
    await expect(response.json()).resolves.toMatchObject({
      message: { clientMessageId, body: "Hello" },
    });
  });

  it("authorizes and forwards reconnect cursors to bounded history reads", async () => {
    const response = await GET(new Request(
      "http://localhost/api/chat?threadType=club&threadId=club-1&after=cursor-1",
    ));

    expect(response.status).toBe(200);
    expect(mocks.authorizeChatThread).toHaveBeenCalledWith(expect.objectContaining({
      threadType: "club",
      threadId: "club-1",
      viewerUserId: "user-1",
    }));
    expect(mocks.listMessagesPage).toHaveBeenCalledWith("club", "club-1", {
      before: undefined,
      after: "cursor-1",
    });
  });
});
