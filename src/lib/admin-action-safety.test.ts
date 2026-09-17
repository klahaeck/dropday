import { describe, expect, it } from "vitest";
import {
  backupRetirementConfirmation,
  freeformConfirmation,
  isDownwardRoleChange,
  ownershipTransferConfirmation,
  reconcileBackupStatus,
  roleChangeConfirmation,
} from "@/lib/admin-action-safety";

describe("admin action safety", () => {
  it("requires confirmation only for role demotions", () => {
    expect(isDownwardRoleChange("owner", "admin")).toBe(true);
    expect(isDownwardRoleChange("admin", "member")).toBe(true);
    expect(isDownwardRoleChange("member", "admin")).toBe(false);
    expect(isDownwardRoleChange("owner", "owner")).toBe(false);
    expect(roleChangeConfirmation({ memberName: "Mina", from: "member", to: "admin" }))
      .toBeUndefined();
    expect(roleChangeConfirmation({ memberName: "Mina", from: "owner", to: "admin" }))
      .toMatchObject({ confirmLabel: "Make admin" });
  });

  it("describes ownership, freeform, and backup consequences", () => {
    expect(ownershipTransferConfirmation("Mina").description).toMatch(/You will become an admin/i);
    expect(freeformConfirmation("Night drive").description).toMatch(/stay saved/i);
    expect(backupRetirementConfirmation("Emergency grooves").description).toMatch(/undo/i);
  });

  it("reconciles remove, undo, and failed undo without inventing state", () => {
    const available = [{ id: "backup-1", status: "available" as const }];
    const retired = reconcileBackupStatus(available, {
      type: "retire-success",
      backupId: "backup-1",
    });
    expect(retired[0].status).toBe("retired");
    const restored = reconcileBackupStatus(retired, {
      type: "restore-success",
      backupId: "backup-1",
    });
    expect(restored[0].status).toBe("available");
    const failed = reconcileBackupStatus(retired, {
      type: "restore-failure",
      backupId: "backup-1",
    });
    expect(failed).toBe(retired);
    expect(failed[0].status).toBe("retired");
  });
});
