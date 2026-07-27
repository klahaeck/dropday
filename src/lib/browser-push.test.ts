import { describe, expect, it } from "vitest";
import {
  browserNotificationPayload,
  isAllowedPushEndpoint,
} from "@/lib/browser-push";
import type { Notification } from "@/types/domain";

const notification: Notification = {
  id: "notification-1",
  userId: "user-1",
  kind: "assignment",
  title: "You’re up next",
  body: "Your playlist drops tomorrow.",
  href: "/app/clubs/needle-exchange",
  createdAt: "2026-07-27T12:00:00.000Z",
};

describe("browser push notifications", () => {
  it("keeps the persisted account notification identity and destination", () => {
    expect(browserNotificationPayload(notification)).toEqual({
      id: notification.id,
      title: notification.title,
      body: notification.body,
      href: notification.href,
    });
  });

  it("falls back to the account notifications page", () => {
    expect(browserNotificationPayload({ ...notification, href: undefined }).href)
      .toBe("/app/notifications");
  });

  it("accepts browser push services and rejects arbitrary endpoints", () => {
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/example")).toBe(true);
    expect(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/example")).toBe(true);
    expect(isAllowedPushEndpoint("https://web.push.apple.com/Q/example")).toBe(true);
    expect(isAllowedPushEndpoint("https://wns2-db5p.notify.windows.com/w/?token=example")).toBe(true);
    expect(isAllowedPushEndpoint("http://fcm.googleapis.com/fcm/send/example")).toBe(false);
    expect(isAllowedPushEndpoint("https://example.com/push")).toBe(false);
  });
});
