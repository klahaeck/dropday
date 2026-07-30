import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClubMembers } from "@/components/club-members";

const members = [
  {
    id: "user-owner",
    displayName: "Primary Owner",
    initials: "PO",
    role: "owner" as const,
    isPrimaryOwner: true,
  },
  {
    id: "user-member",
    displayName: "Club Member",
    initials: "CM",
    role: "member" as const,
  },
];

describe("club ownership controls", () => {
  it("shows co-owner and transfer actions to an eligible owner", () => {
    const html = renderToStaticMarkup(createElement(ClubMembers, {
      clubSlug: "club-one",
      initialMembers: members,
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
      initialMembers: members,
      currentUserId: "user-owner",
      canManageRoles: true,
      canManageOwnership: false,
    }));

    expect(html).not.toContain("Make co-owner");
    expect(html).not.toContain("Transfer ownership");
    expect(html).toContain("Make admin");
  });
});
