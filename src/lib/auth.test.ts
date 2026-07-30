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

import { requireViewer } from "@/lib/auth";

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
});
