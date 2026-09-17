import { randomUUID } from "node:crypto";
import { MongoServerError } from "mongodb";
import { deliverBrowserNotifications } from "@/lib/browser-push";
import { getDb, getMongoClient } from "@/lib/db";
import { matchesDiscoverQuery } from "@/lib/discover-search";
import { integrations } from "@/lib/env";
import {
  demoClubs,
  demoBackups,
  demoDrafts,
  demoDrops,
  demoJoinRequests,
  demoMemberships,
  demoMessages,
  demoNotifications,
  demoUserById,
  demoUsers,
} from "@/lib/demo-data";
import type {
  ChatMessage,
  Club,
  ClubBackup,
  ClubMembership,
  DropSlot,
  JoinRequest,
  Notification,
  PlaylistDraft,
  UserProfile,
} from "@/types/domain";

export async function listClubsForUser(userId: string): Promise<Club[]> {
  const memberships = await listActiveMembershipsForUser(userId);
  const clubIds = memberships.map((membership) => membership.clubId);
  if (!integrations.mongo) return demoClubs.filter((club) => clubIds.includes(club.id));
  const db = await getDb();
  return db.collection<Club>("clubs").find({ id: { $in: clubIds } }).toArray();
}

export async function listActiveMembershipsForUser(
  userId: string,
): Promise<ClubMembership[]> {
  if (!integrations.mongo) {
    return demoMemberships.filter(
      (membership) => membership.userId === userId && membership.status === "active",
    );
  }
  return (await getDb()).collection<ClubMembership>("memberships")
    .find({ userId, status: "active" })
    .toArray();
}

export interface DashboardSnapshot {
  clubs: Club[];
  memberships: ClubMembership[];
  notifications: Notification[];
  scheduledDrops: DropSlot[];
  assignedUsers: UserProfile[];
  ownedClubCount: number;
}

export async function getDashboardSnapshot(userId: string): Promise<DashboardSnapshot> {
  if (!integrations.mongo) {
    const memberships = demoMemberships.filter(
      (membership) => membership.userId === userId && membership.status === "active",
    );
    const clubIds = new Set(memberships.map((membership) => membership.clubId));
    const clubs = demoClubs.filter((club) => clubIds.has(club.id));
    const scheduledDrops = demoDrops.filter(
      (drop) => clubIds.has(drop.clubId) && drop.status === "scheduled",
    );
    const assignedUserIds = new Set(scheduledDrops.map((drop) => drop.assignedUserId));
    return {
      clubs,
      memberships,
      notifications: demoNotifications
        .filter((notification) => notification.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 100),
      scheduledDrops,
      assignedUsers: demoUsers.filter((user) => assignedUserIds.has(user.id)),
      ownedClubCount: memberships.filter((membership) => (
        membership.role === "owner"
        && clubs.some((club) => club.id === membership.clubId && club.custody.status === "active")
      )).length,
    };
  }

  const db = await getDb();
  const memberships = await db.collection<ClubMembership>("memberships")
    .find({ userId, status: "active" })
    .toArray();
  const clubIds = memberships.map((membership) => membership.clubId);
  const [clubs, notifications, scheduledDrops] = await Promise.all([
    clubIds.length
      ? db.collection<Club>("clubs").find({ id: { $in: clubIds } }).toArray()
      : Promise.resolve([]),
    db.collection<Notification>("notifications")
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray(),
    clubIds.length
      ? db.collection<DropSlot>("drops")
        .find({ clubId: { $in: clubIds }, status: "scheduled" })
        .sort({ scheduledFor: 1 })
        .toArray()
      : Promise.resolve([]),
  ]);
  const assignedUserIds = [...new Set(scheduledDrops.map((drop) => drop.assignedUserId))];
  const assignedUsers = assignedUserIds.length
    ? await db.collection<UserProfile>("users").find({ id: { $in: assignedUserIds } }).toArray()
    : [];
  const clubsById = new Map(clubs.map((club) => [club.id, club]));
  const ownedClubCount = memberships.filter((membership) => (
    membership.role === "owner"
    && clubsById.get(membership.clubId)?.custody.status === "active"
  )).length;
  return { clubs, memberships, notifications, scheduledDrops, assignedUsers, ownedClubCount };
}

export interface PublicClubPage {
  clubs: Club[];
  hasNext: boolean;
}

export async function listPublicClubs(
  normalizedQuery = "",
  requestedPage = 1,
  pageSize = 24,
): Promise<PublicClubPage> {
  const page = Math.min(Math.max(Math.trunc(requestedPage), 1), 100);
  const limit = Math.min(Math.max(Math.trunc(pageSize), 1), 48);
  const offset = (page - 1) * limit;
  if (!integrations.mongo) {
    const matches = demoClubs
      .filter((club) => club.visibility === "public" && club.custody.status !== "archived")
      .filter((club) => matchesDiscoverQuery(club, normalizedQuery))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { clubs: matches.slice(offset, offset + limit), hasNext: matches.length > offset + limit };
  }
  const db = await getDb();
  const filter = {
    visibility: "public" as const,
    // The closed set preserves the non-archived contract while keeping the
    // following updatedAt sort usable from the compound discover index.
    "custody.status": { $in: ["active", "grace"] },
    ...(normalizedQuery ? { $text: { $search: normalizedQuery } } : {}),
  };
  const cursor = db.collection<Club>("clubs")
    .find(filter)
    .sort(normalizedQuery
      ? { score: { $meta: "textScore" }, updatedAt: -1 }
      : { updatedAt: -1 })
    .skip(offset)
    .limit(limit + 1);
  const clubs = await cursor.toArray();
  return { clubs: clubs.slice(0, limit), hasNext: clubs.length > limit };
}

export async function getClubBySlug(slug: string): Promise<Club | null> {
  if (!integrations.mongo) return demoClubs.find((club) => club.slug === slug) ?? null;
  return (await getDb()).collection<Club>("clubs").findOne({ slug });
}

export async function getClubById(clubId: string): Promise<Club | null> {
  if (!integrations.mongo) return demoClubs.find((club) => club.id === clubId) ?? null;
  return (await getDb()).collection<Club>("clubs").findOne({ id: clubId });
}

export async function getClubMemberships(clubId: string): Promise<ClubMembership[]> {
  if (!integrations.mongo) return demoMemberships.filter((item) => item.clubId === clubId && item.status === "active");
  return (await getDb()).collection<ClubMembership>("memberships").find({ clubId, status: "active" }).toArray();
}

export async function listPendingJoinRequests(clubId: string): Promise<JoinRequest[]> {
  if (!integrations.mongo) {
    return demoJoinRequests
      .filter((request) => request.clubId === clubId && request.status === "pending")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  return (await getDb()).collection<JoinRequest>("joinRequests")
    .find({ clubId, status: "pending" })
    .sort({ createdAt: 1 })
    .toArray();
}

export async function getPendingJoinRequest(clubId: string, userId: string): Promise<JoinRequest | null> {
  if (!integrations.mongo) {
    return demoJoinRequests.find((request) =>
      request.clubId === clubId && request.userId === userId && request.status === "pending"
    ) ?? null;
  }
  return (await getDb()).collection<JoinRequest>("joinRequests").findOne({ clubId, userId, status: "pending" });
}

export async function createOrGetPendingJoinRequest(
  joinRequest: JoinRequest,
): Promise<{ request: JoinRequest; created: boolean }> {
  if (!integrations.mongo) {
    const existing = demoJoinRequests.find((request) =>
      request.clubId === joinRequest.clubId && request.userId === joinRequest.userId && request.status === "pending"
    );
    if (existing) return { request: existing, created: false };
    demoJoinRequests.push(joinRequest);
    return { request: joinRequest, created: true };
  }

  const stored = await (await getDb()).collection<JoinRequest>("joinRequests").findOneAndUpdate(
    { clubId: joinRequest.clubId, userId: joinRequest.userId, status: "pending" },
    { $setOnInsert: joinRequest },
    { upsert: true, returnDocument: "after" },
  );
  if (!stored) throw new Error("Could not create join request");
  return { request: stored, created: stored.id === joinRequest.id };
}

export async function getClubDrops(clubId: string): Promise<DropSlot[]> {
  if (!integrations.mongo) return demoDrops.filter((drop) => drop.clubId === clubId).sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor));
  return (await getDb()).collection<DropSlot>("drops").find({ clubId }).sort({ scheduledFor: -1 }).toArray();
}

export async function listClubBackups(clubId: string): Promise<ClubBackup[]> {
  if (!integrations.mongo) {
    return demoBackups
      .filter((backup) => backup.clubId === clubId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return (await getDb()).collection<ClubBackup>("clubBackups")
    .find({ clubId })
    .sort({ createdAt: -1 })
    .toArray();
}

export async function getDropById(dropId: string): Promise<DropSlot | null> {
  if (!integrations.mongo) return demoDrops.find((drop) => drop.id === dropId) ?? null;
  return (await getDb()).collection<DropSlot>("drops").findOne({ id: dropId });
}

export async function listDrafts(userId: string): Promise<PlaylistDraft[]> {
  if (!integrations.mongo) return demoDrafts.filter((draft) => draft.ownerId === userId);
  return (await getDb()).collection<PlaylistDraft>("playlistDrafts").find({ ownerId: userId }).sort({ updatedAt: -1 }).toArray();
}

export async function getDraftByIdForOwner(draftId: string, ownerId: string): Promise<PlaylistDraft | null> {
  if (!integrations.mongo) {
    return demoDrafts.find((draft) => draft.id === draftId && draft.ownerId === ownerId) ?? null;
  }
  return (await getDb()).collection<PlaylistDraft>("playlistDrafts").findOne({ id: draftId, ownerId });
}

export async function listNotifications(userId: string): Promise<Notification[]> {
  if (!integrations.mongo) return demoNotifications.filter((item) => item.userId === userId);
  return (await getDb()).collection<Notification>("notifications").find({ userId }).sort({ createdAt: -1 }).limit(100).toArray();
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  if (!integrations.mongo) return demoNotifications.filter((item) => item.userId === userId && !item.readAt).length;
  return (await getDb()).collection<Notification>("notifications").countDocuments({ userId, readAt: { $exists: false } });
}

export async function markNotificationRead(
  userId: string,
  notificationId: string,
  readAt = new Date().toISOString(),
): Promise<boolean> {
  if (!integrations.mongo) {
    const notification = demoNotifications.find((item) => item.id === notificationId && item.userId === userId);
    if (!notification || notification.readAt) return false;
    notification.readAt = readAt;
    return true;
  }

  const result = await (await getDb()).collection<Notification>("notifications").updateOne(
    { id: notificationId, userId, readAt: { $exists: false } },
    { $set: { readAt } },
  );
  return result.modifiedCount === 1;
}

export async function markAllNotificationsRead(
  userId: string,
  readAt = new Date().toISOString(),
): Promise<number> {
  if (!integrations.mongo) {
    let updatedCount = 0;
    for (const notification of demoNotifications) {
      if (notification.userId !== userId || notification.readAt) continue;
      notification.readAt = readAt;
      updatedCount += 1;
    }
    return updatedCount;
  }

  const result = await (await getDb()).collection<Notification>("notifications").updateMany(
    { userId, readAt: { $exists: false } },
    { $set: { readAt } },
  );
  return result.modifiedCount;
}

interface MessageCursorValue {
  createdAt: string;
  id: string;
}

export interface MessagePage {
  messages: ChatMessage[];
  olderCursor?: string;
  newerCursor?: string;
  hasMoreNewer: boolean;
}

export class InvalidMessageCursorError extends Error {
  constructor() {
    super("Invalid message cursor");
    this.name = "InvalidMessageCursorError";
  }
}

function encodeMessageCursor(message: Pick<ChatMessage, "createdAt" | "id">): string {
  return Buffer.from(JSON.stringify({ createdAt: message.createdAt, id: message.id })).toString("base64url");
}

function decodeMessageCursor(cursor: string): MessageCursorValue {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<MessageCursorValue>;
    if (
      typeof value.createdAt !== "string"
      || Number.isNaN(Date.parse(value.createdAt))
      || typeof value.id !== "string"
      || !value.id
    ) throw new InvalidMessageCursorError();
    return { createdAt: value.createdAt, id: value.id };
  } catch (error) {
    if (error instanceof InvalidMessageCursorError) throw error;
    throw new InvalidMessageCursorError();
  }
}

function compareMessages(left: ChatMessage, right: MessageCursorValue): number {
  const createdAt = left.createdAt.localeCompare(right.createdAt);
  return createdAt || left.id.localeCompare(right.id);
}

export async function listMessagesPage(
  threadType: "club" | "drop",
  threadId: string,
  options: { before?: string; after?: string; limit?: number } = {},
): Promise<MessagePage> {
  if (options.before && options.after) throw new InvalidMessageCursorError();
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 50), 1), 100);
  const before = options.before ? decodeMessageCursor(options.before) : null;
  const after = options.after ? decodeMessageCursor(options.after) : null;
  let raw: ChatMessage[];

  if (!integrations.mongo) {
    const matches = demoMessages
      .filter((message) => message.threadType === threadType && message.threadId === threadId)
      .sort((left, right) => compareMessages(left, right));
    const filtered = before
      ? matches.filter((message) => compareMessages(message, before) < 0).reverse()
      : after
        ? matches.filter((message) => compareMessages(message, after) > 0)
        : [...matches].reverse();
    raw = filtered.slice(0, limit + 1);
  } else {
    const boundary = before ?? after;
    const direction = after ? 1 : -1;
    const filter = boundary
      ? {
          threadType,
          threadId,
          $or: [
            { createdAt: { [after ? "$gt" : "$lt"]: boundary.createdAt } },
            {
              createdAt: boundary.createdAt,
              id: { [after ? "$gt" : "$lt"]: boundary.id },
            },
          ],
        }
      : { threadType, threadId };
    raw = await (await getDb()).collection<ChatMessage>("messages")
      .find(filter, { projection: { _id: 0 } })
      .sort({ createdAt: direction, id: direction })
      .limit(limit + 1)
      .toArray();
  }

  const hasMore = raw.length > limit;
  const selected = raw.slice(0, limit);
  const messages = after ? selected : selected.reverse();
  return {
    messages,
    ...(!after && hasMore && messages[0]
      ? { olderCursor: encodeMessageCursor(messages[0]) }
      : {}),
    ...(messages.at(-1) ? { newerCursor: encodeMessageCursor(messages.at(-1)!) } : {}),
    hasMoreNewer: Boolean(after && hasMore),
  };
}

export async function insertMessage(
  message: ChatMessage,
  notifications: Notification[] = [],
): Promise<{ message: ChatMessage; created: boolean }> {
  if (!integrations.mongo) {
    const existing = message.clientMessageId
      ? demoMessages.find((candidate) => (
        candidate.authorId === message.authorId
        && candidate.clientMessageId === message.clientMessageId
      ))
      : undefined;
    if (existing) return { message: existing, created: false };
    demoMessages.push(message);
    demoNotifications.unshift(...notifications);
    return { message, created: true };
  }

  const db = await getDb();
  try {
    if (!notifications.length) {
      await db.collection<ChatMessage>("messages").insertOne(message);
    } else {
      const client = await getMongoClient();
      await client.withSession(async (session) => session.withTransaction(async () => {
        await db.collection<ChatMessage>("messages").insertOne(message, { session });
        await db.collection<Notification>("notifications").insertMany(notifications, { session });
      }));
      await deliverBrowserNotifications(notifications);
    }
    return { message, created: true };
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11000 || !message.clientMessageId) throw error;
    const existing = await db.collection<ChatMessage>("messages").findOne(
      { authorId: message.authorId, clientMessageId: message.clientMessageId },
      { projection: { _id: 0 } },
    );
    if (!existing) throw error;
    return { message: existing, created: false };
  }
}

export async function insertDraft(draft: PlaylistDraft): Promise<void> {
  if (!integrations.mongo) return;
  await (await getDb()).collection<PlaylistDraft>("playlistDrafts").insertOne(draft);
}

export async function updateDraftForOwner(draft: PlaylistDraft): Promise<boolean> {
  if (!integrations.mongo) {
    const index = demoDrafts.findIndex((item) => item.id === draft.id && item.ownerId === draft.ownerId);
    if (index === -1) return false;
    demoDrafts[index] = draft;
    return true;
  }
  const { id, ownerId, ...updates } = draft;
  const result = await (await getDb()).collection<PlaylistDraft>("playlistDrafts")
    .updateOne({ id, ownerId }, { $set: updates });
  return result.matchedCount === 1;
}

export async function countActiveMemberships(userId: string): Promise<number> {
  if (!integrations.mongo) return demoMemberships.filter((item) => item.userId === userId && item.status === "active").length;
  return (await getDb()).collection<ClubMembership>("memberships").countDocuments({ userId, status: "active" });
}

export async function countOwnedClubs(userId: string): Promise<number> {
  const ownerMemberships = (await listActiveMembershipsForUser(userId))
    .filter((membership) => membership.role === "owner");
  if (!ownerMemberships.length) return 0;
  const clubIds = ownerMemberships.map((membership) => membership.clubId);
  if (!integrations.mongo) {
    return demoClubs.filter(
      (club) => clubIds.includes(club.id) && club.custody.status === "active",
    ).length;
  }
  return (await getDb()).collection<Club>("clubs").countDocuments({
    id: { $in: clubIds },
    "custody.status": "active",
  });
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  if (!integrations.mongo) return demoUserById(userId) ?? null;
  return (await getDb()).collection<UserProfile>("users").findOne({ id: userId });
}

export async function getUsersByIds(userIds: string[]): Promise<UserProfile[]> {
  if (!integrations.mongo) return demoUsers.filter((user) => userIds.includes(user.id));
  return (await getDb()).collection<UserProfile>("users").find({ id: { $in: userIds } }).toArray();
}

export function createId(prefix: string) {
  return `${prefix}_${randomUUID()}`;
}
