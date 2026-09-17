import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DashboardCountdown } from "@/components/dashboard-countdown";

describe("DashboardCountdown", () => {
  it("renders deterministic countdown values and the target datetime", () => {
    const html = renderToStaticMarkup(createElement(DashboardCountdown, {
      scheduledFor: "2026-07-19T08:31:00.000Z",
      nowIso: "2026-07-16T12:00:00.000Z",
    }));

    expect(html).toContain('dateTime="2026-07-19T08:31:00.000Z"');
    expect(html).toContain("<strong>02</strong><small>days</small>");
    expect(html).toContain("<strong>20</strong><small>hours</small>");
    expect(html).toContain("<strong>31</strong><small>minutes</small>");
  });

  it("renders due state without negative values", () => {
    const html = renderToStaticMarkup(createElement(DashboardCountdown, {
      scheduledFor: "2026-07-15T12:00:00.000Z",
      nowIso: "2026-07-16T12:00:00.000Z",
    }));

    expect(html).toContain("Due now");
    expect(html).not.toContain("<strong>-");
  });
});
