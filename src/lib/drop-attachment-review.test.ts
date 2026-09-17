import { describe, expect, it } from "vitest";
import {
  attachmentReviewAction,
  buildAttachmentCommit,
  selectPlaylistForReview,
} from "@/lib/drop-attachment-review";

describe("drop attachment review state", () => {
  it("moves selection only into review state", () => {
    expect(selectPlaylistForReview("draft-2")).toEqual({
      selectedPlaylistId: "draft-2",
      reviewReady: true,
    });
  });

  it("builds a commit only after review and includes the compared attachment", () => {
    const action = attachmentReviewAction({
      isLate: false,
      hasCurrentPlaylist: true,
      currentDraftId: "draft-1",
      selectedDraftId: "draft-2",
    });
    expect(buildAttachmentCommit({
      draftId: "draft-2",
      action,
      expectedCurrentDraftId: "draft-1",
      reviewReady: false,
    })).toBeUndefined();
    expect(buildAttachmentCommit({
      draftId: "draft-2",
      action,
      expectedCurrentDraftId: "draft-1",
      reviewReady: true,
    })).toEqual({
      draftId: "draft-2",
      reviewedAction: "replace",
      expectedCurrentDraftId: "draft-1",
    });
  });

  it("never commits an unchanged scheduled playlist", () => {
    const action = attachmentReviewAction({
      isLate: false,
      hasCurrentPlaylist: true,
      currentDraftId: "draft-1",
      selectedDraftId: "draft-1",
    });
    expect(action).toBe("no-op");
    expect(buildAttachmentCommit({
      draftId: "draft-1",
      action,
      expectedCurrentDraftId: "draft-1",
      reviewReady: true,
    })).toBeUndefined();
  });
});
