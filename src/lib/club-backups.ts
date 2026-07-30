import {
  demoBackups,
  demoClubs,
  demoDrafts,
  demoDrops,
  demoMemberships,
} from "@/lib/demo-data";
import { getDb, getMongoClient } from "@/lib/db";
import { snapshotPlaylistDraft } from "@/lib/drop-attachment";
import { DropPublicationConflict, publishDropInTransaction } from "@/lib/drop-publication";
import { integrations } from "@/lib/env";
import { nextActiveMember, preserveTurn, rotateQueue } from "@/lib/queue";
import { createId } from "@/lib/repository";
import { nextOccurrences, occurrenceKey } from "@/lib/scheduling";
import type {
  Club,
  ClubBackup,
  ClubMembership,
  DropSlot,
  OutboxEvent,
  PlaylistDraft,
  ReplacementOutcome,
} from "@/types/domain";

export class ClubBackupError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ClubBackupError";
  }
}

function assertAdminMembership(membership: ClubMembership | null | undefined) {
  if (!membership || membership.status !== "active" || membership.role === "member") {
    throw new ClubBackupError("You cannot manage backups for this club.", 403);
  }
}

function assertUsableClub(club: Club) {
  if (club.custody.status === "archived") {
    throw new ClubBackupError("This club is archived.", 409);
  }
}

export function planBackupRecovery({
  club,
  drop,
  backup,
  actorUserId,
  queueEffect,
  timestamp,
}: {
  club: Club;
  drop: DropSlot | null | undefined;
  backup: ClubBackup | null | undefined;
  actorUserId: string;
  queueEffect: ReplacementOutcome["queueEffect"];
  timestamp: string;
}) {
  assertUsableClub(club);
  if (!drop || drop.id !== club.activeDropId || drop.status !== "overdue") {
    throw new ClubBackupError("This club no longer has an overdue drop to recover.", 409);
  }
  if (!backup || backup.clubId !== club.id || backup.status !== "available") {
    throw new ClubBackupError("Choose an available backup playlist.", 409);
  }

  const replacement: ReplacementOutcome = {
    originalAssigneeId: drop.assignedUserId,
    replacementPublisherId: actorUserId,
    backupId: backup.id,
    queueEffect,
  };
  const playlist = {
    ...backup.playlist,
    versions: backup.playlist.versions?.map((version) => ({ ...version })),
    metadata: { ...backup.playlist.metadata },
    ...(club.currentTheme ? { theme: { ...club.currentTheme } } : {}),
  };

  return {
    playlist,
    replacement,
    usedBackup: {
      ...backup,
      status: "used" as const,
      usedAt: timestamp,
    },
  };
}

export async function createClubBackup({
  clubSlug,
  actorUserId,
  draftId,
}: {
  clubSlug: string;
  actorUserId: string;
  draftId: string;
}): Promise<ClubBackup> {
  const timestamp = new Date().toISOString();
  if (!integrations.mongo) {
    const club = demoClubs.find((candidate) => candidate.slug === clubSlug);
    if (!club) throw new ClubBackupError("Club not found.", 404);
    assertUsableClub(club);
    assertAdminMembership(demoMemberships.find((membership) =>
      membership.clubId === club.id && membership.userId === actorUserId
    ));
    const draft = demoDrafts.find((candidate) =>
      candidate.id === draftId && candidate.ownerId === actorUserId
    );
    if (!draft) throw new ClubBackupError("Playlist not found.", 404);
    if (demoBackups.some((backup) =>
      backup.clubId === club.id
      && backup.status === "available"
      && backup.playlist.sourceDraftId === draft.id
    )) {
      throw new ClubBackupError("That playlist is already in the backup crate.", 409);
    }
    const backup: ClubBackup = {
      id: createId("backup"),
      clubId: club.id,
      addedByUserId: actorUserId,
      playlist: snapshotPlaylistDraft(draft),
      status: "available",
      createdAt: timestamp,
    };
    demoBackups.unshift(backup);
    return backup;
  }

  const db = await getDb();
  const [club, draft] = await Promise.all([
    db.collection<Club>("clubs").findOne({ slug: clubSlug }),
    db.collection<PlaylistDraft>("playlistDrafts").findOne({
      id: draftId,
      ownerId: actorUserId,
    }),
  ]);
  if (!club) throw new ClubBackupError("Club not found.", 404);
  assertUsableClub(club);
  const membership = await db.collection<ClubMembership>("memberships").findOne({
    clubId: club.id,
    userId: actorUserId,
    status: "active",
  });
  assertAdminMembership(membership);
  if (!draft) throw new ClubBackupError("Playlist not found.", 404);
  const existing = await db.collection<ClubBackup>("clubBackups").findOne({
    clubId: club.id,
    status: "available",
    "playlist.sourceDraftId": draft.id,
  });
  if (existing) {
    throw new ClubBackupError("That playlist is already in the backup crate.", 409);
  }

  const backup: ClubBackup = {
    id: createId("backup"),
    clubId: club.id,
    addedByUserId: actorUserId,
    playlist: snapshotPlaylistDraft(draft),
    status: "available",
    createdAt: timestamp,
  };
  try {
    await db.collection<ClubBackup>("clubBackups").insertOne(backup);
  } catch (error) {
    if (
      typeof error === "object"
      && error !== null
      && "code" in error
      && error.code === 11000
    ) {
      throw new ClubBackupError("That playlist is already in the backup crate.", 409);
    }
    throw error;
  }
  return backup;
}

export async function retireClubBackup({
  clubSlug,
  backupId,
  actorUserId,
}: {
  clubSlug: string;
  backupId: string;
  actorUserId: string;
}) {
  if (!integrations.mongo) {
    const club = demoClubs.find((candidate) => candidate.slug === clubSlug);
    if (!club) throw new ClubBackupError("Club not found.", 404);
    assertAdminMembership(demoMemberships.find((membership) =>
      membership.clubId === club.id && membership.userId === actorUserId
    ));
    const backup = demoBackups.find((candidate) =>
      candidate.id === backupId && candidate.clubId === club.id
    );
    if (!backup || backup.status !== "available") {
      throw new ClubBackupError("This backup is no longer available.", 409);
    }
    backup.status = "retired";
    return backup;
  }

  const db = await getDb();
  const club = await db.collection<Club>("clubs").findOne({ slug: clubSlug });
  if (!club) throw new ClubBackupError("Club not found.", 404);
  const membership = await db.collection<ClubMembership>("memberships").findOne({
    clubId: club.id,
    userId: actorUserId,
    status: "active",
  });
  assertAdminMembership(membership);
  const result = await db.collection<ClubBackup>("clubBackups").findOneAndUpdate(
    { id: backupId, clubId: club.id, status: "available" },
    { $set: { status: "retired" } },
    { returnDocument: "after" },
  );
  if (!result) throw new ClubBackupError("This backup is no longer available.", 409);
  return result;
}

export interface BackupRecoveryResult {
  club: Club;
  drop: DropSlot;
  nextDrop?: DropSlot;
  outbox: OutboxEvent;
  backup: ClubBackup;
}

export async function recoverOverdueDropWithBackup({
  clubSlug,
  backupId,
  actorUserId,
  queueEffect,
}: {
  clubSlug: string;
  backupId: string;
  actorUserId: string;
  queueEffect: ReplacementOutcome["queueEffect"];
}): Promise<BackupRecoveryResult> {
  const timestamp = new Date().toISOString();
  if (!integrations.mongo) {
    const club = demoClubs.find((candidate) => candidate.slug === clubSlug);
    if (!club) throw new ClubBackupError("Club not found.", 404);
    assertAdminMembership(demoMemberships.find((membership) =>
      membership.clubId === club.id && membership.userId === actorUserId
    ));
    const drop = demoDrops.find((candidate) => candidate.id === club.activeDropId);
    const backup = demoBackups.find((candidate) => candidate.id === backupId);
    const recovery = planBackupRecovery({
      club,
      drop,
      backup,
      actorUserId,
      queueEffect,
      timestamp,
    });
    Object.assign(backup!, recovery.usedBackup);
    Object.assign(drop!, {
      playlist: recovery.playlist,
      replacement: recovery.replacement,
      status: "published",
      publishedAt: timestamp,
      updatedAt: timestamp,
    });
    club.rotationMemberIds = queueEffect === "preserveTurn"
      ? preserveTurn(club.rotationMemberIds, drop!.assignedUserId)
      : rotateQueue(club.rotationMemberIds, drop!.assignedUserId);
    const pausedMemberIds = demoMemberships
      .filter((membership) =>
        membership.clubId === club.id
        && membership.status === "active"
        && membership.queuePaused
      )
      .map((membership) => membership.userId);
    const nextAssignedUserId = nextActiveMember(club.rotationMemberIds, pausedMemberIds);
    const nextDate = nextOccurrences(club.schedule, new Date(timestamp), 1)[0];
    const nextDrop = nextDate && nextAssignedUserId
      ? {
          id: createId("drop"),
          clubId: club.id,
          occurrenceKey: occurrenceKey(club.id, nextDate, club.schedule.version),
          scheduleVersion: club.schedule.version,
          status: "scheduled" as const,
          assignedUserId: nextAssignedUserId,
          scheduledFor: nextDate.toISOString(),
          createdAt: timestamp,
          updatedAt: timestamp,
        }
      : undefined;
    if (nextDrop) demoDrops.push(nextDrop);
    club.activeDropId = nextDrop?.id;
    club.updatedAt = timestamp;
    return {
      club,
      drop: drop!,
      nextDrop,
      backup: backup!,
      outbox: {
        id: createId("outbox"),
        type: "drop.published",
        aggregateId: drop!.id,
        payload: { clubId: club.id, title: recovery.playlist.title },
        status: "pending",
        attempts: 0,
        idempotencyKey: `drop-published:${drop!.occurrenceKey}`,
        createdAt: timestamp,
      },
    };
  }

  const db = await getDb();
  const client = await getMongoClient();
  let result: BackupRecoveryResult | undefined;
  try {
    await client.withSession(async (session) => session.withTransaction(async () => {
      const club = await db.collection<Club>("clubs").findOne({ slug: clubSlug }, { session });
      if (!club) throw new ClubBackupError("Club not found.", 404);
      const membership = await db.collection<ClubMembership>("memberships").findOne(
        { clubId: club.id, userId: actorUserId, status: "active" },
        { session },
      );
      assertAdminMembership(membership);
      const [drop, backup] = await Promise.all([
        club.activeDropId
          ? db.collection<DropSlot>("drops").findOne({ id: club.activeDropId }, { session })
          : Promise.resolve(null),
        db.collection<ClubBackup>("clubBackups").findOne({ id: backupId }, { session }),
      ]);
      const recovery = planBackupRecovery({
        club,
        drop,
        backup,
        actorUserId,
        queueEffect,
        timestamp,
      });
      const publication = await publishDropInTransaction({
        db,
        session,
        club,
        drop: drop!,
        playlist: recovery.playlist,
        expectedStatus: "overdue",
        timestamp,
        replacement: recovery.replacement,
      });
      const backupUpdate = await db.collection<ClubBackup>("clubBackups").updateOne(
        { id: backup!.id, clubId: club.id, status: "available" },
        { $set: { status: "used", usedAt: timestamp } },
        { session },
      );
      if (backupUpdate.modifiedCount !== 1) {
        throw new ClubBackupError("This backup was already used.", 409);
      }
      result = {
        club: {
          ...club,
          rotationMemberIds: publication.rotationMemberIds,
          activeDropId: publication.nextDrop?.id,
          updatedAt: timestamp,
        },
        drop: publication.publishedDrop,
        nextDrop: publication.nextDrop,
        outbox: publication.outbox,
        backup: recovery.usedBackup,
      };
    }));
  } catch (error) {
    if (error instanceof DropPublicationConflict) {
      throw new ClubBackupError(error.message, 409);
    }
    throw error;
  }
  if (!result) throw new ClubBackupError("Could not recover this drop.", 500);
  return result;
}
