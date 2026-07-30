import type { ClientSession, Db } from "mongodb";
import { nextActiveMember, preserveTurn, rotateQueue } from "@/lib/queue";
import { createId } from "@/lib/repository";
import { nextOccurrences, occurrenceKey } from "@/lib/scheduling";
import type {
  Club,
  ClubMembership,
  DropSlot,
  OutboxEvent,
  PlaylistSnapshot,
  ReplacementOutcome,
} from "@/types/domain";

export class DropPublicationConflict extends Error {
  constructor(message = "This drop changed before it could be published.") {
    super(message);
    this.name = "DropPublicationConflict";
  }
}

export function queueAfterPublishedDrop({
  queue,
  assignedUserId,
  queueEffect,
}: {
  queue: string[];
  assignedUserId: string;
  queueEffect: ReplacementOutcome["queueEffect"];
}) {
  return queueEffect === "preserveTurn"
    ? preserveTurn(queue, assignedUserId)
    : rotateQueue(queue, assignedUserId);
}

export async function publishDropInTransaction({
  db,
  session,
  club,
  drop,
  playlist,
  expectedStatus,
  timestamp,
  replacement,
}: {
  db: Db;
  session: ClientSession;
  club: Club;
  drop: DropSlot;
  playlist: PlaylistSnapshot;
  expectedStatus: "scheduled" | "overdue";
  timestamp: string;
  replacement?: ReplacementOutcome;
}) {
  const queueEffect = replacement?.queueEffect ?? "consumeTurn";
  const rotationMemberIds = queueAfterPublishedDrop({
    queue: club.rotationMemberIds,
    assignedUserId: drop.assignedUserId,
    queueEffect,
  });
  const memberships = await db.collection<ClubMembership>("memberships")
    .find({ clubId: club.id, status: "active" }, { session })
    .toArray();
  const pausedMemberIds = memberships
    .filter((membership) => membership.queuePaused)
    .map((membership) => membership.userId);
  const nextAssignedUserId = nextActiveMember(rotationMemberIds, pausedMemberIds);
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

  const publishedDrop: DropSlot = {
    ...drop,
    status: "published",
    playlist,
    publishedAt: timestamp,
    updatedAt: timestamp,
    ...(replacement ? { replacement } : {}),
  };
  const dropUpdate = replacement
    ? {
        $set: {
          status: "published" as const,
          playlist,
          publishedAt: timestamp,
          updatedAt: timestamp,
          replacement,
        },
      }
    : {
        $set: {
          status: "published" as const,
          playlist,
          publishedAt: timestamp,
          updatedAt: timestamp,
        },
        $unset: { replacement: "" as const },
      };
  const dropResult = await db.collection<DropSlot>("drops").updateOne(
    { id: drop.id, clubId: club.id, status: expectedStatus },
    dropUpdate,
    { session },
  );
  if (dropResult.modifiedCount !== 1) throw new DropPublicationConflict();

  if (nextDrop) {
    await db.collection<DropSlot>("drops").insertOne(nextDrop, { session });
  }

  const clubUpdate = nextDrop
    ? {
        $set: {
          rotationMemberIds,
          activeDropId: nextDrop.id,
          updatedAt: timestamp,
        },
      }
    : {
        $set: { rotationMemberIds, updatedAt: timestamp },
        $unset: { activeDropId: "" as const },
      };
  const clubResult = await db.collection<Club>("clubs").updateOne(
    { id: club.id, activeDropId: drop.id },
    clubUpdate,
    { session },
  );
  if (clubResult.modifiedCount !== 1) {
    throw new DropPublicationConflict("The club's active drop changed before publication.");
  }

  const outbox: OutboxEvent = {
    id: createId("outbox"),
    type: "drop.published",
    aggregateId: drop.id,
    payload: { clubId: club.id, title: playlist.title },
    status: "pending",
    attempts: 0,
    idempotencyKey: `drop-published:${drop.occurrenceKey}`,
    createdAt: timestamp,
  };
  await db.collection<OutboxEvent>("outbox").insertOne(outbox, { session });

  return {
    publishedDrop,
    nextDrop,
    outbox,
    rotationMemberIds,
  };
}
