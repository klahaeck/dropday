import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Club, ClubMembership, DropSlot } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  getClubById: vi.fn(),
  getClubMemberships: vi.fn(),
  getDropById: vi.fn(),
}));

vi.mock("@/lib/repository", () => ({
  getClubById: mocks.getClubById,
  getClubMemberships: mocks.getClubMemberships,
  getDropById: mocks.getDropById,
}));

import { authorizeChatThread, ChatAccessError } from "@/lib/chat-access";

const timestamp = "2026-09-17T18:00:00.000Z";

const club = {
  id: "club-1",
  slug: "club-one",
  custody: { status: "active", activeOwnerId: "user-1", recoveryClaimantId: null },
} as Club;

const membership = {
  id: "membership-1",
  clubId: club.id,
  userId: "user-1",
  status: "active",
} as ClubMembership;

const visibleDrop = {
  id: "drop-1",
  clubId: club.id,
  assignedUserId: "user-1",
  scheduledFor: "2026-09-18T18:00:00.000Z",
} as DropSlot;

describe("chat thread authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClubById.mockResolvedValue(club);
    mocks.getClubMemberships.mockResolvedValue([membership]);
    mocks.getDropById.mockResolvedValue(visibleDrop);
  });

  it("authorizes an active member for a club thread", async () => {
    await expect(authorizeChatThread({
      threadType: "club",
      threadId: club.id,
      viewerUserId: "user-1",
      clubChatEnabled: true,
      timestamp,
    })).resolves.toMatchObject({ club, drop: null, memberships: [membership] });
  });

  it("enforces chat feature access before loading a thread", async () => {
    await expect(authorizeChatThread({
      threadType: "club",
      threadId: club.id,
      viewerUserId: "user-1",
      clubChatEnabled: false,
      timestamp,
    })).rejects.toMatchObject({ status: 403 } satisfies Partial<ChatAccessError>);
    expect(mocks.getClubById).not.toHaveBeenCalled();
  });

  it("authorizes an assigned member for a drop thread", async () => {
    await expect(authorizeChatThread({
      threadType: "drop",
      threadId: visibleDrop.id,
      viewerUserId: "user-1",
      clubChatEnabled: true,
      timestamp,
    })).resolves.toMatchObject({ club, drop: visibleDrop });
  });

  it("rejects a nonmember", async () => {
    mocks.getClubMemberships.mockResolvedValue([]);

    await expect(authorizeChatThread({
      threadType: "club",
      threadId: club.id,
      viewerUserId: "user-2",
      clubChatEnabled: true,
      timestamp,
    })).rejects.toMatchObject({ status: 403 } satisfies Partial<ChatAccessError>);
  });

  it("hides a drop before its scheduled time from another member", async () => {
    mocks.getClubMemberships.mockResolvedValue([
      { ...membership, id: "membership-2", userId: "user-2" },
    ]);

    await expect(authorizeChatThread({
      threadType: "drop",
      threadId: visibleDrop.id,
      viewerUserId: "user-2",
      clubChatEnabled: true,
      timestamp,
    })).rejects.toMatchObject({ status: 404 } satisfies Partial<ChatAccessError>);
  });

  it("does not authorize chat for an archived club", async () => {
    mocks.getClubById.mockResolvedValue({
      ...club,
      custody: { ...club.custody, status: "archived" },
    });

    await expect(authorizeChatThread({
      threadType: "club",
      threadId: club.id,
      viewerUserId: "user-1",
      clubChatEnabled: true,
      timestamp,
    })).rejects.toMatchObject({ status: 404 } satisfies Partial<ChatAccessError>);
  });
});
