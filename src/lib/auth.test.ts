import { beforeEach, describe, expect, it, vi } from "vitest";

const clerk = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  redirectToSignIn: vi.fn(),
}));

const nextNavigation = vi.hoisted(() => ({
  redirect: vi.fn(),
}));

const runtime = vi.hoisted(() => ({
  mongo: false,
}));

const database = vi.hoisted(() => ({
  getDb: vi.fn(),
  findOne: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: clerk.auth,
  currentUser: clerk.currentUser,
}));

vi.mock("next/navigation", () => ({
  redirect: nextNavigation.redirect,
}));

vi.mock("@/lib/env", () => ({
  authentication: {
    mode: "clerk",
    issues: [],
  },
  assertValidAuthenticationConfiguration: vi.fn(),
  integrations: {
    clerk: true,
    get mongo() {
      return runtime.mongo;
    },
  },
}));

vi.mock("@/lib/db", () => ({
  getDb: database.getDb,
}));

import { getViewer, requireViewer } from "@/lib/auth";

describe("requireViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtime.mongo = false;
    database.getDb.mockResolvedValue({
      collection: vi.fn(() => ({
        findOne: database.findOne,
        updateOne: database.updateOne,
      })),
    });
    database.updateOne.mockResolvedValue({ matchedCount: 1 });
    clerk.redirectToSignIn.mockImplementation(() => {
      throw new Error("CLERK_REDIRECT");
    });
    clerk.auth.mockResolvedValue({
      userId: null,
      redirectToSignIn: clerk.redirectToSignIn,
    });
  });

  it("lets Clerk preserve the requested app URL when authentication is required", async () => {
    await expect(requireViewer()).rejects.toThrow("CLERK_REDIRECT");

    expect(clerk.redirectToSignIn).toHaveBeenCalledOnce();
    expect(clerk.redirectToSignIn).toHaveBeenCalledWith();
    expect(nextNavigation.redirect).not.toHaveBeenCalled();
  });

  it("uses a stable quirky name when an SSO identity has no first or last name", async () => {
    clerk.auth.mockResolvedValue({
      userId: "user_sso_without_name",
      has: vi.fn(() => false),
    });
    clerk.currentUser.mockResolvedValue({
      id: "user_sso_without_name",
      firstName: null,
      lastName: null,
      username: "plain-sso-username",
      imageUrl: "https://example.com/avatar.png",
      primaryEmailAddress: { emailAddress: "listener@example.com" },
      privateMetadata: {},
      createdAt: Date.parse("2026-07-30T12:00:00.000Z"),
    });

    const firstViewer = await getViewer();
    const secondViewer = await getViewer();

    expect(firstViewer?.profile.displayName).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    expect(firstViewer?.profile.displayName).not.toBe("plain-sso-username");
    expect(firstViewer?.profile.displayName).not.toBe("Dropday member");
    expect(secondViewer?.profile.displayName).toBe(firstViewer?.profile.displayName);
    expect(firstViewer?.profile.generatedNameKey).toBe(
      `quirky:${firstViewer?.profile.displayName.toLowerCase()}`,
    );
  });

  it("does not overwrite stored billing state from stale Clerk session claims", async () => {
    runtime.mongo = true;
    clerk.auth.mockResolvedValue({
      userId: "user_1",
      has: vi.fn(({ plan }: { plan?: string }) => plan === "resident_unlimited"),
    });
    clerk.currentUser.mockResolvedValue({
      id: "user_1",
      firstName: "Current",
      lastName: "Listener",
      imageUrl: "https://example.com/new-avatar.png",
      primaryEmailAddress: { emailAddress: "listener@example.com" },
      privateMetadata: {},
      createdAt: Date.parse("2026-07-30T12:00:00.000Z"),
    });
    const storedProfile = {
      id: "user_1",
      clerkUserId: "user_1",
      firstName: "Old",
      lastName: "Name",
      displayName: "Old Name",
      initials: "ON",
      imageUrl: "https://example.com/old-avatar.png",
      primaryEmail: "listener@example.com",
      billedPlan: "free",
      plan: "free",
      emailNotifications: true,
      themePreference: "system",
      skinPreference: "classic",
      createdAt: "2026-07-30T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
    };
    database.findOne.mockImplementation(async () => ({ ...storedProfile }));

    const viewer = await getViewer();

    expect(viewer?.profile).toMatchObject({ billedPlan: "free", plan: "free" });
    expect(database.updateOne).toHaveBeenCalledOnce();
    const update = database.updateOne.mock.calls[0]?.[1];
    expect(update.$set).not.toHaveProperty("billedPlan");
    expect(update.$set).not.toHaveProperty("plan");
    expect(update.$setOnInsert).toMatchObject({ billedPlan: "highest", plan: "highest" });
  });

  it("initializes billing state from Clerk claims when inserting a profile", async () => {
    runtime.mongo = true;
    clerk.auth.mockResolvedValue({
      userId: "user_new",
      has: vi.fn(({ plan }: { plan?: string }) => plan === "resident"),
    });
    clerk.currentUser.mockResolvedValue({
      id: "user_new",
      firstName: "New",
      lastName: "Resident",
      imageUrl: "https://example.com/avatar.png",
      primaryEmailAddress: { emailAddress: "new@example.com" },
      privateMetadata: {},
      createdAt: Date.parse("2026-09-17T12:00:00.000Z"),
    });
    database.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "user_new",
        clerkUserId: "user_new",
        firstName: "New",
        lastName: "Resident",
        displayName: "New Resident",
        initials: "NR",
        billedPlan: "middle",
        plan: "middle",
        emailNotifications: true,
        themePreference: "system",
        skinPreference: "classic",
        createdAt: "2026-09-17T12:00:00.000Z",
        updatedAt: "2026-09-17T12:00:00.000Z",
      });

    const viewer = await getViewer();

    expect(viewer?.profile).toMatchObject({ billedPlan: "middle", plan: "middle" });
    expect(database.updateOne.mock.calls[0]?.[1].$setOnInsert).toMatchObject({
      billedPlan: "middle",
      plan: "middle",
    });
  });
});
