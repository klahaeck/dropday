import { describe, expect, it } from "vitest";
import {
  ClubBackupError,
  planBackupRecovery,
} from "@/lib/club-backups";
import type { Club, ClubBackup, DropSlot } from "@/types/domain";

const timestamp = "2026-07-30T18:00:00.000Z";
const club: Club = {
  id: "club-1",
  slug: "club-one",
  name: "Club One",
  description: "A club used to test backup recovery.",
  visibility: "private",
  accent: "#ff5c35",
  memberCount: 3,
  rotationMemberIds: ["missed-user", "next-user", "admin-user"],
  currentTheme: {
    name: "Night drive",
    version: 4,
    updatedAt: timestamp,
  },
  schedule: {
    timezone: "America/Chicago",
    startsOn: "2026-07-01",
    localTime: "20:00",
    frequency: "weekly",
    interval: 1,
    weekdays: [3],
    rrule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=WE",
    reminderOffsetsMinutes: [1440, 60],
    version: 4,
    paused: false,
  },
  activeDropId: "drop-1",
  custody: {
    status: "active",
    activeOwnerId: "admin-user",
    recoveryClaimantId: null,
  },
  createdAt: timestamp,
  updatedAt: timestamp,
};
const drop: DropSlot = {
  id: "drop-1",
  clubId: club.id,
  occurrenceKey: "club-1:2026-07-30:v4",
  scheduleVersion: 4,
  status: "overdue",
  assignedUserId: "missed-user",
  scheduledFor: "2026-07-30T17:00:00.000Z",
  createdAt: timestamp,
  updatedAt: timestamp,
};
const backup: ClubBackup = {
  id: "backup-1",
  clubId: club.id,
  addedByUserId: "admin-user",
  playlist: {
    sourceDraftId: "draft-1",
    provider: "spotify",
    providerPlaylistId: "spotify-1",
    canonicalUrl: "https://open.spotify.com/playlist/spotify-1",
    embedUrl: "https://open.spotify.com/embed/playlist/spotify-1",
    title: "Emergency grooves",
    description: "A ready-to-go fallback.",
    metadata: { trackCount: 15 },
  },
  status: "available",
  createdAt: timestamp,
};

describe("club backup recovery", () => {
  it("snapshots the current theme and records who replaced the missed assignee", () => {
    const recovery = planBackupRecovery({
      club,
      drop,
      backup,
      actorUserId: "admin-user",
      queueEffect: "preserveTurn",
      timestamp,
    });

    expect(recovery.playlist).toMatchObject({
      title: backup.playlist.title,
      theme: club.currentTheme,
    });
    expect(recovery.playlist.metadata).not.toBe(backup.playlist.metadata);
    expect(recovery.replacement).toEqual({
      originalAssigneeId: "missed-user",
      replacementPublisherId: "admin-user",
      backupId: backup.id,
      queueEffect: "preserveTurn",
    });
    expect(recovery.usedBackup).toMatchObject({
      status: "used",
      usedAt: timestamp,
    });
  });

  it("fails closed for a non-overdue slot or unavailable backup", () => {
    expect(() => planBackupRecovery({
      club,
      drop: { ...drop, status: "scheduled" },
      backup,
      actorUserId: "admin-user",
      queueEffect: "consumeTurn",
      timestamp,
    })).toThrowError(ClubBackupError);
    expect(() => planBackupRecovery({
      club,
      drop,
      backup: { ...backup, status: "retired" },
      actorUserId: "admin-user",
      queueEffect: "consumeTurn",
      timestamp,
    })).toThrowError(/available backup/i);
  });
});
