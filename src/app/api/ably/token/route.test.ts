import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireViewer: vi.fn(),
  authorizeChatThread: vi.fn(),
  createTokenRequest: vi.fn(),
}));

vi.mock("ably", () => ({
  Rest: class {
    auth = { createTokenRequest: mocks.createTokenRequest };
  },
}));
vi.mock("@/lib/auth", () => ({ requireViewer: mocks.requireViewer }));
vi.mock("@/lib/chat-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chat-access")>();
  return { ...actual, authorizeChatThread: mocks.authorizeChatThread };
});
vi.mock("@/lib/env", () => ({
  env: { ablyApiKey: "test-key" },
  integrations: { ably: true },
}));

import { GET } from "@/app/api/ably/token/route";

describe("Ably token boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireViewer.mockResolvedValue({
      profile: { id: "user-1" },
      features: { clubChat: true },
    });
    mocks.authorizeChatThread.mockResolvedValue({});
    mocks.createTokenRequest.mockResolvedValue({ keyName: "test" });
  });

  it("authorizes the requested thread without granting client publish capability", async () => {
    const response = await GET(new Request(
      "http://localhost/api/ably/token?threadType=club&threadId=club-1",
    ));

    expect(response.status).toBe(200);
    expect(mocks.authorizeChatThread).toHaveBeenCalledWith({
      threadType: "club",
      threadId: "club-1",
      viewerUserId: "user-1",
      clubChatEnabled: true,
    });
    const requestOptions = mocks.createTokenRequest.mock.calls[0]?.[0] as { capability: string };
    expect(JSON.parse(requestOptions.capability)).toEqual({
      "club:club-1": ["subscribe", "presence"],
      "user:user-1": ["subscribe"],
    });
    expect(requestOptions.capability).not.toContain("publish");
  });
});
