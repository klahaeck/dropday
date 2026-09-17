import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import {
  ClubMembers,
  memberRemovalDescription,
  type ClubMemberItem,
} from "@/components/club-members";

function member(overrides: Partial<ClubMemberItem> = {}): ClubMemberItem {
  return {
    id: "member-1",
    displayName: "Member One",
    initials: "MO",
    role: "member",
    ...overrides,
  };
}

const ownershipMembers = [
  member({
    id: "user-owner",
    displayName: "Primary Owner",
    initials: "PO",
    role: "owner",
    isPrimaryOwner: true,
  }),
  member({
    id: "user-member",
    displayName: "Club Member",
    initials: "CM",
  }),
];

describe("club ownership controls", () => {
  it("shows co-owner and transfer actions to an eligible owner", () => {
    const html = renderToStaticMarkup(createElement(ClubMembers, {
      clubSlug: "club-one",
      initialMembers: ownershipMembers,
      currentUserId: "user-owner",
      canManageRoles: true,
      canManageOwnership: true,
    }));

    expect(html).toContain("Primary owner");
    expect(html).toContain("Make co-owner");
    expect(html).toContain("Transfer ownership");
    expect(html).toContain("1 owner");
  });

  it("hides ownership actions when the viewer lacks the transfer entitlement", () => {
    const html = renderToStaticMarkup(createElement(ClubMembers, {
      clubSlug: "club-one",
      initialMembers: ownershipMembers,
      currentUserId: "user-owner",
      canManageRoles: true,
      canManageOwnership: false,
    }));

    expect(html).not.toContain("Make co-owner");
    expect(html).not.toContain("Transfer ownership");
    expect(html).toContain("Make admin");
  });
});

describe("club member removal controls", () => {
  it("renders removal only for server-authorized relationships", () => {
    const markup = renderToStaticMarkup(createElement(ClubMembers, {
      clubSlug: "club-one",
      currentUserId: "admin-1",
      canManageRoles: false,
      canManageOwnership: false,
      initialMembers: [
        member({ id: "admin-1", displayName: "Current Admin", role: "admin" }),
        member({ canRemove: true }),
        member({ id: "admin-2", displayName: "Other Admin", role: "admin", canRemove: false }),
        member({ id: "owner-1", displayName: "Owner", role: "owner", canRemove: false }),
      ],
    }));

    expect(markup.match(/Remove member/g)).toHaveLength(1);
    expect(markup).toContain("Remove Member One from the club");
  });

  it("names active-turn reassignment and playlist detachment in confirmation copy", () => {
    expect(memberRemovalDescription(member({
      displayName: "Maya",
      ownsActiveTurn: true,
      activeTurnHasPlaylist: true,
    }))).toBe(
      "Maya will lose access. Their active drop will move to the next eligible member and its attached playlist will be removed.",
    );
  });
});
