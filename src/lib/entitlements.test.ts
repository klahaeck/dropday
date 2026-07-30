import { describe, expect, it } from "vitest";
import {
  CLERK_FEATURES,
  complimentaryPlanFromPrivateMetadata,
  featureAccessForPlan,
  featureAccessFromClerkChecks,
  getMembershipEntitlement,
  getOwnershipEntitlement,
  highestPlan,
  isComplimentaryPlanKey,
  planFromClerkChecks,
  planFromPrivateMetadata,
} from "@/lib/entitlements";

describe("membership entitlements", () => {
  it("allows a free user to activate memberships until the third is active", () => {
    expect(getMembershipEntitlement("free", 0).canActivateMembership).toBe(true);
    expect(getMembershipEntitlement("free", 2).canActivateMembership).toBe(true);
    expect(getMembershipEntitlement("free", 3)).toMatchObject({ canActivateMembership: false, joinLimit: 3 });
  });

  it("grandfathers existing memberships without allowing another", () => {
    expect(getMembershipEntitlement("free", 6)).toMatchObject({
      isGrandfathered: true,
      canActivateMembership: false,
      blockedReason: "free-membership-limit",
    });
  });

  it("gives every paid plan unlimited memberships", () => {
    for (const plan of ["entry", "middle", "highest"] as const) {
      expect(getMembershipEntitlement(plan, 500)).toMatchObject({ joinLimit: null, canActivateMembership: true });
    }
  });

  it("lets a Clerk feature override the plan-derived membership limit", () => {
    expect(getMembershipEntitlement("entry", 3, false)).toMatchObject({ joinLimit: 3, canActivateMembership: false });
    expect(getMembershipEntitlement("free", 300, true)).toMatchObject({ joinLimit: null, canActivateMembership: true });
  });
});

describe("ownership entitlements", () => {
  it("never allows a free user to own a club", () => {
    expect(getOwnershipEntitlement("free", 0)).toMatchObject({ ownedClubLimit: 0, canOwnAnotherClub: false });
  });

  it("enforces paid tier ownership limits", () => {
    expect(getOwnershipEntitlement("entry", 0).canOwnAnotherClub).toBe(true);
    expect(getOwnershipEntitlement("entry", 1).canOwnAnotherClub).toBe(false);
    expect(getOwnershipEntitlement("middle", 4).availableCapacity).toBe(1);
    expect(getOwnershipEntitlement("highest", 200).canOwnAnotherClub).toBe(true);
  });

  it("uses the highest matching Clerk plan", () => {
    expect(planFromClerkChecks((plan) => ["selector", "resident"].includes(plan))).toBe("middle");
  });

  it("can infer the plan from stable Clerk ownership features", () => {
    expect(planFromClerkChecks(() => false, (feature) => feature === CLERK_FEATURES.ownUnlimitedClubs)).toBe("highest");
  });
});

describe("complimentary plans", () => {
  it("maps existing Clerk plan keys from private metadata", () => {
    expect(planFromPrivateMetadata({ complimentaryPlan: "free_user" })).toBe("free");
    expect(planFromPrivateMetadata({ complimentaryPlan: "selector" })).toBe("entry");
    expect(planFromPrivateMetadata({ complimentaryPlan: "resident" })).toBe("middle");
    expect(planFromPrivateMetadata({ complimentaryPlan: "resident_unlimited" })).toBe("highest");
  });

  it("accepts configured plan keys without case sensitivity", () => {
    expect(planFromPrivateMetadata({ complimentaryPlan: "Selector" })).toBe("entry");
    expect(planFromPrivateMetadata({ complimentaryPlan: "RESIDENT_UNLIMITED" })).toBe("highest");
  });

  it("returns the Clerk metadata key for administration", () => {
    expect(complimentaryPlanFromPrivateMetadata({ complimentaryPlan: "Resident" })).toBe("resident");
    expect(complimentaryPlanFromPrivateMetadata({ complimentaryPlan: "unknown" })).toBeNull();
    expect(isComplimentaryPlanKey("resident_unlimited")).toBe(true);
    expect(isComplimentaryPlanKey("highest")).toBe(false);
  });

  it("ignores unknown or malformed private metadata plans", () => {
    expect(planFromPrivateMetadata({ complimentaryPlan: "admin" })).toBeNull();
    expect(planFromPrivateMetadata({ complimentaryPlan: "highest" })).toBeNull();
    expect(planFromPrivateMetadata({ complimentaryRole: "resident_unlimited" })).toBeNull();
    expect(planFromPrivateMetadata({ role: "resident_unlimited" })).toBeNull();
    expect(planFromPrivateMetadata({ plan: "resident_unlimited" })).toBeNull();
    expect(planFromPrivateMetadata(null)).toBeNull();
  });

  it("uses the higher of the billed and complimentary plans", () => {
    expect(highestPlan("free", "middle")).toBe("middle");
    expect(highestPlan("highest", "entry")).toBe("highest");
  });

  it("grants every feature of a complimentary plan", () => {
    const access = featureAccessFromClerkChecks(
      (feature) => feature === CLERK_FEATURES.playlistLibrary,
      "free",
      "middle",
    );
    expect(access).toMatchObject({
      unlimitedMemberships: true,
      ownFiveClubs: true,
      clubAdminTools: true,
      ownershipTransfer: true,
    });
  });
});

describe("product feature access", () => {
  it("matches the demo pricing tiers", () => {
    expect(featureAccessForPlan("free")).toMatchObject({
      playlistLibrary: true,
      clubChat: true,
      unlimitedMemberships: false,
      ownOneClub: false,
    });
    expect(featureAccessForPlan("entry")).toMatchObject({
      unlimitedMemberships: true,
      ownOneClub: true,
      clubAdminTools: true,
      ownershipTransfer: false,
    });
    expect(featureAccessForPlan("middle")).toMatchObject({
      ownFiveClubs: true,
      ownershipTransfer: true,
      ownershipRecovery: true,
    });
  });

  it("uses the plan fallback until Clerk features exist", () => {
    expect(featureAccessFromClerkChecks(() => false, "entry").ownOneClub).toBe(true);
  });

  it("treats Clerk as the source of truth once a known feature exists", () => {
    const access = featureAccessFromClerkChecks(
      (feature) => feature === CLERK_FEATURES.playlistLibrary,
      "highest",
    );
    expect(access.playlistLibrary).toBe(true);
    expect(access.ownUnlimitedClubs).toBe(false);
  });
});
