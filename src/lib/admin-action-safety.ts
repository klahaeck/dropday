import type { ClubRole } from "@/types/domain";

const roleRank: Record<ClubRole, number> = {
  owner: 3,
  admin: 2,
  member: 1,
};

function roleLabel(role: ClubRole) {
  return role === "owner" ? "owner" : role === "admin" ? "admin" : "member";
}

export function isDownwardRoleChange(from: ClubRole, to: ClubRole) {
  return roleRank[to] < roleRank[from];
}

export function roleChangeConfirmation({
  memberName,
  from,
  to,
}: {
  memberName: string;
  from: ClubRole;
  to: ClubRole;
}) {
  if (!isDownwardRoleChange(from, to)) return undefined;
  return {
    title: `Change ${memberName}’s role?`,
    description: `${memberName} will change from ${roleLabel(from)} to ${roleLabel(to)} and lose the permissions that come with the ${roleLabel(from)} role.`,
    confirmLabel: `Make ${roleLabel(to)}`,
  };
}

export function ownershipTransferConfirmation(memberName: string) {
  return {
    title: `Transfer ownership to ${memberName}?`,
    description: `${memberName} will become the primary owner with control over ownership and recovery. You will become an admin and lose owner-only permissions.`,
    confirmLabel: "Transfer ownership",
  };
}

export function freeformConfirmation(themeName?: string) {
  return {
    title: "Switch this club to freeform?",
    description: `${themeName ? `“${themeName}”` : "The current theme"} will stop guiding new playlists, but it will stay saved and can be activated again later.`,
    confirmLabel: "Use no theme",
  };
}

export function backupRetirementConfirmation(title: string) {
  return {
    title: `Remove “${title}” from the backup crate?`,
    description: "This backup will no longer be available for an overdue drop. You can undo the removal from backup history.",
    confirmLabel: "Remove backup",
  };
}

export function reconcileBackupStatus<T extends {
  id: string;
  status: "available" | "used" | "retired";
}>(
  backups: T[],
  event:
    | { type: "retire-success"; backupId: string }
    | { type: "restore-success"; backupId: string }
    | { type: "restore-failure"; backupId: string },
) {
  if (event.type === "restore-failure") return backups;
  const status = event.type === "retire-success" ? "retired" : "available";
  return backups.map((backup) => backup.id === event.backupId
    ? { ...backup, status }
    : backup);
}
