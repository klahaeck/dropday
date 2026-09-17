import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ integrations: { mongo: false } }));

import {
  createClubInvitationSession,
  revokeClubInvitationSession,
  validateClubInvitationSession,
} from "@/lib/club-invitation-sessions";
import { revokeActiveClubInvitation, rotateClubInvitation } from "@/lib/club-invitations";

describe("private club invitation sessions", () => {
  it("exchanges a long-lived invitation for a user-bound short session", async () => {
    const clubId = "club-session-user-bound";
    const now = new Date("2026-09-17T12:00:00.000Z");
    const invitation = await rotateClubInvitation(clubId, "owner-1", now.toISOString());
    const session = await createClubInvitationSession({
      clubId,
      userId: "user-1",
      invitationToken: invitation.token,
      now,
    });

    expect(session).not.toBeNull();
    expect(session!.expiresAt.toISOString()).toBe("2026-09-17T12:15:00.000Z");
    await expect(validateClubInvitationSession({
      clubId,
      userId: "user-1",
      sessionToken: session!.token,
      now: new Date("2026-09-17T12:10:00.000Z"),
    })).resolves.toBe(true);
    await expect(validateClubInvitationSession({
      clubId,
      userId: "user-2",
      sessionToken: session!.token,
      now: new Date("2026-09-17T12:10:00.000Z"),
    })).resolves.toBe(false);
  });

  it("expires, revokes, and invalidates sessions with their invitation", async () => {
    const clubId = "club-session-revocation";
    const now = new Date("2026-09-17T12:00:00.000Z");
    const invitation = await rotateClubInvitation(clubId, "owner-1", now.toISOString());
    const expiredSession = await createClubInvitationSession({
      clubId,
      userId: "user-1",
      invitationToken: invitation.token,
      now,
    });
    await expect(validateClubInvitationSession({
      clubId,
      userId: "user-1",
      sessionToken: expiredSession!.token,
      now: new Date("2026-09-17T12:16:00.000Z"),
    })).resolves.toBe(false);

    const revokedSession = await createClubInvitationSession({
      clubId,
      userId: "user-1",
      invitationToken: invitation.token,
      now,
    });
    await revokeClubInvitationSession(revokedSession!.token);
    await expect(validateClubInvitationSession({
      clubId,
      userId: "user-1",
      sessionToken: revokedSession!.token,
      now,
    })).resolves.toBe(false);

    const invalidatedSession = await createClubInvitationSession({
      clubId,
      userId: "user-1",
      invitationToken: invitation.token,
      now,
    });
    await revokeActiveClubInvitation(clubId, now.toISOString());
    await expect(validateClubInvitationSession({
      clubId,
      userId: "user-1",
      sessionToken: invalidatedSession!.token,
      now,
    })).resolves.toBe(false);
  });
});
