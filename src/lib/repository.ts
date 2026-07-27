import { randomUUID } from "node:crypto";
import { deliverBrowserNotifications } from "@/lib/browser-push";
import { getDb, getMongoClient } from "@/lib/db";
import { integrations } from "@/lib/env";
import {
  demoClubs,
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
  ClubMembership,
  DropSlot,
  JoinRequest,
  Notification,
  PlaylistDraft,
  UserProfile,
} from "@/types/domain";

export async function listClubsForUser(userId: string): Promise<Club[]> {
  if (!integrations.mongo) {
    const clubIds = demoMemberships.filter((item) => item.userId === userId && item.status === "active").map((item) => item.clubId);
    return demoClubs.filter((club) => clubIds.includes(club.id));
  }
  const db = await getDb();
  const memberships = await db.collection<ClubMembership>("memberships").find({ userId, status: "active" }).toArray();
  return db.collection<Club>("clubs").find({ id: { $in: memberships.map((item) => item.clubId) } }).toArray();
}

export async function listPublicClubs(): Promise<Club[]> {
  if (!integrations.mongo) return demoClubs.filter((club) => club.visibility === "public" && club.custody.status !== "archived");
  const db = await getDb();
  return db.collection<Club>("clubs").find({ visibility: "public", "custody.status": { $ne: "archived" } }).sort({ updatedAt: -1 }).toArray();
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

export async function listMessages(threadType: "club" | "drop", threadId: string): Promise<ChatMessage[]> {
  if (!integrations.mongo) return demoMessages.filter((item) => item.threadType === threadType && item.threadId === threadId);
  const messages = await (await getDb()).collection<ChatMessage>("messages")
    .find({ threadType, threadId }, { projection: { _id: 0 } })
    .sort({ createdAt: 1 })
    .limit(100)
    .toArray();
  return messages;
}

export async function insertMessage(
  message: ChatMessage,
  notifications: Notification[] = [],
): Promise<void> {
  if (!integrations.mongo) {
    demoMessages.push(message);
    demoNotifications.unshift(...notifications);
    return;
  }

  const db = await getDb();
  if (!notifications.length) {
    await db.collection<ChatMessage>("messages").insertOne(message);
    return;
  }

  const client = await getMongoClient();
  await client.withSession(async (session) => session.withTransaction(async () => {
    await db.collection<ChatMessage>("messages").insertOne(message, { session });
    await db.collection<Notification>("notifications").insertMany(notifications, { session });
  }));
  await deliverBrowserNotifications(notifications);
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
  if (!integrations.mongo) return demoClubs.filter((club) => club.custody.activeOwnerId === userId).length;
  return (await getDb()).collection<Club>("clubs").countDocuments({ "custody.activeOwnerId": userId, "custody.status": "active" });
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
