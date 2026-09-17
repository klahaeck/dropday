import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Club, ClubMembership, DropSlot } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  requireViewer: vi.fn(),
  getClubBySlug: vi.fn(),
  getClubMemberships: vi.fn(),
  getDropById: vi.fn(),
  getUserProfile: vi.fn(),
  createId: vi.fn(() => "drop-new"),
  getDb: vi.fn(),
  getMongoClient: vi.fn(),
  enqueueDropScheduleOutbox: vi.fn(),
  getDropScheduleDispatchState: vi.fn(),
  requeueOutboxEvent: vi.fn(),
  dispatchOutbox: vi.fn(),
  integrations: { mongo: true },
  demoDrops: [] as DropSlot[],
}));

vi.mock("@/lib/auth", () => ({ requireViewer: mocks.requireViewer }));
vi.mock("@/lib/repository", () => ({
  getClubBySlug: mocks.getClubBySlug,
  getClubMemberships: mocks.getClubMemberships,
  getDropById: mocks.getDropById,
  getUserProfile: mocks.getUserProfile,
  createId: mocks.createId,
}));
vi.mock("@/lib/db", () => ({ getDb: mocks.getDb, getMongoClient: mocks.getMongoClient }));
vi.mock("@/lib/env", () => ({ integrations: mocks.integrations }));
vi.mock("@/lib/demo-data", () => ({ demoDrops: mocks.demoDrops }));
vi.mock("@/lib/outbox", () => ({
  enqueueDropScheduleOutbox: mocks.enqueueDropScheduleOutbox,
  getDropScheduleDispatchState: mocks.getDropScheduleDispatchState,
  requeueOutboxEvent: mocks.requeueOutboxEvent,
}));
vi.mock("@/lib/scheduler", () => ({ dispatchOutbox: mocks.dispatchOutbox }));

import { GET, PATCH, POST, PUT } from "@/app/api/clubs/[slug]/schedule/route";

const timestamp = "2026-09-17T12:00:00.000Z";
const baseClub: Club = {
  id: "club-1",
  slug: "needle-exchange",
  name: "Needle Exchange",
  description: "A thoughtful listening club.",
  visibility: "private",
  accent: "#ff5c35",
  memberCount: 2,
  rotationMemberIds: ["user-1", "user-2"],
  schedule: {
    timezone: "America/Chicago",
    startsOn: "2026-09-20",
    localTime: "19:30",
    frequency: "weekly",
    interval: 1,
    weekdays: [7],
    rrule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=SU",
    reminderOffsetsMinutes: [1440, 60],
    version: 3,
    paused: false,
  },
  activeDropId: "drop-1",
  custody: { status: "active", activeOwnerId: "user-1", recoveryClaimantId: null },
  createdAt: timestamp,
  updatedAt: timestamp,
};
const baseDrop: DropSlot = {
  id: "drop-1",
  clubId: baseClub.id,
  occurrenceKey: "club-1:old:v3",
  scheduleVersion: 3,
  status: "scheduled",
  assignedUserId: "user-1",
  scheduledFor: "2026-09-20T00:30:00.000Z",
  triggerRunIds: ["old-run"],
  createdAt: timestamp,
  updatedAt: timestamp,
};
const membership: ClubMembership = {
  id: "membership-1",
  clubId: baseClub.id,
  userId: "user-1",
  role: "owner",
  status: "active",
  queuePaused: false,
  joinedAt: timestamp,
  updatedAt: timestamp,
};

function scheduleBody(overrides: Record<string, unknown> = {}) {
  return {
    startsOn: baseClub.schedule.startsOn,
    localTime: "20:30",
    timezone: baseClub.schedule.timezone,
    frequency: baseClub.schedule.frequency,
    interval: baseClub.schedule.interval,
    reminderOffsetsMinutes: baseClub.schedule.reminderOffsetsMinutes,
    ...overrides,
  };
}

function request(method: "POST" | "PATCH", body: Record<string, unknown>) {
  return new Request("http://localhost/api/clubs/needle-exchange/schedule", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function route(method: "POST" | "PATCH", body: Record<string, unknown>) {
  const context = { params: Promise.resolve({ slug: baseClub.slug }) };
  return method === "POST" ? POST(request(method, body), context) : PATCH(request(method, body), context);
}

function commitBody(preview: Record<string, unknown>, body = scheduleBody()) {
  return {
    ...body,
    confirmed: true,
    expectedScheduleVersion: preview.currentScheduleVersion,
    expectedActiveDropId: preview.expectedActiveDropId,
    expectedActiveDropStatus: preview.expectedActiveDropStatus,
    expectedActiveDropAssigneeId: preview.expectedActiveDropAssigneeId,
    expectedNewNextDropIso: preview.newNextDropIso,
  };
}

describe("club schedule preview and commit route", () => {
  let club: Club;
  let drop: DropSlot;
  const clubUpdate = vi.fn();
  const dropUpdate = vi.fn();
  const outboxFind = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.demoDrops.length = 0;
    mocks.integrations.mongo = true;
    club = structuredClone(baseClub);
    drop = structuredClone(baseDrop);
    mocks.requireViewer.mockResolvedValue({
      profile: { id: "user-1" },
      features: { clubAdminTools: true, customSchedules: true },
    });
    mocks.getClubBySlug.mockImplementation(async () => club);
    mocks.getClubMemberships.mockResolvedValue([membership]);
    mocks.getDropById.mockImplementation(async () => drop);
    mocks.getUserProfile.mockResolvedValue({ displayName: "Alex Listener" });
    mocks.enqueueDropScheduleOutbox.mockResolvedValue({ id: "schedule-outbox-1", idempotencyKey: "drop-schedule:drop-1" });
    mocks.getDropScheduleDispatchState.mockResolvedValue({ status: "delivered", attempts: 1, retryable: false });
    mocks.requeueOutboxEvent.mockImplementation(async (_db, outboxId) => ({
      id: outboxId,
      idempotencyKey: "drop-schedule:drop-1",
      status: "pending",
      attempts: 2,
    }));
    mocks.dispatchOutbox.mockResolvedValue(undefined);
    outboxFind.mockResolvedValue(null);
    clubUpdate.mockResolvedValue({ matchedCount: 1 });
    dropUpdate.mockResolvedValue({ matchedCount: 1 });
    const collections: Record<string, unknown> = {
      clubs: { findOne: vi.fn(async () => structuredClone(club)), updateOne: clubUpdate },
      drops: {
        findOne: vi.fn(async () => structuredClone(drop)),
        updateOne: dropUpdate,
        insertOne: vi.fn().mockResolvedValue({ insertedId: "drop-new" }),
      },
      outbox: { findOne: outboxFind },
    };
    mocks.getDb.mockResolvedValue({ collection: vi.fn((name: string) => collections[name]) });
    mocks.getMongoClient.mockResolvedValue({
      withSession: async (work: (session: { withTransaction: (transaction: () => Promise<void>) => Promise<void> }) => Promise<void>) => work({
        withTransaction: async (transaction) => transaction(),
      }),
    });
  });

  it("previews effects and stale-state tokens without writing", async () => {
    const response = await route("POST", scheduleBody());
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      changed: true,
      activeDropEffect: "moved",
      expectedScheduleVersion: 3,
      currentScheduleVersion: 3,
      expectedActiveDropId: "drop-1",
      expectedActiveDropStatus: "scheduled",
      expectedActiveDropAssigneeId: "user-1",
      assigneeName: "Alex Listener",
    });
    expect(result.expectedNewNextDropIso).toBe(result.newNextDropIso);
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(clubUpdate).not.toHaveBeenCalled();
    expect(dropUpdate).not.toHaveBeenCalled();
  });

  it("exposes failed scheduling state to club administrators", async () => {
    mocks.getDropScheduleDispatchState.mockResolvedValue({ status: "failed", attempts: 2, retryable: true });

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ slug: baseClub.slug }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "failed", attempts: 2, retryable: true });
  });

  it("requeues failed scheduling work with the same outbox identity", async () => {
    outboxFind.mockResolvedValue({
      id: "schedule-outbox-1",
      idempotencyKey: `drop-schedule:${drop.occurrenceKey}`,
      status: "failed",
      attempts: 1,
    });

    const response = await PUT(new Request("http://localhost", { method: "PUT" }), {
      params: Promise.resolve({ slug: baseClub.slug }),
    });

    expect(response.status).toBe(200);
    expect(mocks.requeueOutboxEvent).toHaveBeenCalledWith(expect.anything(), "schedule-outbox-1");
    expect(mocks.dispatchOutbox).toHaveBeenCalledWith("schedule-outbox-1", "drop-schedule:drop-1");
    await expect(response.json()).resolves.toMatchObject({ status: "pending", retryable: true });
  });

  it("rejects stale reviewed status before any write", async () => {
    const preview = await (await route("POST", scheduleBody())).json();
    drop.status = "overdue";

    const response = await route("PATCH", commitBody(preview));

    expect(response.status).toBe(409);
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(clubUpdate).not.toHaveBeenCalled();
  });

  it("commits reminder-only changes and refreshes active-drop task state", async () => {
    const body = scheduleBody({ localTime: baseClub.schedule.localTime, reminderOffsetsMinutes: [10080, 60] });
    const preview = await (await route("POST", body)).json();
    const response = await route("PATCH", commitBody(preview, body));

    expect(response.status).toBe(200);
    expect(dropUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "drop-1", scheduleVersion: 3 }),
      expect.objectContaining({
        $set: expect.objectContaining({ scheduleVersion: 4, scheduledFor: baseDrop.scheduledFor }),
        $unset: { triggerRunIds: "" },
      }),
      expect.any(Object),
    );
    expect(mocks.enqueueDropScheduleOutbox).toHaveBeenCalledWith(
      expect.objectContaining({
        drop: expect.objectContaining({ id: "drop-1", scheduleVersion: 4 }),
        reminderOffsetsMinutes: [10080, 60],
      }),
    );
  });

  it("returns committed success with a durable scheduler warning", async () => {
    const preview = await (await route("POST", scheduleBody())).json();
    mocks.dispatchOutbox.mockRejectedValue(new Error("scheduler unavailable"));

    const response = await route("PATCH", commitBody(preview));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      warning: "The schedule was saved and its drop was queued for automatic scheduling.",
    });
    expect(clubUpdate).toHaveBeenCalledOnce();
  });

  it("reports transaction failures without scheduling tasks", async () => {
    const preview = await (await route("POST", scheduleBody())).json();
    clubUpdate.mockRejectedValue(new Error("transaction failed"));

    const response = await route("PATCH", commitBody(preview));

    expect(response.status).toBe(500);
    expect(mocks.enqueueDropScheduleOutbox).not.toHaveBeenCalled();
  });

  it("keeps demo preview read-only and mutates schedule/drop only after commit", async () => {
    mocks.integrations.mongo = false;
    const originalSchedule = structuredClone(club.schedule);
    const originalDrop = structuredClone(drop);
    const body = scheduleBody({ reminderOffsetsMinutes: [10080, 60] });

    const preview = await (await route("POST", body)).json();
    expect(club.schedule).toEqual(originalSchedule);
    expect(drop).toEqual(originalDrop);

    const response = await route("PATCH", commitBody(preview, body));

    expect(response.status).toBe(200);
    expect(club.schedule.version).toBe(4);
    expect(drop.scheduleVersion).toBe(4);
    expect(drop.status).toBe("scheduled");
    expect(drop.triggerRunIds).toBeUndefined();
  });

  it("rejects invalid timezones at the schedule boundary", async () => {
    const response = await route("POST", scheduleBody({ timezone: "Chicago-ish" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Choose a valid IANA timezone." });
  });
});
