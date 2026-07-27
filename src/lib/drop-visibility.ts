import type { DropSlot } from "@/types/domain";

export function hasDropReachedScheduledTime(
  drop: Pick<DropSlot, "scheduledFor">,
  timestamp: string,
) {
  const scheduledFor = Date.parse(drop.scheduledFor);
  const viewedAt = Date.parse(timestamp);
  return Number.isFinite(scheduledFor)
    && Number.isFinite(viewedAt)
    && viewedAt >= scheduledFor;
}

export function canViewDropContent(
  drop: Pick<DropSlot, "assignedUserId" | "replacement" | "scheduledFor">,
  viewerUserId: string,
  timestamp = new Date().toISOString(),
) {
  return drop.assignedUserId === viewerUserId
    || drop.replacement?.replacementPublisherId === viewerUserId
    || hasDropReachedScheduledTime(drop, timestamp);
}
