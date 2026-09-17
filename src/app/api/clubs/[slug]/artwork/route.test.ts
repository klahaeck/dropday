import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Club, ClubMembership } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  requireViewer: vi.fn(),
  discardArtwork: vi.fn(),
  isOwnedArtworkUrl: vi.fn(() => true),
  getClubBySlug: vi.fn(),
  getClubMemberships: vi.fn(),
  createId: vi.fn(),
  getDb: vi.fn(),
  getMongoClient: vi.fn(),
  scheduleDropTasks: vi.fn(),
  integrations: { mongo: true },
}));

vi.mock("@/lib/auth", () => ({ requireViewer: mocks.requireViewer }));
vi.mock("@/lib/blob-artwork", () => ({ discardArtwork: mocks.discardArtwork, isOwnedArtworkUrl: mocks.isOwnedArtworkUrl }));
vi.mock("@/lib/repository", () => ({
  getClubBySlug: mocks.getClubBySlug,
  getClubMemberships: mocks.getClubMemberships,
  createId: mocks.createId,
}));
vi.mock("@/lib/db", () => ({ getDb: mocks.getDb, getMongoClient: mocks.getMongoClient }));
vi.mock("@/lib/env", () => ({ integrations: mocks.integrations }));
vi.mock("@/lib/scheduler", () => ({ scheduleDropTasks: mocks.scheduleDropTasks }));

import { PATCH } from "@/app/api/clubs/[slug]/artwork/route";

const timestamp = "2026-09-17T12:00:00.000Z";
const club: Club = {
  id: "club-1",
  slug: "needle-exchange",
  name: "Needle Exchange",
  description: "A thoughtful listening club.",
  visibility: "private",
  accent: "#ff5c35",
  memberCount: 2,
  rotationMemberIds: ["user-1", "user-2"],
  currentTheme: { name: "Deep cuts", version: 2, updatedAt: timestamp },
  schedule: {
    timezone: "America/Chicago",
    startsOn: "2026-09-20",
    localTime: "19:30",
    frequency: "weekly",
    interval: 1,
    weekdays: [7],
    rrule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=SU",
    reminderOffsetsMinutes: [1440, 60],
    version: 2,
    paused: false,
  },
  custody: { status: "active", activeOwnerId: "user-1", recoveryClaimantId: null },
  createdAt: timestamp,
  updatedAt: timestamp,
};
const membership: ClubMembership = {
  id: "membership-1",
  clubId: club.id,
  userId: "user-1",
  role: "owner",
  status: "active",
  queuePaused: false,
  joinedAt: timestamp,
  updatedAt: timestamp,
};
const validBody = {
  name: club.name,
  description: club.description,
  descriptionHtml: `<p>${club.description}</p>`,
  accent: club.accent,
  startsOn: club.schedule.startsOn,
  localTime: club.schedule.localTime,
  timezone: club.schedule.timezone,
  frequency: club.schedule.frequency,
  interval: club.schedule.interval,
};

function update(body: Record<string, unknown>) {
  return PATCH(new Request("http://localhost/api/clubs/needle-exchange/artwork", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ slug: club.slug }) });
}

describe("club settings route", () => {
  const updateOne = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    club.visibility = "private";
    mocks.integrations.mongo = true;
    mocks.requireViewer.mockResolvedValue({
      profile: { id: "user-1" },
      features: { clubAdminTools: true, customSchedules: true },
    });
    mocks.getClubBySlug.mockResolvedValue(club);
    mocks.getClubMemberships.mockResolvedValue([membership]);
    updateOne.mockResolvedValue({ matchedCount: 1 });
    mocks.getDb.mockResolvedValue({ collection: vi.fn(() => ({ updateOne })) });
    mocks.getMongoClient.mockResolvedValue({
      withSession: async (work: (session: { withTransaction: (transaction: () => Promise<void>) => Promise<void> }) => Promise<void>) => work({
        withTransaction: async (transaction) => transaction(),
      }),
    });
  });

  it.each(["public", "private"] as const)("persists %s visibility without replacing unrelated club fields", async (visibility) => {
    const response = await update({ ...validBody, visibility });
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.visibility).toBe(visibility);
    const updateDocument = updateOne.mock.calls[0][1];
    expect(updateDocument.$set).toMatchObject({ visibility, name: club.name, accent: club.accent });
    expect(updateDocument.$set).not.toHaveProperty("schedule");
    expect(updateDocument.$unset ?? {}).not.toHaveProperty("currentTheme");
  });

  it("rejects invalid visibility values", async () => {
    const invalidVisibility = await update({ ...validBody, visibility: "secret" });

    expect(invalidVisibility.status).toBe(400);
    expect(updateOne).not.toHaveBeenCalled();
  });

  it("persists demo visibility on the in-memory club", async () => {
    mocks.integrations.mongo = false;

    const response = await update({ ...validBody, visibility: "public" });

    expect(response.status).toBe(200);
    expect(club.visibility).toBe("public");
  });
});
