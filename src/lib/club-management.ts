import type { ClubMembership } from "@/types/domain";

/**
 * Club admins operate under the owning club's paid management entitlement.
 * Owners still need the relevant personal plan feature, while ordinary members
 * never receive management access from their plan alone.
 */
export function canUseClubManagement(
  membership: ClubMembership | null | undefined,
  ownerHasFeatureAccess: boolean,
): boolean {
  if (!membership || membership.status !== "active" || membership.role === "member") {
    return false;
  }
  return membership.role === "admin" || ownerHasFeatureAccess;
}
