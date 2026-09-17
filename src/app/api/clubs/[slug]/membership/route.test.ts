import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockTransitionError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  }
  return {
    requireViewer: vi.fn(),
    transitionClubMembership: vi.fn(),
    TransitionError: MockTransitionError,
  };
});

vi.mock("@/lib/auth", () => ({ requireViewer: mocks.requireViewer }));
vi.mock("@/lib/club-membership-service", () => ({
  ClubMembershipTransitionError: mocks.TransitionError,
  transitionClubMembership: mocks.transitionClubMembership,
}));

import { DELETE } from "@/app/api/clubs/[slug]/membership/route";

function leave() {
  return DELETE(
    new Request("http://localhost/api/clubs/club-one/membership", { method: "DELETE" }),
    { params: Promise.resolve({ slug: "club-one" }) },
  );
}

describe("club membership leave route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireViewer.mockResolvedValue({
      profile: { id: "viewer-1" },
      features: { clubAdminTools: false },
    });
    mocks.transitionClubMembership.mockResolvedValue({
      changed: true,
      memberId: "viewer-1",
      status: "left",
      redirectRequired: true,
    });
  });

  it("does not accept a client-supplied membership user ID", async () => {
    const response = await leave();

    expect(response.status).toBe(200);
    expect(mocks.transitionClubMembership).toHaveBeenCalledWith({
      clubSlug: "club-one",
      targetUserId: "viewer-1",
      actorUserId: "viewer-1",
      kind: "leave",
      hasClubAdminTools: false,
    });
  });

  it.each([404, 409] as const)("returns a %s lifecycle error", async (status) => {
    mocks.transitionClubMembership.mockRejectedValueOnce(
      new mocks.TransitionError("Membership could not change.", status),
    );

    const response = await leave();

    expect(response.status).toBe(status);
  });
});
