import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  integrations: { mongo: false },
}));

import {
  getActiveClubInvitation,
  revokeActiveClubInvitation,
  rotateClubInvitation,
  validateClubInvitation,
} from "@/lib/club-invitations";

describe("private club invitations", () => {
  it("stores only a hash and invalidates the previous link on rotation", async () => {
    const clubId = "club-invitation-rotation";
    const timestamp = "2026-09-17T12:00:00.000Z";
    const first = await rotateClubInvitation(clubId, "owner-1", timestamp);

    expect(first.invitation.tokenHash).not.toContain(first.token);
    await expect(validateClubInvitation(clubId, first.token, timestamp)).resolves.toBe(true);

    const second = await rotateClubInvitation(clubId, "owner-1", timestamp);
    await expect(validateClubInvitation(clubId, first.token, timestamp)).resolves.toBe(false);
    await expect(validateClubInvitation(clubId, second.token, timestamp)).resolves.toBe(true);
  });

  it("revokes active links and rejects malformed or cross-club tokens", async () => {
    const clubId = "club-invitation-revoke";
    const rotated = await rotateClubInvitation(clubId, "owner-1", "2026-09-17T12:00:00.000Z");

    await expect(validateClubInvitation("another-club", rotated.token)).resolves.toBe(false);
    await expect(validateClubInvitation(clubId, "not-a-token")).resolves.toBe(false);
    await expect(revokeActiveClubInvitation(clubId)).resolves.toBe(true);
    await expect(validateClubInvitation(clubId, rotated.token)).resolves.toBe(false);
  });

  it("expires links after fourteen days", async () => {
    const clubId = "club-invitation-expiry";
    const rotated = await rotateClubInvitation(clubId, "owner-1", "2026-09-01T12:00:00.000Z");

    await expect(validateClubInvitation(clubId, rotated.token, "2026-09-16T12:00:00.000Z"))
      .resolves.toBe(false);
    await expect(getActiveClubInvitation(clubId, "2026-09-16T12:00:00.000Z"))
      .resolves.toBeNull();
  });
});
