import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireViewer: vi.fn(),
  consumeRateLimit: vi.fn(),
  canUseClubManagement: vi.fn(),
  getClubBySlug: vi.fn(),
  getClubMemberships: vi.fn(),
  restoreClubBackup: vi.fn(),
  retireClubBackup: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireViewer: mocks.requireViewer }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: mocks.consumeRateLimit }));
vi.mock("@/lib/club-management", () => ({ canUseClubManagement: mocks.canUseClubManagement }));
vi.mock("@/lib/repository", () => ({
  getClubBySlug: mocks.getClubBySlug,
  getClubMemberships: mocks.getClubMemberships,
}));
vi.mock("@/lib/club-backups", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/club-backups")>();
  return {
    ...actual,
    restoreClubBackup: mocks.restoreClubBackup,
    retireClubBackup: mocks.retireClubBackup,
  };
});

import { PATCH } from "@/app/api/clubs/[slug]/backups/[backupId]/route";
import { ClubBackupError } from "@/lib/club-backups";

function restore(body: unknown = { action: "restore" }) {
  return PATCH(new Request("http://localhost/api/clubs/club-one/backups/backup-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ slug: "club-one", backupId: "backup-1" }) });
}

describe("backup restore route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireViewer.mockResolvedValue({
      profile: { id: "admin-1" },
      features: { clubAdminTools: true, backupPlaylists: true },
    });
    mocks.getClubBySlug.mockResolvedValue({ id: "club-1" });
    mocks.getClubMemberships.mockResolvedValue([{ userId: "admin-1" }]);
    mocks.canUseClubManagement.mockReturnValue(true);
    mocks.consumeRateLimit.mockResolvedValue(true);
    mocks.restoreClubBackup.mockResolvedValue({ id: "backup-1", status: "available" });
  });

  it("restores an authorized retired backup", async () => {
    const response = await restore();
    expect(response.status).toBe(200);
    expect(mocks.restoreClubBackup).toHaveBeenCalledWith({
      clubSlug: "club-one",
      backupId: "backup-1",
      actorUserId: "admin-1",
    });
    await expect(response.json()).resolves.toMatchObject({
      backup: { id: "backup-1", status: "available" },
    });
  });

  it("rejects malformed and unauthorized restore attempts", async () => {
    const malformed = await restore({ action: "publish" });
    expect(malformed.status).toBe(400);
    mocks.canUseClubManagement.mockReturnValue(false);
    const unauthorized = await restore();
    expect(unauthorized.status).toBe(403);
    expect(mocks.restoreClubBackup).not.toHaveBeenCalled();
  });

  it("preserves service conflict responses for used and duplicate backups", async () => {
    mocks.restoreClubBackup.mockRejectedValueOnce(new ClubBackupError(
      "A used backup cannot be restored.",
      409,
    ));
    const used = await restore();
    expect(used.status).toBe(409);

    mocks.restoreClubBackup.mockRejectedValueOnce(new ClubBackupError(
      "That playlist is already represented by an available backup.",
      409,
    ));
    const duplicate = await restore();
    expect(duplicate.status).toBe(409);
  });
});
