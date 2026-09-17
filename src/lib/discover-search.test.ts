import { describe, expect, it } from "vitest";
import {
  escapeMongoRegex,
  matchesDiscoverQuery,
  normalizeDiscoverQuery,
} from "@/lib/discover-search";
import type { Club } from "@/types/domain";

const club: Club = {
  id: "club-1",
  slug: "night-shift",
  name: "Night Shift",
  description: "Electronic music after dark",
  visibility: "public",
  accent: "#ff7a00",
  memberCount: 4,
  rotationMemberIds: [],
  currentTheme: {
    name: "Hidden Gems",
    guidance: "Bring a deep-cut favorite",
    version: 1,
    updatedAt: "2026-07-01T00:00:00.000Z",
  },
  schedule: {
    timezone: "America/Chicago",
    startsOn: "2026-07-01",
    localTime: "19:00",
    frequency: "weekly",
    interval: 1,
    weekdays: [4],
    rrule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=TH",
    reminderOffsetsMinutes: [60],
    version: 1,
    paused: false,
  },
  custody: {
    status: "active",
    activeOwnerId: "user-1",
    recoveryClaimantId: null,
  },
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-02T00:00:00.000Z",
};

describe("Discover search", () => {
  it("normalizes scalar queries and duplicate query parameters", () => {
    expect(normalizeDiscoverQuery("  night\n   shift  ")).toBe("night shift");
    expect(normalizeDiscoverQuery([" first ", "second"])).toBe("first");
    expect(normalizeDiscoverQuery()).toBe("");
  });

  it("caps the normalized first value at 100 characters", () => {
    expect(normalizeDiscoverQuery(`  ${"a".repeat(120)}  `)).toHaveLength(100);
  });

  it.each([
    "night shift",
    "ELECTRONIC",
    "hidden gems",
    "deep-cut",
  ])("matches a public club field case-insensitively for %s", (query) => {
    expect(matchesDiscoverQuery(club, query)).toBe(true);
  });

  it("matches every club for an empty query and rejects unrelated terms", () => {
    expect(matchesDiscoverQuery(club, "")).toBe(true);
    expect(matchesDiscoverQuery(club, "acoustic brunch")).toBe(false);
  });

  it("escapes regex metacharacters for literal Mongo matching", () => {
    expect(escapeMongoRegex("deep.*(cut)? [mix]")).toBe("deep\\.\\*\\(cut\\)\\? \\[mix\\]");
  });
});
