import { describe, expect, it } from "vitest";
import { canUseClubManagement } from "@/lib/club-management";
import type { ClubMembership } from "@/types/domain";

const timestamp = "2026-07-30T18:00:00.000Z";

function membership(overrides: Partial<ClubMembership> = {}): ClubMembership {
  return {
    id: "membership-1",
    clubId: "club-1",
    userId: "user-1",
    role: "member",
    status: "active",
    queuePaused: false,
    joinedAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

describe("club management access", () => {
  it("lets an active admin use management tools without personal paid features", () => {
    expect(canUseClubManagement(membership({ role: "admin" }), false)).toBe(true);
  });

  it("still applies personal feature gates to an owner", () => {
    expect(canUseClubManagement(membership({ role: "owner" }), true)).toBe(true);
    expect(canUseClubManagement(membership({ role: "owner" }), false)).toBe(false);
  });

  it("never grants management access to an ordinary or inactive member", () => {
    expect(canUseClubManagement(membership(), true)).toBe(false);
    expect(canUseClubManagement(membership({ role: "admin", status: "removed" }), true)).toBe(false);
    expect(canUseClubManagement(undefined, true)).toBe(false);
  });
});
