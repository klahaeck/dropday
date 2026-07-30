import { beforeEach, describe, expect, it, vi } from "vitest";

const clerk = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  redirectToSignIn: vi.fn(),
}));

const nextNavigation = vi.hoisted(() => ({
  redirect: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: clerk.auth,
  currentUser: clerk.currentUser,
}));

vi.mock("next/navigation", () => ({
  redirect: nextNavigation.redirect,
}));

vi.mock("@/lib/env", () => ({
  integrations: {
    clerk: true,
    mongo: false,
  },
}));

import { getViewer, requireViewer } from "@/lib/auth";

describe("requireViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
