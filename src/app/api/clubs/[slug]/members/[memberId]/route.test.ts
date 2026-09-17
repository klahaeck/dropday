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

import { DELETE } from "@/app/api/clubs/[slug]/members/[memberId]/route";

function remove() {
  return DELETE(
    new Request("http://localhost/api/clubs/club-one/members/member-1", { method: "DELETE" }),
    { params: Promise.resolve({ slug: "club-one", memberId: "member-1" }) },
  );
}

describe("club member removal route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireViewer.mockResolvedValue({
      profile: { id: "manager-1" },
      features: { clubAdminTools: true },
    });
    mocks.transitionClubMembership.mockResolvedValue({
      changed: true,
      memberId: "member-1",
      status: "removed",
      redirectRequired: false,
    });
  });

  it("passes the authenticated manager and route target to the service", async () => {
    const response = await remove();

    expect(response.status).toBe(200);
    expect(mocks.transitionClubMembership).toHaveBeenCalledWith({
      clubSlug: "club-one",
      targetUserId: "member-1",
      actorUserId: "manager-1",
      kind: "remove",
      hasClubAdminTools: true,
    });
  });

  it.each([403, 404, 409] as const)("returns a %s lifecycle error", async (status) => {
    mocks.transitionClubMembership.mockRejectedValueOnce(
      new mocks.TransitionError("Member could not be removed.", status),
    );

    const response = await remove();

    expect(response.status).toBe(status);
  });
});
