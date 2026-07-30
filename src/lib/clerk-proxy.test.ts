import { describe, expect, it } from "vitest";
import {
  CLERK_FRONTEND_API_PROXY_PATH,
  clerkFrontendApiProxyUrl,
  shouldProxyClerkFrontendApi,
} from "@/lib/clerk-proxy";

describe("Clerk Frontend API proxy", () => {
  it("uses the first-party proxy for production Clerk instances", () => {
    expect(shouldProxyClerkFrontendApi("pk_live_dropday")).toBe(true);
    expect(clerkFrontendApiProxyUrl(
      "pk_live_dropday",
      CLERK_FRONTEND_API_PROXY_PATH,
    )).toBe(
      CLERK_FRONTEND_API_PROXY_PATH,
    );
  });

  it("leaves development and unconfigured Clerk instances direct", () => {
    expect(shouldProxyClerkFrontendApi("pk_test_dropday")).toBe(false);
    expect(clerkFrontendApiProxyUrl(
      "pk_test_dropday",
      CLERK_FRONTEND_API_PROXY_PATH,
    )).toBeUndefined();
    expect(clerkFrontendApiProxyUrl("pk_live_dropday")).toBeUndefined();
    expect(clerkFrontendApiProxyUrl(
      "pk_live_dropday",
      "/wrong-path",
    )).toBeUndefined();
  });
});
