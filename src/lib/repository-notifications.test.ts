import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {},
  integrations: {
    ably: false,
    browserPush: false,
    clerk: false,
    mongo: false,
    resend: false,
    trigger: false,
  },
}));

import { demoNotifications } from "@/lib/demo-data";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/repository";

const originalReadTimes = new Map(demoNotifications.map((notification) => [notification.id, notification.readAt]));

afterEach(() => {
  for (const notification of demoNotifications) {
    notification.readAt = originalReadTimes.get(notification.id);
  }
});

describe("notification read state", () => {
  it("marks only the requested user's notification read and preserves its first read time", async () => {
    const firstReadAt = "2026-07-30T15:00:00.000Z";

    await expect(markNotificationRead("user-lena", "notification-1", firstReadAt)).resolves.toBe(true);
    expect(demoNotifications.find((notification) => notification.id === "notification-1")?.readAt).toBe(firstReadAt);

    await expect(markNotificationRead("user-lena", "notification-1", "2026-07-30T16:00:00.000Z")).resolves.toBe(false);
    expect(demoNotifications.find((notification) => notification.id === "notification-1")?.readAt).toBe(firstReadAt);

    await expect(markNotificationRead("user-theo", "notification-2", firstReadAt)).resolves.toBe(false);
    expect(demoNotifications.find((notification) => notification.id === "notification-2")?.readAt).toBeUndefined();
  });

  it("marks all and only the user's unread notifications read", async () => {
    const readAt = "2026-07-30T15:00:00.000Z";

    await expect(markAllNotificationsRead("user-lena", readAt)).resolves.toBe(2);
    expect(
      demoNotifications
        .filter((notification) => notification.userId === "user-lena")
        .every((notification) => Boolean(notification.readAt)),
    ).toBe(true);
    await expect(markAllNotificationsRead("user-lena", readAt)).resolves.toBe(0);
  });
});
