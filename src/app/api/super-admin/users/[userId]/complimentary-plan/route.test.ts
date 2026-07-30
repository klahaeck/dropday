import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getViewer: vi.fn(),
  clerkClient: vi.fn(),
  updateUserMetadata: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getViewer: mocks.getViewer,
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: mocks.clerkClient,
}));

import { PATCH } from "@/app/api/super-admin/users/[userId]/complimentary-plan/route";

function request(body: unknown) {
  return new Request("http://localhost/api/super-admin/users/user_target/complimentary-plan", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function update(body: unknown, userId = "user_target") {
  return PATCH(request(body), { params: Promise.resolve({ userId }) });
}

describe("complimentary-plan administration route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clerkClient.mockResolvedValue({
      users: { updateUserMetadata: mocks.updateUserMetadata },
    });
    mocks.updateUserMetadata.mockResolvedValue({ id: "user_target" });
  });

  it("requires authentication", async () => {
    mocks.getViewer.mockResolvedValue(null);

    const response = await update({ complimentaryPlan: "resident" });

    expect(response.status).toBe(401);
    expect(mocks.updateUserMetadata).not.toHaveBeenCalled();
  });

  it("requires the private-metadata super admin entitlement", async () => {
    mocks.getViewer.mockResolvedValue({ isSuperAdmin: false });

    const response = await update({ complimentaryPlan: "resident" });

    expect(response.status).toBe(403);
    expect(mocks.updateUserMetadata).not.toHaveBeenCalled();
  });

  it("deep-merges a valid complimentary plan into Clerk private metadata", async () => {
    mocks.getViewer.mockResolvedValue({ isSuperAdmin: true });

    const response = await update({ complimentaryPlan: "resident_unlimited" });

    expect(response.status).toBe(200);
    expect(mocks.updateUserMetadata).toHaveBeenCalledWith("user_target", {
      privateMetadata: { complimentaryPlan: "resident_unlimited" },
    });
    await expect(response.json()).resolves.toEqual({
      userId: "user_target",
      complimentaryPlan: "resident_unlimited",
    });
  });

  it("removes only the complimentary plan metadata key", async () => {
    mocks.getViewer.mockResolvedValue({ isSuperAdmin: true });

    const response = await update({ complimentaryPlan: null });

    expect(response.status).toBe(200);
    expect(mocks.updateUserMetadata).toHaveBeenCalledWith("user_target", {
      privateMetadata: { complimentaryPlan: null },
    });
  });

  it("rejects unrecognized Clerk plan keys", async () => {
    mocks.getViewer.mockResolvedValue({ isSuperAdmin: true });

    const response = await update({ complimentaryPlan: "highest" });

    expect(response.status).toBe(400);
    expect(mocks.updateUserMetadata).not.toHaveBeenCalled();
  });
});
