"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import { GripVertical } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { moveMember } from "@/lib/queue";
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
  const savedMemberIdsRef = useRef(initialMemberIds);
  const pausedMemberIdsRef = useRef(new Set(pausedMemberIds));
  const dragStartOrderRef = useRef(initialMemberIds);
  const draggingMemberIdRef = useRef<string | undefined>(undefined);
  const lastDragTargetRef = useRef<string | undefined>(undefined);
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
        savedMemberIdsRef.current = restoredMemberIds;
        setFeedback({ kind: "error", message: result.error ?? "Could not save the member order." });
        if (response.status === 409) router.refresh();
        return;
      }

      const savedMemberIds = result.memberIds ?? nextMemberIds;
      updateOrder(savedMemberIds);
      savedMemberIdsRef.current = savedMemberIds;
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
        savedMemberIdsRef.current = restoredMemberIds;
        updatePausedState(memberId, restoredPaused);
        setFeedback({ kind: "error", message: result.error ?? "Could not update this member's queue state." });
        if (response.status === 409) router.refresh();
        return;
      }

      const savedMemberIds = result.memberIds ?? previousMemberIds;
      const savedPaused = result.paused ?? paused;
      updateOrder(savedMemberIds);
      savedMemberIdsRef.current = savedMemberIds;
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

  function beginPointerDrag(event: ReactPointerEvent<HTMLButtonElement>, memberId: string) {
    if (savingRef.current || memberIdsRef.current.length < 2 || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartOrderRef.current = memberIdsRef.current;
    draggingMemberIdRef.current = memberId;
    lastDragTargetRef.current = memberId;
    setDraggingMemberId(memberId);
    setFeedback({ kind: "idle", message: `Moving ${membersById.get(memberId)?.displayName ?? "member"}.` });
  }

  function continuePointerDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const memberId = draggingMemberIdRef.current;
    if (!memberId) return;
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-member-id]");
    const targetMemberId = target?.dataset.memberId;
    if (!targetMemberId || targetMemberId === memberId || targetMemberId === lastDragTargetRef.current) return;
    lastDragTargetRef.current = targetMemberId;

    const nextMemberIds = moveMember(memberIdsRef.current, memberId, targetMemberId);
    if (!ordersMatch(memberIdsRef.current, nextMemberIds)) updateOrder(nextMemberIds);
  }

  function endPointerDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const memberId = draggingMemberIdRef.current;
    if (!memberId) return;
    event.preventDefault();
    draggingMemberIdRef.current = undefined;
    lastDragTargetRef.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDraggingMemberId(undefined);

    const nextMemberIds = memberIdsRef.current;
    const previousMemberIds = dragStartOrderRef.current;
    if (ordersMatch(nextMemberIds, previousMemberIds)) {
      setFeedback({ kind: "idle", message: "" });
      return;
    }
    void persistOrder(nextMemberIds, previousMemberIds);
  }

  function cancelPointerDrag() {
    if (!draggingMemberIdRef.current) return;
    updateOrder(dragStartOrderRef.current);
    draggingMemberIdRef.current = undefined;
    lastDragTargetRef.current = undefined;
    setDraggingMemberId(undefined);
    setFeedback({ kind: "idle", message: "Member move cancelled." });
  }

  function moveWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, memberId: string) {
    if (savingRef.current || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    const currentIndex = memberIdsRef.current.indexOf(memberId);
    const targetIndex = currentIndex + (event.key === "ArrowUp" ? -1 : 1);
    const targetMemberId = memberIdsRef.current[targetIndex];
    if (!targetMemberId) return;

    const previousMemberIds = savedMemberIdsRef.current;
    const nextMemberIds = moveMember(memberIdsRef.current, memberId, targetMemberId);
    updateOrder(nextMemberIds);
    void persistOrder(nextMemberIds, previousMemberIds);
  }

  const activeMemberIds = new Set(memberIds);
  const pausedMemberIdSet = new Set(pausedMemberIds);
  const nextActiveMemberId = memberIds.find((memberId) => !pausedMemberIdSet.has(memberId));
  const displayedMemberIds = [
    ...memberIds,
    ...members.filter((member) => !activeMemberIds.has(member.id)).map((member) => member.id),
  ];

  return (
    <div className="member-order">
      <p className="member-order-help" id="member-order-help">
        Drag the handles to reorder the queue, or use the arrow keys on a focused handle. Paused members keep their position and are skipped for future turns.
      </p>
      <div className="member-order-list">
        {displayedMemberIds.map((memberId) => {
          const member = membersById.get(memberId);
          const displayName = member?.displayName ?? "Dropday member";
          const index = memberIds.indexOf(memberId);
          const paused = pausedMemberIdSet.has(memberId);
          const outsideQueue = index === -1;
          const changing = savingMemberId === memberId;
          return (
            <div
              className={`member-row member-order-row${draggingMemberId === memberId ? " member-order-row-dragging" : ""}${paused ? " member-order-row-paused" : ""}`}
              data-member-id={outsideQueue ? undefined : memberId}
              key={memberId}
            >
              {outsideQueue
                ? <span className="member-order-handle member-order-handle-disabled" aria-hidden="true"><GripVertical size={16} /></span>
                : <button
                    type="button"
                    className="member-order-handle"
                    aria-describedby="member-order-help"
                    aria-label={`Move ${displayName}. Position ${index + 1} of ${memberIds.length}.`}
                    aria-keyshortcuts="ArrowUp ArrowDown"
                    aria-disabled={saving}
                    onKeyDown={(event) => moveWithKeyboard(event, memberId)}
                    onPointerDown={(event) => beginPointerDrag(event, memberId)}
                    onPointerMove={continuePointerDrag}
                    onPointerUp={endPointerDrag}
                    onPointerCancel={cancelPointerDrag}
                    onLostPointerCapture={cancelPointerDrag}
                  >
                    <GripVertical size={16} aria-hidden="true" />
                  </button>}
              <Avatar user={member} />
              <div>
                <strong>{displayName}</strong>
                <small>{outsideQueue ? "Outside rotation" : paused ? `Position ${index + 1} · Paused` : memberId === nextActiveMemberId ? "Next" : `Position ${index + 1}`}</small>
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
