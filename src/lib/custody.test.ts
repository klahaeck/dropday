import { describe, expect, it } from "vitest";
import { archiveExpiredCustody, enterSystemCustody, restoreOwnership } from "@/lib/custody";
import { demoClubs } from "@/lib/demo-data";

describe("ownership custody", () => {
  it("removes active ownership immediately when paid entitlement is lost", () => {
    const custody = enterSystemCustody(demoClubs[0], new Date("2026-07-01T12:00:00Z"));
    expect(custody).toMatchObject({
      status: "grace",
      activeOwnerId: null,
      recoveryClaimantId: "user-lena",
      graceEndsAt: "2026-07-08T12:00:00.000Z",
    });
  });

  it("archives expired custody without assigning ownership to a free user", () => {
    const grace = enterSystemCustody(demoClubs[0], new Date("2026-07-01T12:00:00Z"));
    const archived = archiveExpiredCustody(grace, new Date("2026-07-09T12:00:00Z"));
    expect(archived.status).toBe("archived");
    expect(archived.activeOwnerId).toBeNull();
    expect(archived.recoveryClaimantId).toBe("user-lena");
  });

  it("restores ownership only through an explicit eligible owner", () => {
    const grace = enterSystemCustody(demoClubs[0]);
    expect(restoreOwnership(grace, "paid-admin")).toEqual({
      status: "active",
      activeOwnerId: "paid-admin",
      recoveryClaimantId: null,
    });
  });
});
