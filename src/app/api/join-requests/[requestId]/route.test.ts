import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockDecisionError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  }
  class MockWithdrawalError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  }
  return {
    requireViewer: vi.fn(),
    decideJoinRequest: vi.fn(),
    withdrawJoinRequest: vi.fn(),
    DecisionError: MockDecisionError,
    WithdrawalError: MockWithdrawalError,
  };
});

vi.mock("@/lib/auth", () => ({ requireViewer: mocks.requireViewer }));
vi.mock("@/lib/join-request-service", () => ({
  decideJoinRequest: mocks.decideJoinRequest,
  withdrawJoinRequest: mocks.withdrawJoinRequest,
  JoinRequestDecisionError: mocks.DecisionError,
  JoinRequestWithdrawalError: mocks.WithdrawalError,
}));

import { DELETE } from "@/app/api/join-requests/[requestId]/route";

function withdraw(requestId = "join-1") {
  return DELETE(
    new Request(`http://localhost/api/join-requests/${requestId}`, { method: "DELETE" }),
    { params: Promise.resolve({ requestId }) },
  );
}

describe("join-request withdrawal route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireViewer.mockResolvedValue({ profile: { id: "user-1" }, features: {} });
    mocks.withdrawJoinRequest.mockResolvedValue({
      request: { id: "join-1", status: "withdrawn" },
      demo: false,
    });
  });

  it("uses the authenticated viewer as the requester", async () => {
    const response = await withdraw();

    expect(response.status).toBe(200);
    expect(mocks.withdrawJoinRequest).toHaveBeenCalledWith({
      requestId: "join-1",
      actorUserId: "user-1",
    });
    await expect(response.json()).resolves.toMatchObject({
      request: { status: "withdrawn" },
    });
  });

  it.each([
    [403, "You can only withdraw your own request."],
    [404, "Join request not found."],
    [409, "This request is no longer pending."],
  ] as const)("returns %s withdrawal errors", async (status, message) => {
    mocks.withdrawJoinRequest.mockRejectedValueOnce(
      new mocks.WithdrawalError(message, status),
    );

    const response = await withdraw();

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error: message });
  });
});
