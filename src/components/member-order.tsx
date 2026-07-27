"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Announcements } from "@dnd-kit/core";
import { useRouter } from "next/navigation";
import { GripVertical } from "lucide-react";
import { Avatar } from "@/components/avatar";
import {
  Sortable,
  SortableContent,
  SortableItem,
  SortableItemHandle,
  SortableOverlay,
} from "@/components/ui/sortable";
import type { UserProfile } from "@/types/domain";

type MemberSummary = Pick<UserProfile, "id" | "displayName" | "initials" | "imageUrl"> & {
  queuePaused: boolean;
};
type Feedback = { kind: "idle" | "saving" | "saved" | "error"; message: string };

function ordersMatch(first: string[], second: string[]): boolean {
  return first.length === second.length && first.every((memberId, index) => memberId === second[index]);
}

export function MemberOrder({
  clubSlug,
  initialMemberIds,
  members,
}: {
  clubSlug: string;
  initialMemberIds: string[];
  members: MemberSummary[];
}) {
  const [memberIds, setMemberIds] = useState(initialMemberIds);
  const [pausedMemberIds, setPausedMemberIds] = useState(() =>
    members.filter((member) => member.queuePaused).map((member) => member.id)
  );
  const [draggingMemberId, setDraggingMemberId] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [savingMemberId, setSavingMemberId] = useState<string>();
  const [feedback, setFeedback] = useState<Feedback>({ kind: "idle", message: "" });
  const memberIdsRef = useRef(initialMemberIds);
  const pausedMemberIdsRef = useRef(new Set(pausedMemberIds));
  const savingRef = useRef(false);
  const savedFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const router = useRouter();
  const membersById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);

  useEffect(() => () => clearTimeout(savedFeedbackTimeoutRef.current), []);

  function updateOrder(nextMemberIds: string[]) {
    memberIdsRef.current = nextMemberIds;
    setMemberIds(nextMemberIds);
  }

  function updatePausedState(memberId: string, paused: boolean) {
    const nextPausedMemberIds = new Set(pausedMemberIdsRef.current);
    if (paused) nextPausedMemberIds.add(memberId);
    else nextPausedMemberIds.delete(memberId);
    pausedMemberIdsRef.current = nextPausedMemberIds;
    setPausedMemberIds([...nextPausedMemberIds]);
  }

  async function persistOrder(nextMemberIds: string[], rollbackMemberIds: string[]) {
    savingRef.current = true;
    setSaving(true);
    setFeedback({ kind: "saving", message: "Saving member order…" });
    clearTimeout(savedFeedbackTimeoutRef.current);

    try {
      const response = await fetch(`/api/clubs/${encodeURIComponent(clubSlug)}/member-order`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberIds: nextMemberIds, previousMemberIds: rollbackMemberIds }),
      });
      const result = (await response.json()) as { memberIds?: string[]; error?: string };
      if (!response.ok) {
        const restoredMemberIds = result.memberIds ?? rollbackMemberIds;
        updateOrder(restoredMemberIds);
        setFeedback({ kind: "error", message: result.error ?? "Could not save the member order." });
        if (response.status === 409) router.refresh();
        return;
      }

      const savedMemberIds = result.memberIds ?? nextMemberIds;
      updateOrder(savedMemberIds);
      setFeedback({ kind: "saved", message: "Member order saved." });
      savedFeedbackTimeoutRef.current = setTimeout(
        () => setFeedback({ kind: "idle", message: "" }),
        2500,
      );
    } catch {
      updateOrder(rollbackMemberIds);
      setFeedback({ kind: "error", message: "Could not save the member order. Check your connection and try again." });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function togglePaused(memberId: string, displayName: string) {
    if (savingRef.current) return;
    const previousMemberIds = memberIdsRef.current;
    const wasPaused = pausedMemberIdsRef.current.has(memberId);
    const paused = !wasPaused;
    const activeQueueMemberCount = previousMemberIds.filter((id) => !pausedMemberIdsRef.current.has(id)).length;
    if (paused && activeQueueMemberCount === 1) {
      setFeedback({ kind: "error", message: "At least one member must remain in the rotation." });
      return;
    }

    updatePausedState(memberId, paused);
    savingRef.current = true;
    setSaving(true);
    setSavingMemberId(memberId);
    setFeedback({ kind: "saving", message: `${paused ? "Pausing" : "Resuming"} ${displayName}…` });
    clearTimeout(savedFeedbackTimeoutRef.current);

    try {
      const response = await fetch(
        `/api/clubs/${encodeURIComponent(clubSlug)}/members/${encodeURIComponent(memberId)}/queue`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paused, previousMemberIds }),
        },
      );
      const result = (await response.json()) as { memberIds?: string[]; paused?: boolean; error?: string };
      if (!response.ok) {
        const restoredMemberIds = result.memberIds ?? previousMemberIds;
        const restoredPaused = result.paused ?? wasPaused;
        updateOrder(restoredMemberIds);
        updatePausedState(memberId, restoredPaused);
        setFeedback({ kind: "error", message: result.error ?? "Could not update this member's queue state." });
        if (response.status === 409) router.refresh();
        return;
      }

      const savedMemberIds = result.memberIds ?? previousMemberIds;
      const savedPaused = result.paused ?? paused;
      updateOrder(savedMemberIds);
      updatePausedState(memberId, savedPaused);
      setFeedback({
        kind: "saved",
        message: savedPaused
          ? `${displayName} is paused and will be skipped without changing position.`
          : `${displayName} resumed in the same queue position.`,
      });
      savedFeedbackTimeoutRef.current = setTimeout(
        () => setFeedback({ kind: "idle", message: "" }),
        2500,
      );
    } catch {
      updateOrder(previousMemberIds);
      updatePausedState(memberId, wasPaused);
      setFeedback({ kind: "error", message: "Could not update this member. Check your connection and try again." });
    } finally {
      savingRef.current = false;
      setSaving(false);
      setSavingMemberId(undefined);
    }
  }

  function reorderMembers(nextMemberIds: string[]) {
    if (savingRef.current) return;
    const previousMemberIds = memberIdsRef.current;
    if (ordersMatch(previousMemberIds, nextMemberIds)) {
      setFeedback({ kind: "idle", message: "" });
      return;
    }
    updateOrder(nextMemberIds);
    void persistOrder(nextMemberIds, previousMemberIds);
  }

  const announcements = useMemo<Announcements>(() => ({
    onDragStart({ active }) {
      const memberId = String(active.id);
      const displayName = membersById.get(memberId)?.displayName ?? "Member";
      const index = memberIdsRef.current.indexOf(memberId);
      return `Picked up ${displayName}. Position ${index + 1} of ${memberIdsRef.current.length}. Use the up and down arrow keys to move, then press space or enter to drop.`;
    },
    onDragOver({ active, over }) {
      const displayName = membersById.get(String(active.id))?.displayName ?? "Member";
      if (!over) return `${displayName} is outside the queue. Press escape to cancel.`;
      const overIndex = over.data.current?.sortable.index ?? 0;
      return `${displayName} moved to position ${overIndex + 1} of ${memberIdsRef.current.length}.`;
    },
    onDragEnd({ active, over }) {
      const displayName = membersById.get(String(active.id))?.displayName ?? "Member";
      if (!over) return `${displayName} was dropped outside the queue. No changes were made.`;
      const overIndex = over.data.current?.sortable.index ?? 0;
      return `${displayName} was dropped at position ${overIndex + 1} of ${memberIdsRef.current.length}.`;
    },
    onDragCancel({ active }) {
      const memberId = String(active.id);
      const displayName = membersById.get(memberId)?.displayName ?? "Member";
      const index = memberIdsRef.current.indexOf(memberId);
      return `Sorting cancelled. ${displayName} returned to position ${index + 1}.`;
    },
  }), [membersById]);

  const activeMemberIds = new Set(memberIds);
  const pausedMemberIdSet = new Set(pausedMemberIds);
  const nextActiveMemberId = memberIds.find((memberId) => !pausedMemberIdSet.has(memberId));
  const outsideQueueMemberIds = members
    .filter((member) => !activeMemberIds.has(member.id))
    .map((member) => member.id);

  return (
    <div className="member-order">
      <p className="member-order-help" id="member-order-help">
        Drag a handle to reorder the queue. For keyboard sorting, focus a handle, press Space or Enter, move with the arrow keys, then press Space or Enter to drop. Paused members keep their position and are skipped for future turns.
      </p>
      <div className="member-order-list">
        <Sortable
          value={memberIds}
          onValueChange={reorderMembers}
          accessibility={{ announcements }}
          onDragStart={({ active }) => {
            const memberId = String(active.id);
            setDraggingMemberId(memberId);
            setFeedback({
              kind: "idle",
              message: `Moving ${membersById.get(memberId)?.displayName ?? "member"}.`,
            });
          }}
          onDragEnd={() => {
            setDraggingMemberId(undefined);
            setFeedback({ kind: "idle", message: "" });
          }}
          onDragCancel={() => {
            setDraggingMemberId(undefined);
            setFeedback({ kind: "idle", message: "Member move cancelled." });
          }}
        >
          <SortableContent className="member-order-sortable-content">
            {memberIds.map((memberId) => {
              const member = membersById.get(memberId);
              const displayName = member?.displayName ?? "Dropday member";
              const index = memberIds.indexOf(memberId);
              const paused = pausedMemberIdSet.has(memberId);
              const changing = savingMemberId === memberId;
              return (
                <SortableItem
                  className={`member-row member-order-row${draggingMemberId === memberId ? " member-order-row-dragging" : ""}${paused ? " member-order-row-paused" : ""}`}
                  disabled={saving || memberIds.length < 2}
                  key={memberId}
                  value={memberId}
                >
                  <SortableItemHandle
                    className="member-order-handle"
                    aria-describedby="member-order-help"
                    aria-label={`Reorder ${displayName}. Position ${index + 1} of ${memberIds.length}.`}
                    aria-keyshortcuts="Space Enter ArrowUp ArrowDown Escape"
                  >
                    <GripVertical size={16} aria-hidden="true" />
                  </SortableItemHandle>
                  <Avatar user={member} />
                  <div>
                    <strong>{displayName}</strong>
                    <small>{paused ? `Position ${index + 1} · Paused` : memberId === nextActiveMemberId ? "Next" : `Position ${index + 1}`}</small>
                  </div>
                  <button
                    className={`button button-ghost button-small member-queue-toggle${paused ? " member-queue-toggle-paused" : ""}`}
                    type="button"
                    aria-label={paused ? `Resume ${displayName} in the queue` : `Pause ${displayName} in the queue`}
                    aria-pressed={paused}
                    disabled={saving}
                    title={paused ? "Resume in the same queue position" : "Pause future turns"}
                    onClick={() => void togglePaused(memberId, displayName)}
                  >
                    {changing ? "Saving…" : paused ? "Paused" : "Pause"}
                  </button>
                </SortableItem>
              );
            })}
          </SortableContent>
          <SortableOverlay>
            {({ value }) => {
              const memberId = String(value);
              const member = membersById.get(memberId);
              const displayName = member?.displayName ?? "Dropday member";
              const index = memberIds.indexOf(memberId);
              const paused = pausedMemberIdSet.has(memberId);
              return (
                <SortableItem
                  className={`member-row member-order-row member-order-row-overlay${paused ? " member-order-row-paused" : ""}`}
                  value={memberId}
                >
                  <span className="member-order-handle" aria-hidden="true">
                    <GripVertical size={16} />
                  </span>
                  <Avatar user={member} />
                  <div>
                    <strong>{displayName}</strong>
                    <small>{paused ? `Position ${index + 1} · Paused` : memberId === nextActiveMemberId ? "Next" : `Position ${index + 1}`}</small>
                  </div>
                  <span
                    className={`button button-ghost button-small member-queue-toggle${paused ? " member-queue-toggle-paused" : ""}`}
                    aria-hidden="true"
                  >
                    {paused ? "Paused" : "Pause"}
                  </span>
                </SortableItem>
              );
            }}
          </SortableOverlay>
        </Sortable>
        {outsideQueueMemberIds.map((memberId) => {
          const member = membersById.get(memberId);
          const displayName = member?.displayName ?? "Dropday member";
          const paused = pausedMemberIdSet.has(memberId);
          const changing = savingMemberId === memberId;
          return (
            <div
              className={`member-row member-order-row${paused ? " member-order-row-paused" : ""}`}
              key={memberId}
            >
              <span className="member-order-handle member-order-handle-disabled" aria-hidden="true">
                <GripVertical size={16} />
              </span>
              <Avatar user={member} />
              <div>
                <strong>{displayName}</strong>
                <small>Outside rotation</small>
              </div>
              <button
                className={`button button-ghost button-small member-queue-toggle${paused ? " member-queue-toggle-paused" : ""}`}
                type="button"
                aria-label={paused ? `Resume ${displayName} in the queue` : `Pause ${displayName} in the queue`}
                aria-pressed={paused}
                disabled={saving}
                title={paused ? "Resume in the same queue position" : "Pause future turns"}
                onClick={() => void togglePaused(memberId, displayName)}
              >
                {changing ? "Saving…" : paused ? "Paused" : "Pause"}
              </button>
            </div>
          );
        })}
      </div>
      <p
        className={`member-order-feedback${feedback.kind === "error" ? " form-error" : ""}`}
        role={feedback.kind === "error" ? "alert" : "status"}
        aria-live="polite"
      >
        {feedback.message}
      </p>
    </div>
  );
}
