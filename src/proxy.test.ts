import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  clerkProxy: vi.fn(),
  integrations: { clerk: false },
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: vi.fn(() => mocks.clerkProxy),
}));

vi.mock("@/lib/env", () => ({
  env: { clerkPublishableKey: undefined },
  integrations: mocks.integrations,
}));

import proxy from "@/proxy";

describe("request proxy authentication modes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.integrations.clerk = false;
  });

  it("allows explicit demo-mode requests without invoking Clerk", async () => {
    const response = await proxy(
      new NextRequest("http://localhost/app"),
      {} as never,
    );

    expect(response?.headers.get("x-middleware-next")).toBe("1");
    expect(mocks.clerkProxy).not.toHaveBeenCalled();
  });

  it("delegates configured authentication requests to Clerk", async () => {
    mocks.integrations.clerk = true;
    mocks.clerkProxy.mockResolvedValueOnce(new Response("authenticated"));
    const request = new NextRequest("http://localhost/app");
    const event = {} as never;

    const response = await proxy(request, event);

    expect(mocks.clerkProxy).toHaveBeenCalledWith(request, event);
    await expect(response?.text()).resolves.toBe("authenticated");
  });
});
