import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireViewer: vi.fn(),
  getClubBySlug: vi.fn(),
  createClubInvitationSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireViewer: mocks.requireViewer }));
vi.mock("@/lib/repository", () => ({ getClubBySlug: mocks.getClubBySlug }));
vi.mock("@/lib/club-invitation-sessions", () => ({
  CLUB_INVITATION_SESSION_COOKIE: "dropday_invitation_session",
  clubInvitationSessionCookieOptions: (expires: Date) => ({
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    expires,
    priority: "high",
  }),
  createClubInvitationSession: mocks.createClubInvitationSession,
}));

import { POST } from "@/app/api/clubs/[slug]/invitation/session/route";

const context = { params: Promise.resolve({ slug: "private-club" }) };

describe("club invitation session exchange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireViewer.mockResolvedValue({ profile: { id: "user-1" } });
    mocks.getClubBySlug.mockResolvedValue({
      id: "club-1",
      visibility: "private",
      custody: { status: "active" },
    });
    mocks.createClubInvitationSession.mockResolvedValue({
      token: "invitation_session_1.secret",
      expiresAt: new Date("2026-09-17T12:15:00.000Z"),
    });
  });

  it("sets an HttpOnly session cookie after validating the fragment secret", async () => {
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "invitation_1.secret" }),
    }), context);

    expect(response.status).toBe(200);
    expect(mocks.createClubInvitationSession).toHaveBeenCalledWith({
      clubId: "club-1",
      userId: "user-1",
      invitationToken: "invitation_1.secret",
    });
    const cookie = response.headers.get("set-cookie");
    expect(cookie).toContain("dropday_invitation_session=invitation_session_1.secret");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=lax");
  });

  it("does not create a cookie for an invalid or expired invitation", async () => {
    mocks.createClubInvitationSession.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "expired" }),
    }), context);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "This invitation link is invalid or has expired.",
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("does not reveal whether the requested private club exists", async () => {
    mocks.getClubBySlug.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "invalid" }),
    }), context);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "This invitation link is invalid or has expired.",
    });
    expect(mocks.createClubInvitationSession).not.toHaveBeenCalled();
  });
});
