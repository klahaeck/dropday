import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppRouteLoading } from "@/components/app-route-feedback";
import ApplicationError from "@/app/app/error";

describe("application route feedback", () => {
  it("renders a stable loading status", () => {
    const html = renderToStaticMarkup(createElement(AppRouteLoading));

    expect(html).toContain("role=\"status\"");
    expect(html).toContain("Loading this page");
    expect(html).toContain("app-route-skeleton-card");
  });

  it("renders recoverable error actions without exposing the raw error", () => {
    const html = renderToStaticMarkup(createElement(ApplicationError, {
      error: Object.assign(new Error("private database detail"), { digest: "digest-1" }),
      retry: () => undefined,
    }));

    expect(html).toContain("Retry");
    expect(html).toContain("Back to dashboard");
    expect(html).not.toContain("private database detail");
  });
});
