import { describe, expect, it } from "vitest";
import { resolveAuthenticationConfiguration } from "@/lib/env";

describe("authentication configuration", () => {
  it("requires demo mode to be explicitly enabled", () => {
    expect(resolveAuthenticationConfiguration({
      demoMode: false,
      mongoConfigured: false,
    })).toEqual({ mode: "unavailable", issues: [] });

    expect(resolveAuthenticationConfiguration({
      demoMode: true,
      mongoConfigured: false,
      production: false,
    })).toEqual({ mode: "demo", issues: [] });
  });

  it("rejects demo identity in production", () => {
    const configuration = resolveAuthenticationConfiguration({
      demoMode: true,
      mongoConfigured: false,
      production: true,
    });

    expect(configuration.mode).toBe("invalid");
    expect(configuration.issues).toContain("Demo mode is disabled in production deployments.");
  });

  it("rejects persistent data access without Clerk authentication", () => {
    const configuration = resolveAuthenticationConfiguration({
      demoMode: true,
      mongoConfigured: true,
    });

    expect(configuration.mode).toBe("invalid");
    expect(configuration.issues).toContain("MONGODB_URI cannot be used without Clerk authentication.");
    expect(configuration.issues).toContain("Demo mode cannot use a persistent MongoDB database.");
  });

  it("rejects partial Clerk credentials", () => {
    const configuration = resolveAuthenticationConfiguration({
      demoMode: false,
      mongoConfigured: false,
      clerkPublishableKey: "pk_test_example",
    });

    expect(configuration.mode).toBe("invalid");
    expect(configuration.issues).toContain(
      "Both NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY must be configured together.",
    );
  });

  it("rejects Clerk authentication without persistent storage", () => {
    const configuration = resolveAuthenticationConfiguration({
      demoMode: false,
      mongoConfigured: false,
      clerkPublishableKey: "pk_test_example",
      clerkSecretKey: "sk_test_example",
    });

    expect(configuration.mode).toBe("invalid");
    expect(configuration.issues).toContain(
      "Clerk authentication cannot be used without MONGODB_URI.",
    );
  });

  it("prefers fully configured Clerk authentication over demo mode", () => {
    expect(resolveAuthenticationConfiguration({
      demoMode: true,
      mongoConfigured: true,
      clerkPublishableKey: "pk_test_example",
      clerkSecretKey: "sk_test_example",
    })).toEqual({ mode: "clerk", issues: [] });
  });
});
