import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireViewer: vi.fn(),
  getClubBySlug: vi.fn(),
  getClubMemberships: vi.fn(),
  rotateClubInvitation: vi.fn(),
  revokeActiveClubInvitation: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireViewer: mocks.requireViewer }));
vi.mock("@/lib/repository", () => ({
  getClubBySlug: mocks.getClubBySlug,
  getClubMemberships: mocks.getClubMemberships,
}));
vi.mock("@/lib/club-invitations", () => ({
  rotateClubInvitation: mocks.rotateClubInvitation,
  revokeActiveClubInvitation: mocks.revokeActiveClubInvitation,
}));

import { DELETE, POST } from "@/app/api/clubs/[slug]/invitation/route";

const context = { params: Promise.resolve({ slug: "private-club" }) };

describe("club invitation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireViewer.mockResolvedValue({
      profile: { id: "owner-1" },
      features: { clubAdminTools: true },
    });
    mocks.getClubBySlug.mockResolvedValue({
      id: "club-1",
      visibility: "private",
      custody: { status: "active" },
    });
    mocks.getClubMemberships.mockResolvedValue([
      { userId: "owner-1", role: "owner", status: "active" },
    ]);
    mocks.rotateClubInvitation.mockResolvedValue({
      token: "invitation_1.secret",
      invitation: { expiresAt: "2026-10-01T12:00:00.000Z" },
    });
    mocks.revokeActiveClubInvitation.mockResolvedValue(true);
  });

  it("rotates and returns a private club token only to managers", async () => {
    const response = await POST(new Request("http://localhost"), context);

    expect(response.status).toBe(201);
    expect(mocks.rotateClubInvitation).toHaveBeenCalledWith("club-1", "owner-1");
    await expect(response.json()).resolves.toEqual({
      token: "invitation_1.secret",
      expiresAt: "2026-10-01T12:00:00.000Z",
    });
  });

  it("does not create invitation links for public clubs", async () => {
    mocks.getClubBySlug.mockResolvedValue({
      id: "club-1",
      visibility: "public",
      custody: { status: "active" },
    });

    const response = await POST(new Request("http://localhost"), context);

    expect(response.status).toBe(409);
    expect(mocks.rotateClubInvitation).not.toHaveBeenCalled();
  });

  it("revokes the active link", async () => {
    const response = await DELETE(new Request("http://localhost"), context);

    expect(response.status).toBe(204);
    expect(mocks.revokeActiveClubInvitation).toHaveBeenCalledWith("club-1");
  });
});
