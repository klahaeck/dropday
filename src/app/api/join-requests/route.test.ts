import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireViewer: vi.fn(),
  cookies: vi.fn(),
  validateClubInvitationSession: vi.fn(),
  revokeClubInvitationSession: vi.fn(),
  countActiveMemberships: vi.fn(),
  createOrGetPendingJoinRequest: vi.fn(),
  getClubById: vi.fn(),
  getClubMemberships: vi.fn(),
  getPendingJoinRequest: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireViewer: mocks.requireViewer }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/club-invitation-sessions", () => ({
  CLUB_INVITATION_SESSION_COOKIE: "dropday_invitation_session",
  validateClubInvitationSession: mocks.validateClubInvitationSession,
  revokeClubInvitationSession: mocks.revokeClubInvitationSession,
}));
vi.mock("@/lib/repository", () => ({
  countActiveMemberships: mocks.countActiveMemberships,
  createId: vi.fn(() => "join-new"),
  createOrGetPendingJoinRequest: mocks.createOrGetPendingJoinRequest,
  getClubById: mocks.getClubById,
  getClubMemberships: mocks.getClubMemberships,
  getPendingJoinRequest: mocks.getPendingJoinRequest,
}));

import { POST } from "@/app/api/join-requests/route";

function request(body: unknown) {
  return new Request("http://localhost/api/join-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("join request invitation enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireViewer.mockResolvedValue({
      profile: { id: "user-1", plan: "middle" },
      features: { unlimitedMemberships: true },
    });
    mocks.countActiveMemberships.mockResolvedValue(0);
    mocks.cookies.mockResolvedValue({
      get: vi.fn(() => ({ value: "invitation_session_1.secret" })),
    });
    mocks.revokeClubInvitationSession.mockResolvedValue(undefined);
    mocks.getClubById.mockResolvedValue({
      id: "club-1",
      visibility: "private",
      custody: { status: "active" },
    });
    mocks.getClubMemberships.mockResolvedValue([]);
    mocks.getPendingJoinRequest.mockResolvedValue(null);
    mocks.createOrGetPendingJoinRequest.mockImplementation(async (joinRequest) => ({
      request: joinRequest,
      created: true,
    }));
  });

  it("rejects a private-club request without a valid token", async () => {
    mocks.validateClubInvitationSession.mockResolvedValue(false);

    const response = await POST(request({ clubId: "club-1" }));

    expect(response.status).toBe(403);
    expect(mocks.createOrGetPendingJoinRequest).not.toHaveBeenCalled();
  });

  it("creates the request after validating the private invitation", async () => {
    mocks.validateClubInvitationSession.mockResolvedValue(true);

    const response = await POST(request({
      clubId: "club-1",
      message: "Let me in",
    }));

    expect(response.status).toBe(201);
    expect(mocks.validateClubInvitationSession).toHaveBeenCalledWith({
      clubId: "club-1",
      userId: "user-1",
      sessionToken: "invitation_session_1.secret",
    });
    expect(mocks.createOrGetPendingJoinRequest).toHaveBeenCalledWith(expect.objectContaining({
      id: "join-new",
      clubId: "club-1",
      userId: "user-1",
      message: "Let me in",
    }));
    expect(mocks.revokeClubInvitationSession).toHaveBeenCalledWith("invitation_session_1.secret");
    expect(response.headers.get("set-cookie")).toContain("dropday_invitation_session=");
  });
});
