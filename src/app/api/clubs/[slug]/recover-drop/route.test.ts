import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireViewer: vi.fn(),
  consumeRateLimit: vi.fn(),
  canUseClubManagement: vi.fn(),
  getClubBySlug: vi.fn(),
  getClubMemberships: vi.fn(),
  recoverOverdueDropWithBackup: vi.fn(),
  recordDropTriggerRunIds: vi.fn(),
  scheduleDropTasks: vi.fn(),
  dispatchOutbox: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireViewer: mocks.requireViewer }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: mocks.consumeRateLimit }));
vi.mock("@/lib/club-management", () => ({ canUseClubManagement: mocks.canUseClubManagement }));
vi.mock("@/lib/repository", () => ({
  getClubBySlug: mocks.getClubBySlug,
  getClubMemberships: mocks.getClubMemberships,
}));
vi.mock("@/lib/drop-attachment", () => ({
  recordDropTriggerRunIds: mocks.recordDropTriggerRunIds,
}));
vi.mock("@/lib/scheduler", () => ({
  scheduleDropTasks: mocks.scheduleDropTasks,
  dispatchOutbox: mocks.dispatchOutbox,
}));
vi.mock("@/lib/club-backups", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/club-backups")>();
  return { ...actual, recoverOverdueDropWithBackup: mocks.recoverOverdueDropWithBackup };
});

import { POST } from "@/app/api/clubs/[slug]/recover-drop/route";

function recover(body: unknown) {
  return POST(new Request("http://localhost/api/clubs/club-one/recover-drop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ slug: "club-one" }) });
}

describe("recover overdue drop route", () => {
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
    mocks.scheduleDropTasks.mockResolvedValue([]);
    mocks.dispatchOutbox.mockResolvedValue(undefined);
    mocks.recoverOverdueDropWithBackup.mockResolvedValue({
      club: { schedule: { reminderOffsetsMinutes: [60] } },
      drop: { id: "drop-1" },
      backup: { id: "backup-1", status: "used" },
      outbox: { id: "outbox-1", idempotencyKey: "drop-1" },
    });
  });

  it("rejects absent or wrong reviewed intent before mutation", async () => {
    const absent = await recover({ backupId: "backup-1", queueEffect: "preserveTurn" });
    const wrong = await recover({
      backupId: "backup-1",
      queueEffect: "preserveTurn",
      reviewedAction: "publish-late",
    });
    expect(absent.status).toBe(400);
    expect(wrong.status).toBe(400);
    expect(mocks.recoverOverdueDropWithBackup).not.toHaveBeenCalled();
  });

  it("commits only the explicitly reviewed backup publication", async () => {
    const response = await recover({
      backupId: "backup-1",
      queueEffect: "preserveTurn",
      reviewedAction: "publish-backup",
    });
    expect(response.status).toBe(200);
    expect(mocks.recoverOverdueDropWithBackup).toHaveBeenCalledWith({
      clubSlug: "club-one",
      backupId: "backup-1",
      actorUserId: "admin-1",
      queueEffect: "preserveTurn",
      reviewedAction: "publish-backup",
    });
  });
});
