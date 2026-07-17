import { getDb, getMongoClient } from "@/lib/db";
import {
  demoClubs,
  demoDrafts,
  demoDrops,
  demoMemberships,
} from "@/lib/demo-data";
import { integrations } from "@/lib/env";
import type {
  Club,
  ClubMembership,
  DropSlot,
  PlaylistDraft,
  PlaylistSnapshot,
} from "@/types/domain";

export class DropAttachmentError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "DropAttachmentError";
  }
}

export function planDropAttachment({
  club,
  drop,
  draft,
  membership,
  actorUserId,
  timestamp,
}: {
  club: Club;
  drop: DropSlot;
  draft: PlaylistDraft;
  membership: ClubMembership | null | undefined;
  actorUserId: string;
  timestamp: string;
}): PlaylistSnapshot {
  if (draft.ownerId !== actorUserId) {
    throw new DropAttachmentError("Playlist not found.", 404);
  }
  if (drop.assignedUserId !== actorUserId) {
    throw new DropAttachmentError("Only the member assigned to this drop can attach a playlist.", 403);
  }
  if (membership?.status !== "active") {
    throw new DropAttachmentError("You are no longer an active member of this club.", 403);
  }
  if (drop.clubId !== club.id || club.activeDropId !== drop.id) {
    throw new DropAttachmentError("This is no longer the club's active drop.", 409);
  }
  if (drop.status !== "scheduled") {
    throw new DropAttachmentError("This drop can no longer be changed.", 409);
  }
  if (drop.scheduleVersion !== club.schedule.version) {
    throw new DropAttachmentError("The club schedule changed. Refresh and choose the new drop.", 409);
  }
  if (club.schedule.paused) {
    throw new DropAttachmentError("This club's schedule is paused.", 409);
  }
  if (club.custody.status === "archived") {
    throw new DropAttachmentError("This club is archived.", 409);
  }
  if (drop.scheduledFor <= timestamp) {
    throw new DropAttachmentError("The assigned drop time has already passed.", 409);
  }

  return {
    sourceDraftId: draft.id,
    provider: draft.provider,
    providerPlaylistId: draft.providerPlaylistId,
    canonicalUrl: draft.canonicalUrl,
    embedUrl: draft.embedUrl,
    versions: draft.versions?.map((version) => ({ ...version })),
    title: draft.title,
    description: draft.description,
    descriptionHtml: draft.descriptionHtml,
    metadata: { ...draft.metadata },
    ...(club.currentTheme ? { theme: { ...club.currentTheme } } : {}),
  };
}

function attachDemoPlaylist(dropId: string, draftId: string, actorUserId: string, timestamp: string) {
  const drop = demoDrops.find((item) => item.id === dropId);
  if (!drop) throw new DropAttachmentError("Drop not found.", 404);
  const draft = demoDrafts.find((item) => item.id === draftId && item.ownerId === actorUserId);
  if (!draft) throw new DropAttachmentError("Playlist not found.", 404);
  const club = demoClubs.find((item) => item.id === drop.clubId);
  if (!club) throw new DropAttachmentError("Club not found.", 404);
  const membership = demoMemberships.find((item) =>
    item.clubId === club.id && item.userId === actorUserId
  );
  const playlist = planDropAttachment({ club, drop, draft, membership, actorUserId, timestamp });
  drop.playlist = playlist;
  drop.updatedAt = timestamp;
  return { drop, club, demo: true } as const;
}

export async function attachPlaylistToDrop({
  dropId,
  draftId,
  actorUserId,
}: {
  dropId: string;
  draftId: string;
  actorUserId: string;
}): Promise<{ drop: DropSlot; club: Club; demo: boolean }> {
  const timestamp = new Date().toISOString();
  if (!integrations.mongo) {
    return attachDemoPlaylist(dropId, draftId, actorUserId, timestamp);
  }

  const db = await getDb();
  const client = await getMongoClient();
  let result: { drop: DropSlot; club: Club; demo: boolean } | undefined;

  await client.withSession(async (session) => session.withTransaction(async () => {
    const drop = await db.collection<DropSlot>("drops").findOne({ id: dropId }, { session });
    if (!drop) throw new DropAttachmentError("Drop not found.", 404);
    const draft = await db.collection<PlaylistDraft>("playlistDrafts").findOne(
      { id: draftId, ownerId: actorUserId },
      { session },
    );
    const club = await db.collection<Club>("clubs").findOne({ id: drop.clubId }, { session });
    const membership = await db.collection<ClubMembership>("memberships").findOne(
      { clubId: drop.clubId, userId: actorUserId },
      { session },
    );
    if (!draft) throw new DropAttachmentError("Playlist not found.", 404);
    if (!club) throw new DropAttachmentError("Club not found.", 404);

    const playlist = planDropAttachment({
      club,
      drop,
      draft,
      membership,
      actorUserId,
      timestamp,
    });
    const update = await db.collection<DropSlot>("drops").updateOne(
      {
        id: drop.id,
        assignedUserId: actorUserId,
        status: "scheduled",
        scheduleVersion: drop.scheduleVersion,
        scheduledFor: { $gt: timestamp },
      },
      { $set: { playlist, updatedAt: timestamp } },
      { session },
    );
    if (update.modifiedCount !== 1) {
      throw new DropAttachmentError("This drop changed before the playlist could be attached.", 409);
    }
    result = { drop: { ...drop, playlist, updatedAt: timestamp }, club, demo: false };
  }));

  if (!result) throw new DropAttachmentError("Could not attach this playlist.", 500);
  return result;
}

export async function recordDropTriggerRunIds(dropId: string, runIds: string[]) {
  if (!runIds.length) return;
  if (!integrations.mongo) {
    const drop = demoDrops.find((item) => item.id === dropId);
    if (drop) drop.triggerRunIds = runIds;
    return;
  }
  await (await getDb()).collection<DropSlot>("drops").updateOne(
    { id: dropId, status: "scheduled" },
    { $set: { triggerRunIds: runIds } },
  );
}
