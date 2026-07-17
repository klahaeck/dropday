import type {
  MembershipEntitlement,
  OwnershipEntitlement,
  PlanKey,
} from "@/types/domain";

export const CLERK_FEATURES = {
  threeClubMemberships: "three_club_memberships",
  playlistLibrary: "playlist_library",
  clubChat: "club_and_drop_chat",
  reminders: "in_app_and_email_reminders",
  unlimitedMemberships: "unlimited_club_memberships",
  ownOneClub: "own_one_club",
  ownFiveClubs: "own_five_clubs",
  ownUnlimitedClubs: "own_unlimited_clubs",
  customSchedules: "custom_schedules",
  clubThemes: "club_themes",
  backupPlaylists: "backup_playlists",
  clubAdminTools: "club_admin_tools",
  ownershipTransfer: "ownership_transfer",
  ownershipRecovery: "ownership_recovery",
} as const;

export type ProductFeature = keyof typeof CLERK_FEATURES;
export type ProductFeatureAccess = Record<ProductFeature, boolean>;

const PLAN_PRIORITY: Record<PlanKey, number> = {
  free: 0,
  entry: 1,
  middle: 2,
  highest: 3,
};

const COMPLIMENTARY_PLAN_KEYS: Record<string, PlanKey> = {
  free_user: "free",
  selector: "entry",
  resident: "middle",
  resident_unlimited: "highest",
};

export const PLAN_ENTITLEMENTS: Record<
  PlanKey,
  { membershipLimit: number | null; ownedClubLimit: number | null }
> = {
  free: { membershipLimit: 3, ownedClubLimit: 0 },
  entry: { membershipLimit: null, ownedClubLimit: 1 },
  middle: { membershipLimit: null, ownedClubLimit: 5 },
  highest: { membershipLimit: null, ownedClubLimit: null },
};

export function planFromPrivateMetadata(metadata: unknown): PlanKey | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const complimentaryPlan = (metadata as Record<string, unknown>).complimentaryPlan;
  if (typeof complimentaryPlan !== "string") return null;

  const normalizedPlan = complimentaryPlan.trim().toLowerCase();
  return COMPLIMENTARY_PLAN_KEYS[normalizedPlan] ?? null;
}

export function highestPlan(...plans: Array<PlanKey | null | undefined>): PlanKey {
  return plans.reduce<PlanKey>(
    (highest, plan) => plan && PLAN_PRIORITY[plan] > PLAN_PRIORITY[highest] ? plan : highest,
    "free",
  );
}

export function getMembershipEntitlement(
  plan: PlanKey,
  activeMembershipCount: number,
  hasUnlimitedMemberships = PLAN_ENTITLEMENTS[plan].membershipLimit === null,
): MembershipEntitlement {
  const joinLimit = hasUnlimitedMemberships
    ? null
    : PLAN_ENTITLEMENTS.free.membershipLimit;
  const hasSpace = joinLimit === null || activeMembershipCount < joinLimit;
  const isGrandfathered = joinLimit !== null && activeMembershipCount > joinLimit;

  return {
    activeMembershipCount,
    joinLimit,
    isGrandfathered,
    canActivateMembership: hasSpace,
    blockedReason: hasSpace ? undefined : "free-membership-limit",
  };
}

export function getOwnershipEntitlement(
  plan: PlanKey,
  ownedClubCount: number,
): OwnershipEntitlement {
  const ownedClubLimit = PLAN_ENTITLEMENTS[plan].ownedClubLimit;
  const availableCapacity =
    ownedClubLimit === null ? null : Math.max(ownedClubLimit - ownedClubCount, 0);

  return {
    plan,
    ownedClubLimit,
    ownedClubCount,
    availableCapacity,
    canOwnAnotherClub: ownedClubLimit === null || ownedClubCount < ownedClubLimit,
  };
}

export function featureAccessForPlan(plan: PlanKey): ProductFeatureAccess {
  const isPaid = plan !== "free";
  const isResident = plan === "middle" || plan === "highest";

  return {
    threeClubMemberships: plan === "free",
    playlistLibrary: true,
    clubChat: true,
    reminders: true,
    unlimitedMemberships: isPaid,
    ownOneClub: plan === "entry",
    ownFiveClubs: plan === "middle",
    ownUnlimitedClubs: plan === "highest",
    customSchedules: isPaid,
    clubThemes: isPaid,
    backupPlaylists: isPaid,
    clubAdminTools: isPaid,
    ownershipTransfer: isResident,
    ownershipRecovery: isResident,
  };
}

export function featureAccessFromClerkChecks(
  check: (feature: string) => boolean,
  fallbackPlan: PlanKey,
  complimentaryPlan?: PlanKey | null,
): ProductFeatureAccess {
  const effectivePlan = highestPlan(fallbackPlan, complimentaryPlan);
  if (effectivePlan !== fallbackPlan) return featureAccessForPlan(effectivePlan);

  const access = Object.fromEntries(
    Object.entries(CLERK_FEATURES).map(([feature, key]) => [feature, check(key)]),
  ) as ProductFeatureAccess;

  // Keeps existing Clerk plans usable while the feature catalog is rolled out.
  // Once any known feature is present, Clerk becomes the source of truth.
  return Object.values(access).some(Boolean)
    ? access
    : featureAccessForPlan(fallbackPlan);
}

export function planFromClerkChecks(
  checkPlan: (plan: string) => boolean,
  checkFeature: (feature: string) => boolean = () => false,
): PlanKey {
  if (checkPlan("resident_unlimited") || checkFeature(CLERK_FEATURES.ownUnlimitedClubs)) return "highest";
  if (checkPlan("resident") || checkFeature(CLERK_FEATURES.ownFiveClubs)) return "middle";
  if (checkPlan("selector") || checkFeature(CLERK_FEATURES.ownOneClub)) return "entry";
  return "free";
}
