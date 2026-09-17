import type { ReviewedDropAttachmentAction } from "@/lib/drop-attachment";

export type DropAttachmentReviewAction = ReviewedDropAttachmentAction | "no-op";

export function attachmentReviewAction({
  isLate,
  hasCurrentPlaylist,
  currentDraftId,
  selectedDraftId,
}: {
  isLate: boolean;
  hasCurrentPlaylist: boolean;
  currentDraftId?: string;
  selectedDraftId: string;
}): DropAttachmentReviewAction {
  if (isLate) return "publish-late";
  if (!hasCurrentPlaylist) return "attach";
  return currentDraftId === selectedDraftId ? "no-op" : "replace";
}

export function selectPlaylistForReview(selectedPlaylistId: string) {
  return { selectedPlaylistId, reviewReady: true as const };
}

export function buildAttachmentCommit({
  draftId,
  action,
  expectedCurrentDraftId,
  reviewReady,
}: {
  draftId: string;
  action: DropAttachmentReviewAction;
  expectedCurrentDraftId?: string;
  reviewReady: boolean;
}) {
  if (!reviewReady || !draftId || action === "no-op") return undefined;
  return {
    draftId,
    reviewedAction: action,
    expectedCurrentDraftId: expectedCurrentDraftId ?? null,
  };
}
