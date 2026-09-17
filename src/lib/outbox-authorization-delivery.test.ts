import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import {
  processNotificationEvent,
  type DurableOutboxEvent,
} from "@/lib/outbox";

const mocks = vi.hoisted(() => ({
  deliverToSubscription: vi.fn(),
  getTargets: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/browser-push", () => ({
  deliverBrowserNotificationToSubscription: mocks.deliverToSubscription,
  getBrowserPushDeliveryTargets: mocks.getTargets,
}));

vi.mock("@/lib/email", () => ({ sendDropdayEmail: mocks.sendEmail }));

vi.mock("@/lib/env", () => ({
  env: { ablyApiKey: undefined },
  integrations: { ably: false, mongo: true, trigger: true },
}));

const event: DurableOutboxEvent = {
  id: "outbox-overdue-drop-1",
  type: "drop.overdue",
  aggregateId: "drop-1",
  payload: { clubId: "club-1", assignedUserId: "removed-user" },
  status: "processing",
  attempts: 4,
  idempotencyKey: "drop-overdue:club-1:occurrence-1",
  createdAt: "2026-09-17T12:00:00.000Z",
};

describe("overdue outbox delivery authorization", () => {
  const findUsers = vi.fn();
  const db = {
    collection: vi.fn((name: string) => {
      if (name === "clubs") {
        return {
          findOne: vi.fn().mockResolvedValue({
            id: "club-1",
            slug: "private-club",
            name: "Private club",
            visibility: "private",
          }),
        };
      }
      if (name === "memberships") {
        return { find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })) };
      }
      if (name === "drops") {
        return {
          findOne: vi.fn().mockResolvedValue({
            status: "overdue",
            assignedUserId: "removed-user",
          }),
        };
      }
      if (name === "users") return { find: findUsers };
      throw new Error(`Unexpected collection ${name}`);
    }),
  } as unknown as Db;

  beforeEach(() => {
    vi.clearAllMocks();
    findUsers.mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) });
  });

  it("does not deliver a delayed private-club notification after membership removal", async () => {
    await expect(processNotificationEvent(db, event)).resolves.toEqual({
      status: "delivered",
      recipients: 0,
    });

    expect(findUsers).toHaveBeenCalledWith({ id: { $in: [] } });
    expect(mocks.getTargets).not.toHaveBeenCalled();
    expect(mocks.deliverToSubscription).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
