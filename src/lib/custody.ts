import { DateTime } from "luxon";
import type { Club, OwnershipCustody } from "@/types/domain";

export const CUSTODY_GRACE_DAYS = 7;

export function enterSystemCustody(
  club: Club,
  now = new Date(),
  reason: "plan-ended" | "tier-downgrade" = "plan-ended",
): OwnershipCustody {
  const currentOwnerId = club.custody.activeOwnerId;
  return {
    status: "grace",
    activeOwnerId: null,
    recoveryClaimantId: currentOwnerId,
    reason,
    graceEndsAt: DateTime.fromJSDate(now).plus({ days: CUSTODY_GRACE_DAYS }).toUTC().toISO() ?? undefined,
  };
}

export function archiveExpiredCustody(
  custody: OwnershipCustody,
  now = new Date(),
): OwnershipCustody {
  if (custody.status !== "grace" || !custody.graceEndsAt) return custody;
  if (DateTime.fromISO(custody.graceEndsAt) > DateTime.fromJSDate(now)) return custody;
  return {
    ...custody,
    status: "archived",
    activeOwnerId: null,
    archivedAt: DateTime.fromJSDate(now).toUTC().toISO() ?? undefined,
  };
}

export function restoreOwnership(
  custody: OwnershipCustody,
  newOwnerId: string,
): OwnershipCustody {
  return {
    status: "active",
    activeOwnerId: newOwnerId,
    recoveryClaimantId: null,
  };
}
