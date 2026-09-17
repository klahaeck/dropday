import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { getDb } from "@/lib/db";
import { getActiveClubInvitation, resolveClubInvitation } from "@/lib/club-invitations";
import { integrations } from "@/lib/env";

const SESSION_LIFETIME_MS = 15 * 60 * 1000;

export const CLUB_INVITATION_SESSION_COOKIE = "dropday_invitation_session";

interface ClubInvitationSession {
  id: string;
  invitationId: string;
  clubId: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: string;
}

const demoSessions: ClubInvitationSession[] = [];

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function parseSessionToken(token: string | undefined): { id: string; secret: string } | null {
  if (!token) return null;
  const separator = token.indexOf(".");
  if (separator <= 0 || separator === token.length - 1) return null;
  const id = token.slice(0, separator);
  const secret = token.slice(separator + 1);
  if (!/^invitation_session_[0-9a-f-]{36}$/.test(id) || !/^[A-Za-z0-9_-]{40,64}$/.test(secret)) {
    return null;
  }
  return { id, secret };
}

function secretMatches(expectedHash: string, secret: string): boolean {
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(hashSecret(secret), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function clubInvitationSessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
    priority: "high" as const,
  };
}

export async function createClubInvitationSession({
  clubId,
  userId,
  invitationToken,
  now = new Date(),
}: {
  clubId: string;
  userId: string;
  invitationToken: string;
  now?: Date;
}): Promise<{ token: string; expiresAt: Date } | null> {
  const invitation = await resolveClubInvitation(clubId, invitationToken, now.toISOString());
  if (!invitation) return null;

  const id = `invitation_session_${randomUUID()}`;
  const secret = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Math.min(
    now.getTime() + SESSION_LIFETIME_MS,
    Date.parse(invitation.expiresAt),
  ));
  const session: ClubInvitationSession = {
    id,
    invitationId: invitation.id,
    clubId,
    userId,
    tokenHash: hashSecret(secret),
    expiresAt,
    createdAt: now.toISOString(),
  };
  if (integrations.mongo) {
    await (await getDb()).collection<ClubInvitationSession>("clubInvitationSessions").insertOne(session);
  } else {
    demoSessions.push(session);
  }
  return { token: `${id}.${secret}`, expiresAt };
}

export async function validateClubInvitationSession({
  clubId,
  userId,
  sessionToken,
  now = new Date(),
}: {
  clubId: string;
  userId: string;
  sessionToken: string | undefined;
  now?: Date;
}): Promise<boolean> {
  const parsed = parseSessionToken(sessionToken);
  if (!parsed) return false;
  const session = integrations.mongo
    ? await (await getDb()).collection<ClubInvitationSession>("clubInvitationSessions").findOne({
        id: parsed.id,
        clubId,
        userId,
      })
    : demoSessions.find((candidate) => (
        candidate.id === parsed.id
        && candidate.clubId === clubId
        && candidate.userId === userId
      )) ?? null;
  if (!session || !secretMatches(session.tokenHash, parsed.secret) || session.expiresAt <= now) {
    return false;
  }
  const invitation = await getActiveClubInvitation(clubId, now.toISOString());
  return invitation?.id === session.invitationId;
}

export async function revokeClubInvitationSession(sessionToken: string | undefined): Promise<void> {
  const parsed = parseSessionToken(sessionToken);
  if (!parsed) return;
  if (integrations.mongo) {
    await (await getDb()).collection<ClubInvitationSession>("clubInvitationSessions").deleteOne({ id: parsed.id });
    return;
  }
  const index = demoSessions.findIndex((candidate) => candidate.id === parsed.id);
  if (index >= 0) demoSessions.splice(index, 1);
}
