import { describe, expect, it } from "vitest";
import { canViewDropContent, hasDropReachedScheduledTime } from "@/lib/drop-visibility";

const scheduledFor = "2026-07-28T14:00:00.000Z";

describe("drop content visibility", () => {
  it("lets the assigned member preview content before the scheduled time", () => {
    expect(canViewDropContent(
      { assignedUserId: "assigned", scheduledFor },
      "assigned",
      "2026-07-28T13:59:59.999Z",
    )).toBe(true);
  });

  it("lets a replacement publisher preview content before the scheduled time", () => {
    expect(canViewDropContent(
      {
        assignedUserId: "assigned",
        scheduledFor,
        replacement: {
          originalAssigneeId: "assigned",
          replacementPublisherId: "replacement",
          queueEffect: "preserveTurn",
        },
      },
      "replacement",
      "2026-07-28T13:59:59.999Z",
    )).toBe(true);
  });

  it("hides content from other members before the scheduled time", () => {
    expect(canViewDropContent(
      { assignedUserId: "assigned", scheduledFor },
      "other-member",
      "2026-07-28T13:59:59.999Z",
    )).toBe(false);
  });

  it("releases content to other members at the scheduled time", () => {
    expect(canViewDropContent(
      { assignedUserId: "assigned", scheduledFor },
      "other-member",
      scheduledFor,
    )).toBe(true);
  });

  it("fails closed when a scheduled timestamp is invalid", () => {
    expect(hasDropReachedScheduledTime(
      { scheduledFor: "not-a-date" },
      "2026-07-28T14:00:00.000Z",
    )).toBe(false);
  });
});
