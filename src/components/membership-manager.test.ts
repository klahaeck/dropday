import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import {
  MembershipManager,
  membershipLeaveDescription,
  type MembershipManagerItem,
} from "@/components/membership-manager";

function item(overrides: Partial<MembershipManagerItem> = {}): MembershipManagerItem {
  return {
    clubId: "club-1",
    clubSlug: "club-one",
    clubName: "Club One",
    role: "member",
    isPrimaryOwner: false,
    ownsActiveTurn: false,
    activeTurnHasPlaylist: false,
    ...overrides,
  };
}

describe("membership management", () => {
  it("shows leave controls for members, admins, and non-primary co-owners", () => {
    const markup = renderToStaticMarkup(createElement(MembershipManager, {
      initialMemberships: [
        item(),
        item({ clubId: "club-2", clubName: "Club Two", role: "admin" }),
        item({ clubId: "club-3", clubName: "Club Three", role: "owner" }),
      ],
    }));

    expect(markup.match(/Leave club/g)).toHaveLength(3);
  });

  it("replaces the primary owner's leave control with transfer guidance", () => {
    const markup = renderToStaticMarkup(createElement(MembershipManager, {
      initialMemberships: [item({ role: "owner", isPrimaryOwner: true })],
    }));

    expect(markup).toContain("Transfer ownership before leaving");
    expect(markup).not.toContain(">Leave club<");
  });

  it("discloses reassignment and playlist detachment", () => {
    expect(membershipLeaveDescription(item({
      ownsActiveTurn: true,
      activeTurnHasPlaylist: true,
    }))).toContain("attached playlist will be removed");
  });
});
