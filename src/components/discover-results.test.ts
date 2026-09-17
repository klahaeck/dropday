import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DiscoverResults } from "@/components/discover-results";
import type { Club } from "@/types/domain";

const club = {
  id: "club-1",
  slug: "night-shift",
  name: "Night Shift",
  description: "Electronic music after dark",
  visibility: "public",
  accent: "#ff7a00",
  memberCount: 4,
  rotationMemberIds: [],
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
} satisfies Club;

describe("DiscoverResults", () => {
  it("distinguishes an empty public catalog", () => {
    const html = renderToStaticMarkup(createElement(DiscoverResults, { clubs: [], query: "" }));
    expect(html).toContain("No public clubs yet.");
    expect(html).not.toContain("Clear search");
  });

  it("renders a no-match query safely with a clear action", () => {
    const html = renderToStaticMarkup(createElement(DiscoverResults, {
      clubs: [],
      query: '<script>alert("x")</script>',
    }));
    expect(html).toContain("No clubs match");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain('href="/app/discover"');
    expect(html).toContain("Clear search");
  });

  it("renders singular and plural result counts", () => {
    const singular = renderToStaticMarkup(createElement(DiscoverResults, { clubs: [club], query: "night" }));
    const plural = renderToStaticMarkup(createElement(DiscoverResults, { clubs: [club, { ...club, id: "club-2", slug: "day-shift" }], query: "" }));
    expect(singular).toContain("1 public club matching");
    expect(plural).toContain("2 public clubs");
  });

  it("keeps the normalized query while paging results", () => {
    const html = renderToStaticMarkup(createElement(DiscoverResults, {
      clubs: [club],
      query: "night shift",
      page: 2,
      hasNext: true,
    }));

    expect(html).toContain("on page 2");
    expect(html).toContain('href="/app/discover?q=night+shift"');
    expect(html).toContain('href="/app/discover?q=night+shift&amp;page=3"');
  });
});
