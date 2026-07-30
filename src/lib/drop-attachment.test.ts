import { describe, expect, it } from "vitest";
import {
  DropAttachmentError,
  planDropAttachment,
} from "@/lib/drop-attachment";
import type {
  Club,
  ClubMembership,
  DropSlot,
  PlaylistDraft,
} from "@/types/domain";

const timestamp = "2026-07-17T18:00:00.000Z";

const club: Club = {
  id: "club-1",
  slug: "club-one",
  name: "Club One",
  description: "A club for testing drops.",
  visibility: "private",
  accent: "#ff5c35",
  memberCount: 1,
  rotationMemberIds: ["user-1"],
  currentTheme: {
    name: "Night drive",
    guidance: "Music for an empty road.",
    version: 4,
    updatedAt: timestamp,
  },
  schedule: {
    timezone: "America/Chicago",
    startsOn: "2026-07-01",
    localTime: "20:00",
    frequency: "weekly",
    interval: 1,
    weekdays: [5],
    rrule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=FR",
    reminderOffsetsMinutes: [1440, 60],
    version: 4,
    paused: false,
  },
  activeDropId: "drop-1",
  custody: { status: "active", activeOwnerId: "user-1", recoveryClaimantId: null },
  createdAt: timestamp,
  updatedAt: timestamp,
};

const drop: DropSlot = {
  id: "drop-1",
  clubId: club.id,
  occurrenceKey: "club-1:2026-07-24:v4",
  scheduleVersion: 4,
  status: "scheduled",
  assignedUserId: "user-1",
  scheduledFor: "2026-07-24T01:00:00.000Z",
  createdAt: timestamp,
  updatedAt: timestamp,
};

const draft: PlaylistDraft = {
  id: "draft-1",
  ownerId: "user-1",
  provider: "spotify",
  providerPlaylistId: "spotify-1",
  canonicalUrl: "https://open.spotify.com/playlist/spotify-1",
  embedUrl: "https://open.spotify.com/embed/playlist/spotify-1",
  versions: [{
    provider: "spotify",
    providerPlaylistId: "spotify-1",
    canonicalUrl: "https://open.spotify.com/playlist/spotify-1",
    embedUrl: "https://open.spotify.com/embed/playlist/spotify-1",
  }],
  title: "Headlights",
  description: "Songs for the interstate.",
  metadata: { trackCount: 14 },
  createdAt: timestamp,
  updatedAt: timestamp,
};

const membership: ClubMembership = {
  id: "membership-1",
  clubId: club.id,
  userId: "user-1",
  role: "member",
  status: "active",
  queuePaused: false,
  joinedAt: timestamp,
  updatedAt: timestamp,
};

function plan(overrides: {
  club?: Club;
  drop?: DropSlot;
  draft?: PlaylistDraft;
  membership?: ClubMembership | null;
  actorUserId?: string;
} = {}) {
  return planDropAttachment({
    club: overrides.club ?? club,
    drop: overrides.drop ?? drop,
    draft: overrides.draft ?? draft,
    membership: overrides.membership === undefined ? membership : overrides.membership,
    actorUserId: overrides.actorUserId ?? "user-1",
  });
}

describe("drop attachment", () => {
  it("snapshots the prepared playlist and current club theme for the scheduled slot", () => {
    const snapshot = plan();

    expect(snapshot).toMatchObject({
      sourceDraftId: draft.id,
      title: draft.title,
      providerPlaylistId: draft.providerPlaylistId,
      metadata: draft.metadata,
      theme: club.currentTheme,
    });
    expect(snapshot.metadata).not.toBe(draft.metadata);
    expect(snapshot.theme).not.toBe(club.currentTheme);
    expect(snapshot.versions).not.toBe(draft.versions);
    expect(drop.scheduledFor).toBe("2026-07-24T01:00:00.000Z");
    expect(drop.status).toBe("scheduled");
  });

  it("creates a theme-free snapshot for a freeform club", () => {
    const snapshot = plan({ club: { ...club, currentTheme: undefined } });

    expect(snapshot).not.toHaveProperty("theme");
  });

  it("allows only the active member assigned to the drop to attach their own playlist", () => {
    expect(() => plan({ drop: { ...drop, assignedUserId: "user-2" } }))
      .toThrowError(DropAttachmentError);
    expect(() => plan({ membership: null })).toThrowError(/no longer an active member/i);
    expect(() => plan({ draft: { ...draft, ownerId: "user-2" } })).toThrowError(/not found/i);
  });

  it("allows the assigned member to fill an overdue slot with their own playlist", () => {
    expect(plan({
      drop: { ...drop, status: "overdue" },
    })).toMatchObject({
      sourceDraftId: draft.id,
      title: draft.title,
      theme: club.currentTheme,
    });
  });

  it("rejects inactive, stale, and paused slots", () => {
    expect(() => plan({ drop: { ...drop, status: "published" } }))
      .toThrowError(/can no longer be changed/i);
    expect(() => plan({ club: { ...club, activeDropId: "drop-2" } }))
      .toThrowError(/no longer the club's active drop/i);
    expect(() => plan({ club: { ...club, schedule: { ...club.schedule, paused: true } } }))
      .toThrowError(/schedule is paused/i);
  });

  it("rejects a slot created from an older schedule version", () => {
    expect(() => plan({ drop: { ...drop, scheduleVersion: 3 } }))
      .toThrowError(/schedule changed/i);
  });
});
