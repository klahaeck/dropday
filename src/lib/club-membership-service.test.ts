import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Club, ClubMembership, DropSlot } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  integrations: { mongo: false },
  getDb: vi.fn(),
  getMongoClient: vi.fn(),
  deliverBrowserNotification: vi.fn(),
  createId: vi.fn((prefix: string) => `${prefix}-test`),
}));

vi.mock("@/lib/env", () => ({ integrations: mocks.integrations }));
vi.mock("@/lib/db", () => ({
  getDb: mocks.getDb,
  getMongoClient: mocks.getMongoClient,
}));
vi.mock("@/lib/browser-push", () => ({
  deliverBrowserNotification: mocks.deliverBrowserNotification,
}));
vi.mock("@/lib/repository", () => ({ createId: mocks.createId }));

import {
  ClubMembershipTransitionError,
  planClubMembershipTransition,
  transitionClubMembership,
} from "@/lib/club-membership-service";

const timestamp = "2026-09-17T18:00:00.000Z";

function club(overrides: Partial<Club> = {}): Club {
  return {
    id: "club-1",
    slug: "club-one",
    name: "Club One",
    description: "A club",
    visibility: "private",
    accent: "#000000",
    memberCount: 3,
    rotationMemberIds: ["owner", "target", "replacement"],
    schedule: {
      timezone: "America/Chicago",
      startsOn: "2026-09-17",
      localTime: "18:00",
      frequency: "weekly",
      interval: 1,
      rrule: "FREQ=WEEKLY;INTERVAL=1",
      reminderOffsetsMinutes: [],
      version: 1,
      paused: false,
    },
    activeDropId: "drop-1",
    custody: {
      status: "active",
      activeOwnerId: "owner",
      recoveryClaimantId: null,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function membership(
  userId: string,
  role: ClubMembership["role"] = "member",
  overrides: Partial<ClubMembership> = {},
): ClubMembership {
  return {
    id: `membership-${userId}`,
    clubId: "club-1",
    userId,
    role,
    status: "active",
    queuePaused: false,
    joinedAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function drop(overrides: Partial<DropSlot> = {}): DropSlot {
  return {
    id: "drop-1",
    clubId: "club-1",
    occurrenceKey: "club-1:2026-09-24:v1",
    scheduleVersion: 1,
    status: "scheduled",
    assignedUserId: "target",
    scheduledFor: "2026-09-24T23:00:00.000Z",
    playlist: {
      sourceDraftId: "draft-1",
      provider: "spotify",
      providerPlaylistId: "playlist-1",
      canonicalUrl: "https://open.spotify.com/playlist/playlist-1",
      embedUrl: "https://open.spotify.com/embed/playlist/playlist-1",
      title: "Attached",
      description: "Attached playlist",
      metadata: {},
    },
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function plan({
  kind = "leave",
  target = membership("target"),
  actor = target,
  members = [membership("owner", "owner"), target, membership("replacement")],
  currentClub = club(),
  activeDrop = drop(),
  actorUserId = actor.userId,
  targetUserId = target.userId,
  hasClubAdminTools = true,
}: {
  kind?: "leave" | "remove";
  target?: ClubMembership;
  actor?: ClubMembership;
  members?: ClubMembership[];
  currentClub?: Club;
  activeDrop?: DropSlot | null;
  actorUserId?: string;
  targetUserId?: string;
  hasClubAdminTools?: boolean;
} = {}) {
  return planClubMembershipTransition({
    club: currentClub,
    memberships: members,
    actorMembership: actor,
    targetMembership: target,
    activeDrop,
    kind,
    actorUserId,
    targetUserId,
    hasClubAdminTools,
    timestamp,
    auditId: "audit-1",
    notificationId: "notification-1",
  });
}

describe("club membership transition planning", () => {
  it.each([
    ["member", "member"],
    ["admin", "admin"],
    ["non-primary co-owner", "owner"],
  ] as const)("lets a %s leave", (_label, role) => {
    const target = membership("target", role);
    const result = plan({ target, actor: target });

    expect(result.membership.status).toBe("left");
    expect(result.club).toMatchObject({
      memberCount: 2,
      rotationMemberIds: ["owner", "replacement"],
    });
    expect(result.outcome.redirectRequired).toBe(true);
  });

  it("requires the primary owner to transfer ownership before leaving", () => {
    const owner = membership("owner", "owner");

    expect(() => plan({
      target: owner,
      actor: owner,
      members: [owner, membership("target"), membership("replacement")],
      actorUserId: "owner",
      targetUserId: "owner",
    })).toThrow(expect.objectContaining({ status: 409 }));
  });

  it("enforces the admin and owner removal hierarchy", () => {
    const admin = membership("admin", "admin");
    const owner = membership("owner", "owner");
    const targetMember = membership("target", "member");
    const targetAdmin = membership("target", "admin");
    const members = [owner, admin, targetMember, membership("replacement")];

    expect(plan({ kind: "remove", actor: admin, target: targetMember, members, actorUserId: "admin" }).membership.status).toBe("removed");
    expect(() => plan({ kind: "remove", actor: admin, target: targetAdmin, members: [owner, admin, targetAdmin], actorUserId: "admin" })).toThrow(expect.objectContaining({ status: 403 }));
    expect(plan({ kind: "remove", actor: owner, target: targetAdmin, members: [owner, targetAdmin, membership("replacement")], actorUserId: "owner" }).membership.status).toBe("removed");
    expect(() => plan({ kind: "remove", actor: owner, target: membership("target", "owner"), actorUserId: "owner" })).toThrow(expect.objectContaining({ status: 409 }));
    expect(() => plan({ kind: "remove", actor: admin, target: admin, actorUserId: "admin", targetUserId: "admin" })).toThrow(expect.objectContaining({ status: 409 }));
  });

  it.each(["scheduled", "overdue"] as const)(
    "reassigns a %s active drop without changing its identity or timing",
    (status) => {
      const currentDrop = drop({ status });
      const result = plan({ activeDrop: currentDrop });

      expect(result.drop).toMatchObject({
        id: currentDrop.id,
        occurrenceKey: currentDrop.occurrenceKey,
        scheduleVersion: currentDrop.scheduleVersion,
        scheduledFor: currentDrop.scheduledFor,
        status,
        assignedUserId: "replacement",
      });
      expect(result.drop).not.toHaveProperty("playlist");
      expect(result.outcome).toMatchObject({
        reassignedMemberId: "replacement",
        playlistDetached: true,
      });
    },
  );

  it("rejects an active-turn exit when no eligible replacement exists", () => {
    const replacement = membership("replacement", "member", { queuePaused: true });

    expect(() => plan({
      members: [membership("owner", "owner", { queuePaused: true }), membership("target"), replacement],
    })).toThrow(expect.objectContaining({ status: 409 }));
  });

  it("wraps circularly to the next eligible member after the departing turn owner", () => {
    const replacement = membership("replacement", "member", { queuePaused: true });
    const result = plan({
      members: [membership("owner", "owner"), membership("target"), replacement],
    });

    expect(result.outcome.reassignedMemberId).toBe("owner");
  });

  it("fails closed when the club's active drop cannot be loaded", () => {
    expect(() => plan({ activeDrop: null })).toThrow(
      expect.objectContaining({ status: 409 }),
    );
  });

  it("is idempotent when the same leave transition is retried", () => {
    const target = membership("target", "member", { status: "left" });
    const currentClub = club({
      memberCount: 2,
      rotationMemberIds: ["owner", "replacement"],
      activeDropId: undefined,
    });
    const result = plan({
      target,
      actor: target,
      members: [membership("owner", "owner"), target, membership("replacement")],
      currentClub,
      activeDrop: null,
    });

    expect(result.changed).toBe(false);
    expect(result.outcome).toMatchObject({ changed: false, memberCount: 2 });
  });
});

describe("club membership Mongo execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.integrations.mongo = false;
  });

  it("aborts before audit, notification, and push when active-drop CAS fails", async () => {
    mocks.integrations.mongo = true;
    const owner = membership("owner", "owner");
    const target = membership("target");
    const replacement = membership("replacement");
    const currentClub = club();
    const currentDrop = drop();
    const auditInsert = vi.fn();
    const notificationInsert = vi.fn();
    const collections: Record<string, unknown> = {
      clubs: {
        findOne: vi.fn().mockResolvedValue(currentClub),
        updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
      },
      memberships: {
        find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([owner, target, replacement]) })),
        updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
      },
      drops: {
        findOne: vi.fn().mockResolvedValue(currentDrop),
        updateOne: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
      },
      auditEvents: { insertOne: auditInsert },
      notifications: { insertOne: notificationInsert },
    };
    mocks.getDb.mockResolvedValue({
      collection: vi.fn((name: string) => collections[name]),
    });
    mocks.getMongoClient.mockResolvedValue({
      withSession: async (
        work: (session: { withTransaction: (transaction: () => Promise<void>) => Promise<void> }) => Promise<void>,
      ) => work({ withTransaction: async (transaction) => transaction() }),
    });

    await expect(transitionClubMembership({
      clubSlug: "club-one",
      targetUserId: "target",
      actorUserId: "target",
      kind: "leave",
      hasClubAdminTools: true,
    })).rejects.toMatchObject({ status: 409 } satisfies Partial<ClubMembershipTransitionError>);
    expect(auditInsert).not.toHaveBeenCalled();
    expect(notificationInsert).not.toHaveBeenCalled();
    expect(mocks.deliverBrowserNotification).not.toHaveBeenCalled();
  });
});
