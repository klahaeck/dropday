import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { getDb, getMongoClient } from "@/lib/db";
import { integrations } from "@/lib/env";
import type { ClubInvitation } from "@/types/domain";

const INVITATION_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000;
const demoInvitations: ClubInvitation[] = [];

export interface RotatedClubInvitation {
  invitation: ClubInvitation;
  token: string;
}

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function invitationId(): string {
  return `invitation_${randomUUID()}`;
}

function parseInvitationToken(token: string): { id: string; secret: string } | null {
  const separator = token.indexOf(".");
  if (separator <= 0 || separator === token.length - 1) return null;
  const id = token.slice(0, separator);
  const secret = token.slice(separator + 1);
  if (!/^invitation_[0-9a-f-]{36}$/.test(id) || !/^[A-Za-z0-9_-]{40,64}$/.test(secret)) return null;
  return { id, secret };
}

function secretsMatch(expectedHash: string, secret: string): boolean {
  const actual = Buffer.from(hashSecret(secret), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function markExpired(invitation: ClubInvitation, timestamp: string): Promise<void> {
  invitation.status = "expired";
  invitation.updatedAt = timestamp;
  if (!integrations.mongo) return;
  await (await getDb()).collection<ClubInvitation>("clubInvitations").updateOne(
    { id: invitation.id, status: "active" },
    { $set: { status: "expired", updatedAt: timestamp } },
  );
}

export async function getActiveClubInvitation(
  clubId: string,
  timestamp = new Date().toISOString(),
): Promise<ClubInvitation | null> {
  const invitation = integrations.mongo
    ? await (await getDb()).collection<ClubInvitation>("clubInvitations").findOne(
      { clubId, status: "active" },
      { projection: { _id: 0 } },
    )
    : demoInvitations.find((candidate) => candidate.clubId === clubId && candidate.status === "active") ?? null;
  if (!invitation) return null;
  if (invitation.expiresAt > timestamp) return invitation;
  await markExpired(invitation, timestamp);
  return null;
}

export async function rotateClubInvitation(
  clubId: string,
  invitedByUserId: string,
  timestamp = new Date().toISOString(),
): Promise<RotatedClubInvitation> {
  const id = invitationId();
  const secret = randomBytes(32).toString("base64url");
  const invitation: ClubInvitation = {
    id,
    clubId,
    invitedByUserId,
    tokenHash: hashSecret(secret),
    status: "active",
    expiresAt: new Date(Date.parse(timestamp) + INVITATION_LIFETIME_MS).toISOString(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  if (!integrations.mongo) {
    for (const existing of demoInvitations) {
      if (existing.clubId !== clubId || existing.status !== "active") continue;
      existing.status = "revoked";
      existing.revokedAt = timestamp;
      existing.updatedAt = timestamp;
    }
    demoInvitations.push(invitation);
    return { invitation, token: `${id}.${secret}` };
  }

  const db = await getDb();
  const client = await getMongoClient();
  await client.withSession(async (session) => session.withTransaction(async () => {
    await db.collection<ClubInvitation>("clubInvitations").updateMany(
      { clubId, status: "active" },
      { $set: { status: "revoked", revokedAt: timestamp, updatedAt: timestamp } },
      { session },
    );
    await db.collection<ClubInvitation>("clubInvitations").insertOne(invitation, { session });
  }));
  return { invitation, token: `${id}.${secret}` };
}

export async function revokeActiveClubInvitation(
  clubId: string,
  timestamp = new Date().toISOString(),
): Promise<boolean> {
  if (!integrations.mongo) {
    const invitation = demoInvitations.find(
      (candidate) => candidate.clubId === clubId && candidate.status === "active",
    );
    if (!invitation) return false;
    invitation.status = "revoked";
    invitation.revokedAt = timestamp;
    invitation.updatedAt = timestamp;
    return true;
  }
  const result = await (await getDb()).collection<ClubInvitation>("clubInvitations").updateOne(
    { clubId, status: "active" },
    { $set: { status: "revoked", revokedAt: timestamp, updatedAt: timestamp } },
  );
  return result.modifiedCount === 1;
}

export async function validateClubInvitation(
  clubId: string,
  token: string | undefined,
  timestamp = new Date().toISOString(),
): Promise<boolean> {
  return Boolean(await resolveClubInvitation(clubId, token, timestamp));
}

export async function resolveClubInvitation(
  clubId: string,
  token: string | undefined,
  timestamp = new Date().toISOString(),
): Promise<ClubInvitation | null> {
  if (!token) return null;
  const parsed = parseInvitationToken(token);
  if (!parsed) return null;
  const invitation = integrations.mongo
    ? await (await getDb()).collection<ClubInvitation>("clubInvitations").findOne(
      { id: parsed.id, clubId },
      { projection: { _id: 0 } },
    )
    : demoInvitations.find((candidate) => candidate.id === parsed.id && candidate.clubId === clubId) ?? null;
  if (!invitation || invitation.status !== "active" || !secretsMatch(invitation.tokenHash, parsed.secret)) {
    return null;
  }
  if (invitation.expiresAt > timestamp) return invitation;
  await markExpired(invitation, timestamp);
  return null;
}
