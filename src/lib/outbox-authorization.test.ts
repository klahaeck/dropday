import { describe, expect, it } from "vitest";
import {
  resolveNotificationTargetIds,
  type DurableOutboxEvent,
} from "@/lib/outbox";
import type { ClubMembership } from "@/types/domain";

const event: DurableOutboxEvent = {
  id: "outbox-overdue-drop-1",
  type: "drop.overdue",
  aggregateId: "drop-1",
  payload: { clubId: "club-1", assignedUserId: "assigned-user" },
  status: "processing",
  attempts: 4,
  idempotencyKey: "drop-overdue:club-1:occurrence-1",
  createdAt: "2026-09-17T12:00:00.000Z",
};

function membership(
  userId: string,
  status: ClubMembership["status"] = "active",
): ClubMembership {
  return {
    id: `membership-${userId}`,
    clubId: "club-1",
    userId,
    role: "member",
    status,
    queuePaused: false,
    joinedAt: event.createdAt,
    updatedAt: event.createdAt,
  };
}

describe("overdue outbox recipient authorization", () => {
  it("delivers a retried private-club event only to its still-active current assignee", () => {
    expect(resolveNotificationTargetIds({
      event,
      club: { id: "club-1", visibility: "private" },
      memberships: [membership("assigned-user")],
      currentDrop: { status: "overdue", assignedUserId: "assigned-user" },
    })).toEqual(["assigned-user"]);
  });

  it.each(["removed", "left"] as const)(
    "suppresses a delayed private-club event after the assignee is %s",
    (status) => {
      expect(resolveNotificationTargetIds({
        event,
        club: { id: "club-1", visibility: "private" },
        memberships: [membership("assigned-user", status)],
        currentDrop: { status: "overdue", assignedUserId: "assigned-user" },
      })).toEqual([]);
    },
  );

  it("suppresses stale overdue work after reassignment", () => {
    expect(resolveNotificationTargetIds({
      event,
      club: { id: "club-1", visibility: "private" },
      memberships: [membership("assigned-user"), membership("replacement-user")],
      currentDrop: { status: "overdue", assignedUserId: "replacement-user" },
    })).toEqual([]);
  });

  it("suppresses stale overdue work after the drop is recovered", () => {
    expect(resolveNotificationTargetIds({
      event,
      club: { id: "club-1", visibility: "private" },
      memberships: [membership("assigned-user")],
      currentDrop: { status: "published", assignedUserId: "assigned-user" },
    })).toEqual([]);
  });

  it("does not broaden malformed overdue work to every active member", () => {
    expect(resolveNotificationTargetIds({
      event: { ...event, payload: { clubId: "club-1" } },
      club: { id: "club-1", visibility: "private" },
      memberships: [membership("member-1"), membership("member-2")],
      currentDrop: { status: "overdue", assignedUserId: "member-1" },
    })).toEqual([]);
  });
});
