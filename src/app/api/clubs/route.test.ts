import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireViewer: vi.fn(),
  countOwnedClubs: vi.fn(),
  createId: vi.fn(),
  getDb: vi.fn(),
  getMongoClient: vi.fn(),
  scheduleDropTasks: vi.fn(),
  discardArtwork: vi.fn(),
  isOwnedArtworkUrl: vi.fn(() => true),
  integrations: { mongo: true },
}));

vi.mock("@/lib/auth", () => ({ requireViewer: mocks.requireViewer }));
vi.mock("@/lib/db", () => ({ getDb: mocks.getDb, getMongoClient: mocks.getMongoClient }));
vi.mock("@/lib/env", () => ({ integrations: mocks.integrations }));
vi.mock("@/lib/repository", () => ({ countOwnedClubs: mocks.countOwnedClubs, createId: mocks.createId }));
vi.mock("@/lib/scheduler", () => ({ scheduleDropTasks: mocks.scheduleDropTasks }));
vi.mock("@/lib/blob-artwork", () => ({
  discardArtwork: mocks.discardArtwork,
  isOwnedArtworkUrl: mocks.isOwnedArtworkUrl,
}));

import { POST } from "@/app/api/clubs/route";

const validBody = {
  name: "Needle Exchange",
  description: "A thoughtful listening club.",
  descriptionHtml: "<p>A thoughtful listening club.</p>",
  accent: "#ff5c35",
  startsOn: "2026-09-20",
  localTime: "19:30",
  timezone: "America/Chicago",
  frequency: "weekly",
  interval: 1,
};

function request(body: Record<string, unknown> = validBody) {
  return new Request("http://localhost/api/clubs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("club creation route", () => {
  const insertedClubs: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    insertedClubs.length = 0;
    mocks.integrations.mongo = true;
    mocks.requireViewer.mockResolvedValue({
      profile: { id: "user-1", plan: "entry" },
      features: {
        ownOneClub: true,
        ownFiveClubs: false,
        ownUnlimitedClubs: false,
        customSchedules: true,
        clubAdminTools: true,
        clubThemes: true,
      },
    });
    mocks.countOwnedClubs.mockResolvedValue(0);
    mocks.createId
      .mockReturnValueOnce("club-1")
      .mockReturnValueOnce("drop-1")
      .mockReturnValueOnce("membership-1");
    mocks.scheduleDropTasks.mockResolvedValue(["run-1"]);

    const collections: Record<string, unknown> = {
      clubs: {
        findOne: vi.fn().mockResolvedValue(null),
        insertOne: vi.fn(async (club: Record<string, unknown>) => { insertedClubs.push(club); }),
      },
      memberships: { insertOne: vi.fn().mockResolvedValue({ insertedId: "membership-1" }) },
      drops: {
        insertOne: vi.fn().mockResolvedValue({ insertedId: "drop-1" }),
        updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 }),
      },
    };
    mocks.getDb.mockResolvedValue({ collection: vi.fn((name: string) => collections[name]) });
    mocks.getMongoClient.mockResolvedValue({
      withSession: async (work: (session: { withTransaction: (transaction: () => Promise<void>) => Promise<void> }) => Promise<void>) => work({
        withTransaction: async (transaction) => transaction(),
      }),
    });
  });

  it("defaults new clubs to private and schedules the first drop", async () => {
    const response = await POST(request());
    const result = await response.json();

    expect(response.status).toBe(201);
    expect(result.warning).toBeUndefined();
    expect(insertedClubs[0]).toMatchObject({ visibility: "private", slug: "needle-exchange" });
    expect(mocks.scheduleDropTasks).toHaveBeenCalledOnce();
  });

  it("accepts a valid fallback timezone", async () => {
    const response = await POST(request({ ...validBody, timezone: "UTC" }));

    expect(response.status).toBe(201);
    expect(insertedClubs[0]).toMatchObject({ schedule: { timezone: "UTC" } });
  });

  it("returns committed partial success when scheduler setup fails", async () => {
    mocks.scheduleDropTasks.mockRejectedValue(new Error("scheduler unavailable"));

    const response = await POST(request({ ...validBody, visibility: "public" }));
    await expect(response.json()).resolves.toMatchObject({
      slug: "needle-exchange",
      warning: "The club was created, but its first drop tasks still need to be scheduled.",
    });
    expect(response.status).toBe(201);
    expect(insertedClubs[0]).toMatchObject({ visibility: "public" });
  });

  it("rejects invalid timezone identifiers with a 400", async () => {
    const response = await POST(request({ ...validBody, timezone: "Chicago-ish" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Choose a valid IANA timezone." });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
});
