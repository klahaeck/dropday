import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClubMembership } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  requireViewer: vi.fn(),
  getClubBySlug: vi.fn(),
  getClubMemberships: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireViewer: mocks.requireViewer,
}));

vi.mock("@/lib/env", () => ({
  integrations: { mongo: false },
}));

vi.mock("@/lib/repository", () => ({
  getClubBySlug: mocks.getClubBySlug,
  getClubMemberships: mocks.getClubMemberships,
}));

import { PATCH } from "@/app/api/clubs/[slug]/members/[memberId]/role/route";

const timestamp = "2026-07-30T18:00:00.000Z";

function membership(overrides: Partial<ClubMembership> = {}): ClubMembership {
  return {
    id: "membership-owner",
    clubId: "club-1",
    userId: "user-owner",
    role: "owner",
    status: "active",
    queuePaused: false,
    joinedAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function request(role: string) {
  return new Request("http://localhost/api/clubs/club-one/members/user-member/role", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
}

function update(role: string, memberId = "user-member") {
  return PATCH(request(role), {
    params: Promise.resolve({ slug: "club-one", memberId }),
  });
}

describe("club member role route", () => {
  let memberships: ClubMembership[];

  beforeEach(() => {
    vi.clearAllMocks();
    memberships = [
      membership(),
      membership({
        id: "membership-admin",
        userId: "user-admin",
        role: "admin",
      }),
      membership({
        id: "membership-member",
        userId: "user-member",
        role: "member",
      }),
    ];
    mocks.requireViewer.mockResolvedValue({
      profile: { id: "user-owner" },
      features: { clubAdminTools: true },
    });
    mocks.getClubBySlug.mockResolvedValue({
      id: "club-1",
      custody: { activeOwnerId: "user-owner" },
      updatedAt: timestamp,
    });
    mocks.getClubMemberships.mockImplementation(async () => memberships);
  });

  it("promotes another member while preserving existing admins", async () => {
    const response = await update("admin");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      memberId: "user-member",
      role: "admin",
    });
    expect(memberships.find((item) => item.userId === "user-admin")?.role).toBe("admin");
    expect(memberships.find((item) => item.userId === "user-member")?.role).toBe("admin");
  });

  it("lets the owner remove an admin role", async () => {
    const response = await update("member", "user-admin");

    expect(response.status).toBe(200);
    expect(memberships.find((item) => item.userId === "user-admin")?.role).toBe("member");
  });

  it("does not let an admin grant admin access", async () => {
    mocks.requireViewer.mockResolvedValue({
      profile: { id: "user-admin" },
      features: { clubAdminTools: true },
    });

    const response = await update("admin");

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Only the club owner can change admin access.",
    });
  });

  it("rejects the owner role and keeps ownership changes out of this endpoint", async () => {
    const response = await update("owner");

    expect(response.status).toBe(400);
    expect(memberships.find((item) => item.userId === "user-member")?.role).toBe("member");
  });

  it("enforces the club administration entitlement", async () => {
    mocks.requireViewer.mockResolvedValue({
      profile: { id: "user-owner" },
      features: { clubAdminTools: false },
    });

    const response = await update("admin");

    expect(response.status).toBe(403);
    expect(memberships.find((item) => item.userId === "user-member")?.role).toBe("member");
  });
});
