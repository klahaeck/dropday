import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClubMembership } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  requireViewer: vi.fn(),
  getClubBySlug: vi.fn(),
  getClubMemberships: vi.fn(),
  getUserProfile: vi.fn(),
  countOwnedClubs: vi.fn(),
  createId: vi.fn(() => "notification-promotion"),
  deliverBrowserNotification: vi.fn(),
  demoNotifications: [] as Array<Record<string, unknown>>,
  integrations: { mongo: false },
  getDb: vi.fn(),
  getMongoClient: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireViewer: mocks.requireViewer,
}));

vi.mock("@/lib/env", () => ({
  integrations: mocks.integrations,
}));

vi.mock("@/lib/db", () => ({
  getDb: mocks.getDb,
  getMongoClient: mocks.getMongoClient,
}));

vi.mock("@/lib/browser-push", () => ({
  deliverBrowserNotification: mocks.deliverBrowserNotification,
}));

vi.mock("@/lib/demo-data", () => ({
  demoNotifications: mocks.demoNotifications,
}));

vi.mock("@/lib/repository", () => ({
  countOwnedClubs: mocks.countOwnedClubs,
  createId: mocks.createId,
  getClubBySlug: mocks.getClubBySlug,
  getClubMemberships: mocks.getClubMemberships,
  getUserProfile: mocks.getUserProfile,
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

function request(role: string, transferOwnership = false) {
  return new Request("http://localhost/api/clubs/club-one/members/user-member/role", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, transferOwnership }),
  });
}

function update(
  role: string,
  memberId = "user-member",
  transferOwnership = false,
) {
  return PATCH(request(role, transferOwnership), {
    params: Promise.resolve({ slug: "club-one", memberId }),
  });
}

describe("club member role route", () => {
  let memberships: ClubMembership[];

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.integrations.mongo = false;
    mocks.demoNotifications.length = 0;
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
      features: { clubAdminTools: true, ownershipTransfer: true },
    });
    mocks.getUserProfile.mockResolvedValue({
      id: "user-member",
      plan: "entry",
    });
    mocks.countOwnedClubs.mockResolvedValue(0);
    mocks.getClubBySlug.mockResolvedValue({
      id: "club-1",
      name: "Club One",
      slug: "club-one",
      custody: { status: "active", activeOwnerId: "user-owner" },
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
    expect(mocks.demoNotifications).toEqual([
      expect.objectContaining({
        id: "notification-promotion",
        userId: "user-member",
        kind: "membership",
        title: "You’re now an admin of Club One",
        href: "/app/clubs/club-one/settings",
      }),
    ]);
  });

  it("lets the owner remove an admin role", async () => {
    const response = await update("member", "user-admin");

    expect(response.status).toBe(200);
    expect(memberships.find((item) => item.userId === "user-admin")?.role).toBe("member");
    expect(mocks.demoNotifications).toHaveLength(0);
  });

  it("does not send another notification when the member is already an admin", async () => {
    const response = await update("admin", "user-admin");

    expect(response.status).toBe(200);
    expect(memberships.find((item) => item.userId === "user-admin")?.role).toBe("admin");
    expect(mocks.demoNotifications).toHaveLength(0);
  });

  it("persists the promotion notification before browser delivery", async () => {
    mocks.integrations.mongo = true;
    const events: string[] = [];
    const notificationInsert = vi.fn(async () => {
      events.push("persist");
    });
    const collections: Record<string, unknown> = {
      clubs: {
        findOne: vi.fn().mockResolvedValue({
          id: "club-1",
          name: "Club One",
          slug: "club-one",
          custody: { status: "active", activeOwnerId: "user-owner" },
        }),
        updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 }),
      },
      memberships: {
        find: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue(memberships),
        })),
        updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 }),
      },
      notifications: {
        insertOne: notificationInsert,
      },
    };
    mocks.getDb.mockResolvedValue({
      collection: vi.fn((name: string) => collections[name]),
    });
    mocks.getMongoClient.mockResolvedValue({
      withSession: async (
        work: (session: {
          withTransaction: (transaction: () => Promise<void>) => Promise<void>;
        }) => Promise<void>,
      ) => work({
        withTransaction: async (transaction) => transaction(),
      }),
    });
    mocks.deliverBrowserNotification.mockImplementation(async () => {
      events.push("deliver");
    });

    const response = await update("admin");

    expect(response.status).toBe(200);
    expect(notificationInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "notification-promotion",
        userId: "user-member",
        kind: "membership",
      }),
      expect.objectContaining({ session: expect.any(Object) }),
    );
    expect(mocks.deliverBrowserNotification).toHaveBeenCalledWith(
      expect.objectContaining({ id: "notification-promotion" }),
    );
    expect(events).toEqual(["persist", "deliver"]);
  });

  it("transfers ownership atomically in Mongo with an audit event and notification", async () => {
    mocks.integrations.mongo = true;
    const events: string[] = [];
    const membershipUpdate = vi.fn().mockResolvedValue({ matchedCount: 1 });
    const auditInsert = vi.fn(async () => {
      events.push("audit");
    });
    const notificationInsert = vi.fn(async () => {
      events.push("persist");
    });
    const collections: Record<string, unknown> = {
      clubs: {
        findOne: vi.fn().mockResolvedValue({
          id: "club-1",
          name: "Club One",
          slug: "club-one",
          custody: { status: "active", activeOwnerId: "user-owner" },
        }),
        countDocuments: vi.fn().mockResolvedValue(0),
        updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 }),
      },
      memberships: {
        find: vi.fn((query: Record<string, unknown>) => ({
          toArray: vi.fn().mockResolvedValue(
            query.role === "owner" ? [] : memberships,
          ),
        })),
        updateOne: membershipUpdate,
      },
      users: {
        findOne: vi.fn().mockResolvedValue({
          id: "user-member",
          plan: "entry",
        }),
      },
      auditEvents: {
        insertOne: auditInsert,
      },
      notifications: {
        insertOne: notificationInsert,
      },
    };
    mocks.getDb.mockResolvedValue({
      collection: vi.fn((name: string) => collections[name]),
    });
    mocks.getMongoClient.mockResolvedValue({
      withSession: async (
        work: (session: {
          withTransaction: (transaction: () => Promise<void>) => Promise<void>;
        }) => Promise<void>,
      ) => work({
        withTransaction: async (transaction) => transaction(),
      }),
    });
    mocks.deliverBrowserNotification.mockImplementation(async () => {
      events.push("deliver");
    });

    const response = await update("owner", "user-member", true);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      memberId: "user-member",
      role: "owner",
      actorRole: "admin",
    });
    expect(membershipUpdate).toHaveBeenCalledTimes(2);
    expect(membershipUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-member",
        role: "member",
      }),
      expect.objectContaining({
        $set: expect.objectContaining({ role: "owner" }),
      }),
      expect.objectContaining({ session: expect.any(Object) }),
    );
    expect(membershipUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-owner",
        role: "owner",
      }),
      expect.objectContaining({
        $set: expect.objectContaining({ role: "admin" }),
      }),
      expect.objectContaining({ session: expect.any(Object) }),
    );
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ownership.transferred",
        metadata: {
          fromUserId: "user-owner",
          toUserId: "user-member",
        },
      }),
      expect.objectContaining({ session: expect.any(Object) }),
    );
    expect(notificationInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-member",
        title: "Ownership of Club One was transferred to you",
      }),
      expect.objectContaining({ session: expect.any(Object) }),
    );
    expect(events).toEqual(["audit", "persist", "deliver"]);
  });

  it("does not let an admin grant admin access", async () => {
    mocks.requireViewer.mockResolvedValue({
      profile: { id: "user-admin" },
      features: { clubAdminTools: true, ownershipTransfer: false },
    });

    const response = await update("admin");

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Only a club owner can change member roles.",
    });
  });

  it("promotes an eligible member to co-owner without replacing the primary owner", async () => {
    const club = await mocks.getClubBySlug();
    const response = await update("owner");

    expect(response.status).toBe(200);
    expect(memberships.find((item) => item.userId === "user-member")?.role).toBe("owner");
    expect(club.custody.activeOwnerId).toBe("user-owner");
    expect(mocks.demoNotifications).toEqual([
      expect.objectContaining({
        userId: "user-member",
        title: "You’re now a co-owner of Club One",
      }),
    ]);
  });

  it("lets a co-owner manage member roles even when they are not the primary custodian", async () => {
    memberships.find((item) => item.userId === "user-admin")!.role = "owner";
    mocks.requireViewer.mockResolvedValue({
      profile: { id: "user-admin" },
      features: { clubAdminTools: true, ownershipTransfer: true },
    });

    const response = await update("admin");

    expect(response.status).toBe(200);
    expect(memberships.find((item) => item.userId === "user-member")?.role).toBe("admin");
  });

  it("blocks co-ownership when the member has no ownership capacity", async () => {
    mocks.getUserProfile.mockResolvedValue({
      id: "user-member",
      plan: "free",
    });

    const response = await update("owner");

    expect(response.status).toBe(409);
    expect(memberships.find((item) => item.userId === "user-member")?.role).toBe("member");
    expect(mocks.demoNotifications).toHaveLength(0);
  });

  it("transfers ownership, keeps the former owner as admin, and notifies the new owner", async () => {
    const club = await mocks.getClubBySlug();
    mocks.getClubBySlug.mockResolvedValue(club);

    const response = await update("owner", "user-member", true);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      memberId: "user-member",
      role: "owner",
      actorRole: "admin",
    });
    expect(memberships.find((item) => item.userId === "user-owner")?.role).toBe("admin");
    expect(memberships.find((item) => item.userId === "user-member")?.role).toBe("owner");
    expect(club.custody.activeOwnerId).toBe("user-member");
    expect(mocks.demoNotifications).toEqual([
      expect.objectContaining({
        userId: "user-member",
        title: "Ownership of Club One was transferred to you",
      }),
    ]);
  });

  it("enforces the club administration entitlement", async () => {
    mocks.requireViewer.mockResolvedValue({
      profile: { id: "user-owner" },
      features: { clubAdminTools: false, ownershipTransfer: true },
    });

    const response = await update("admin");

    expect(response.status).toBe(403);
    expect(memberships.find((item) => item.userId === "user-member")?.role).toBe("member");
  });
});
