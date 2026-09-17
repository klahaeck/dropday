import { getDb, getMongoClient } from "@/lib/db";
import {
  demoClubs,
  demoDrafts,
  demoDrops,
  demoMemberships,
} from "@/lib/demo-data";
import { integrations } from "@/lib/env";
import {
  DropPublicationConflict,
  publishDropInTransaction,
} from "@/lib/drop-publication";
import { nextActiveMember, rotateQueue } from "@/lib/queue";
import { createId } from "@/lib/repository";
import { nextOccurrences, occurrenceKey } from "@/lib/scheduling";
import type {
  Club,
  ClubMembership,
  DropSlot,
  OutboxEvent,
  PlaylistDraft,
  PlaylistSnapshot,
} from "@/types/domain";

export class DropAttachmentError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "DropAttachmentError";
  }
}

export type DropAttachmentAction = "attach" | "replace" | "no-op" | "publish-late";
export type ReviewedDropAttachmentAction = Exclude<DropAttachmentAction, "no-op">;

export function classifyDropAttachmentAction({
  drop,
  requestedDraftId,
  timestamp,
}: {
  drop: Pick<DropSlot, "status" | "scheduledFor" | "playlist">;
  requestedDraftId: string;
  timestamp: string;
}): DropAttachmentAction {
  const isLate = drop.status === "overdue"
    || Date.parse(drop.scheduledFor) <= Date.parse(timestamp);
  if (isLate) return "publish-late";
  if (drop.playlist?.sourceDraftId === requestedDraftId) return "no-op";
  return drop.playlist ? "replace" : "attach";
}

export function verifyReviewedDropAttachment({
  drop,
  draftId,
  reviewedAction,
  expectedCurrentDraftId,
  timestamp,
}: {
  drop: DropSlot;
  draftId: string;
  reviewedAction: ReviewedDropAttachmentAction;
  expectedCurrentDraftId: string | null;
  timestamp: string;
}) {
  const currentDraftId = drop.playlist?.sourceDraftId ?? null;
  const action = classifyDropAttachmentAction({
    drop,
    requestedDraftId: draftId,
    timestamp,
  });
  if (action === "no-op") {
    throw new DropAttachmentError("This playlist is already attached to the drop.", 409);
  }
  if (currentDraftId !== expectedCurrentDraftId || action !== reviewedAction) {
    throw new DropAttachmentError(
      "This drop changed after you reviewed it. Refresh and review the attachment again.",
      409,
    );
  }
  return action;
}

export function snapshotPlaylistDraft(
  draft: PlaylistDraft,
  theme?: Club["currentTheme"],
): PlaylistSnapshot {
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
    ...(theme ? { theme: { ...theme } } : {}),
  };
}

export function planDropAttachment({
  club,
  drop,
  draft,
  membership,
  actorUserId,
}: {
  club: Club;
  drop: DropSlot;
  draft: PlaylistDraft;
  membership: ClubMembership | null | undefined;
  actorUserId: string;
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
  if (drop.status !== "scheduled" && drop.status !== "overdue") {
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
  return snapshotPlaylistDraft(draft, club.currentTheme);
}

function attachDemoPlaylist(
  dropId: string,
  draftId: string,
  actorUserId: string,
  reviewedAction: ReviewedDropAttachmentAction,
  expectedCurrentDraftId: string | null,
  timestamp: string,
) {
  const drop = demoDrops.find((item) => item.id === dropId);
  if (!drop) throw new DropAttachmentError("Drop not found.", 404);
  const draft = demoDrafts.find((item) => item.id === draftId && item.ownerId === actorUserId);
  if (!draft) throw new DropAttachmentError("Playlist not found.", 404);
  const club = demoClubs.find((item) => item.id === drop.clubId);
  if (!club) throw new DropAttachmentError("Club not found.", 404);
  const membership = demoMemberships.find((item) =>
    item.clubId === club.id && item.userId === actorUserId
  );
  const playlist = planDropAttachment({ club, drop, draft, membership, actorUserId });
  const action = verifyReviewedDropAttachment({
    drop,
    draftId,
    reviewedAction,
    expectedCurrentDraftId,
    timestamp,
  });
  drop.playlist = playlist;
  drop.updatedAt = timestamp;
  if (action === "publish-late") {
    drop.status = "published";
    drop.publishedAt = timestamp;
    club.rotationMemberIds = rotateQueue(club.rotationMemberIds, drop.assignedUserId);
    const pausedMemberIds = demoMemberships
      .filter((item) =>
        item.clubId === club.id
        && item.status === "active"
        && item.queuePaused
      )
      .map((item) => item.userId);
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
    return { drop, club, demo: true, nextDrop, action, playlist } as const;
  }
  return { drop, club, demo: true, action, playlist } as const;
}

export interface DropAttachmentResult {
  drop: DropSlot;
  club: Club;
  demo: boolean;
  nextDrop?: DropSlot;
  outbox?: OutboxEvent;
  action: ReviewedDropAttachmentAction;
  playlist: PlaylistSnapshot;
}

export async function attachPlaylistToDrop({
  dropId,
  draftId,
  actorUserId,
  reviewedAction,
  expectedCurrentDraftId,
}: {
  dropId: string;
  draftId: string;
  actorUserId: string;
  reviewedAction: ReviewedDropAttachmentAction;
  expectedCurrentDraftId: string | null;
}): Promise<DropAttachmentResult> {
  const timestamp = new Date().toISOString();
  if (!integrations.mongo) {
    return attachDemoPlaylist(
      dropId,
      draftId,
      actorUserId,
      reviewedAction,
      expectedCurrentDraftId,
      timestamp,
    );
  }

  const db = await getDb();
  const client = await getMongoClient();
  let result: DropAttachmentResult | undefined;

  try {
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
      });
      const action = verifyReviewedDropAttachment({
        drop,
        draftId,
        reviewedAction,
        expectedCurrentDraftId,
        timestamp,
      });
      if (action === "publish-late") {
        const publication = await publishDropInTransaction({
          db,
          session,
          club,
          drop,
          playlist,
          expectedStatus: drop.status === "overdue" ? "overdue" : "scheduled",
          timestamp,
        });
        result = {
          drop: publication.publishedDrop,
          club: {
            ...club,
            rotationMemberIds: publication.rotationMemberIds,
            activeDropId: publication.nextDrop?.id,
            updatedAt: timestamp,
          },
          demo: false,
          nextDrop: publication.nextDrop,
          outbox: publication.outbox,
          action,
          playlist,
        };
        return;
      }
      const update = await db.collection<DropSlot>("drops").updateOne(
        {
          id: drop.id,
          assignedUserId: actorUserId,
          status: "scheduled",
          scheduleVersion: drop.scheduleVersion,
          scheduledFor: { $gt: timestamp },
          ...(expectedCurrentDraftId
            ? { "playlist.sourceDraftId": expectedCurrentDraftId }
            : { "playlist.sourceDraftId": { $exists: false } }),
        },
        { $set: { playlist, updatedAt: timestamp } },
        { session },
      );
      if (update.modifiedCount !== 1) {
        throw new DropAttachmentError("This drop changed before the playlist could be attached.", 409);
      }
      result = {
        drop: { ...drop, playlist, updatedAt: timestamp },
        club,
        demo: false,
        action,
        playlist,
      };
    }));
  } catch (error) {
    if (error instanceof DropPublicationConflict) {
      throw new DropAttachmentError(error.message, 409);
    }
    throw error;
  }

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
