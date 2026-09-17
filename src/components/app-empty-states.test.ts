import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppEmptyState, type AppEmptyStateKind } from "@/components/app-empty-states";
import { NotificationCenter } from "@/components/notification-center";
import type { Notification } from "@/types/domain";

function render(kind: AppEmptyStateKind) {
  return renderToStaticMarkup(createElement(AppEmptyState, { kind }));
}

describe("application empty states", () => {
  it("offers accurate next steps for dashboard and club zero states", () => {
    expect(render("dashboard-no-clubs")).toContain("Discover clubs");
    expect(render("dashboard-no-drop")).toContain("Prepare a playlist");
    expect(render("dashboard-no-activity")).toContain("Open my clubs");
    expect(render("clubs-empty")).toContain("New club");
  });

  it("shows the notification empty state only for an empty collection", () => {
    const empty = renderToStaticMarkup(createElement(NotificationCenter, { initialNotifications: [] }));
    const notification: Notification = {
      id: "notice-1",
      userId: "user-1",
      kind: "assignment",
      title: "Your turn is next",
      body: "Prepare a playlist for Friday.",
      createdAt: "2026-09-17T12:00:00.000Z",
    };
    const populated = renderToStaticMarkup(createElement(NotificationCenter, {
      initialNotifications: [notification],
    }));

    expect(empty).toContain("You are all caught up");
    expect(populated).toContain("Your turn is next");
    expect(populated).not.toContain("You are all caught up");
  });
});
