import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireViewer: vi.fn(),
  consumeRateLimit: vi.fn(),
  attachPlaylistToDrop: vi.fn(),
  recordDropTriggerRunIds: vi.fn(),
  scheduleDropTasks: vi.fn(),
  dispatchOutbox: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireViewer: mocks.requireViewer }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: mocks.consumeRateLimit }));
vi.mock("@/lib/scheduler", () => ({
  scheduleDropTasks: mocks.scheduleDropTasks,
  dispatchOutbox: mocks.dispatchOutbox,
}));
vi.mock("@/lib/drop-attachment", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/drop-attachment")>();
  return {
    ...actual,
    attachPlaylistToDrop: mocks.attachPlaylistToDrop,
    recordDropTriggerRunIds: mocks.recordDropTriggerRunIds,
  };
});

import { PUT } from "@/app/api/drops/[dropId]/playlist/route";
import { DropAttachmentError } from "@/lib/drop-attachment";

function request(body: unknown) {
  return new Request("http://localhost/api/drops/drop-1/playlist", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function update(body: unknown) {
  return PUT(request(body), { params: Promise.resolve({ dropId: "drop-1" }) });
}

describe("drop playlist route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireViewer.mockResolvedValue({
      profile: { id: "user-1" },
      features: { playlistLibrary: true },
    });
    mocks.consumeRateLimit.mockResolvedValue(true);
    mocks.scheduleDropTasks.mockResolvedValue([]);
    mocks.attachPlaylistToDrop.mockResolvedValue({
      drop: { id: "drop-1", status: "scheduled" },
      club: { schedule: { reminderOffsetsMinutes: [60] } },
      demo: true,
      action: "attach",
      playlist: { title: "Headlights", sourceDraftId: "draft-1" },
    });
  });

  it("requires the reviewed consequence and current attachment", async () => {
    const response = await update({ draftId: "draft-1" });
    expect(response.status).toBe(400);
    expect(mocks.attachPlaylistToDrop).not.toHaveBeenCalled();
  });

  it("passes reviewed state to the authoritative mutation and returns canonical playlist state", async () => {
    const response = await update({
      draftId: "draft-1",
      reviewedAction: "attach",
      expectedCurrentDraftId: null,
    });
    expect(response.status).toBe(200);
    expect(mocks.attachPlaylistToDrop).toHaveBeenCalledWith({
      dropId: "drop-1",
      draftId: "draft-1",
      actorUserId: "user-1",
      reviewedAction: "attach",
      expectedCurrentDraftId: null,
    });
    await expect(response.json()).resolves.toMatchObject({
      action: "attach",
      playlist: { title: "Headlights", sourceDraftId: "draft-1" },
    });
  });

  it("returns 409 when reviewed state is stale", async () => {
    mocks.attachPlaylistToDrop.mockRejectedValue(new DropAttachmentError(
      "This drop changed after you reviewed it.",
      409,
    ));
    const response = await update({
      draftId: "draft-1",
      reviewedAction: "replace",
      expectedCurrentDraftId: "draft-old",
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "This drop changed after you reviewed it.",
    });
  });
});
