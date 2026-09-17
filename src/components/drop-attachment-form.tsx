"use client";

import { FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Check, ChevronDown, Library, LoaderCircle, Music2, X } from "lucide-react";
import {
  attachmentReviewAction,
  buildAttachmentCommit,
  selectPlaylistForReview,
} from "@/lib/drop-attachment-review";

export interface DropAttachmentOption {
  id: string;
  clubName: string;
  scheduledLabel: string;
  isLate: boolean;
  currentPlaylistTitle?: string;
  currentPlaylistDraftId?: string;
}

export interface PlaylistAttachmentOption {
  id: string;
  title: string;
}

export function DropAttachmentForm({
  drops,
  playlists,
  playlistId,
  dropId,
}: {
  drops: DropAttachmentOption[];
  playlists: PlaylistAttachmentOption[];
  playlistId?: string;
  dropId?: string;
}) {
  const initialDropId = dropId ?? drops[0]?.id ?? "";
  const initialPlaylistId = playlistId
    ?? drops.find((drop) => drop.id === initialDropId)?.currentPlaylistDraftId
    ?? "";
  const [selectedDropId, setSelectedDropId] = useState(initialDropId);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(initialPlaylistId);
  const [currentAttachments, setCurrentAttachments] = useState<Record<string, {
    title?: string;
    draftId?: string;
  }>>({});
  const [reviewReady, setReviewReady] = useState(Boolean(playlistId && initialDropId));
  const [pendingPlaylistId, setPendingPlaylistId] = useState<string>();
  const [isPlaylistSelectorOpen, setIsPlaylistSelectorOpen] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [message, setMessage] = useState<string>();
  const playlistDialogId = useId();
  const playlistDialogTitleId = useId();
  const playlistTriggerRef = useRef<HTMLButtonElement>(null);
  const playlistDialogRef = useRef<HTMLElement>(null);
  const playlistDialogCloseRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  const selectedDrop = drops.find((drop) => drop.id === selectedDropId);
  const selectedPlaylist = playlists.find((playlist) => playlist.id === selectedPlaylistId);
  const currentAttachment = currentAttachments[selectedDropId] ?? {
    title: selectedDrop?.currentPlaylistTitle,
    draftId: selectedDrop?.currentPlaylistDraftId,
  };
  const displayedCurrentPlaylistTitle = currentAttachment?.title;
  const reviewedAction = attachmentReviewAction({
    isLate: Boolean(selectedDrop?.isLate),
    hasCurrentPlaylist: Boolean(currentAttachment?.title),
    currentDraftId: currentAttachment?.draftId,
    selectedDraftId: selectedPlaylistId,
  });
  const commitLabel = reviewedAction === "publish-late"
    ? "Publish late now and advance rotation"
    : reviewedAction === "replace"
      ? "Replace playlist"
      : "Attach playlist";

  const closePlaylistSelector = useCallback((restoreFocus = false) => {
    setIsPlaylistSelectorOpen(false);
    if (restoreFocus) {
      requestAnimationFrame(() => playlistTriggerRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    if (!isPlaylistSelectorOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    playlistDialogCloseRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (state !== "saving") closePlaylistSelector(true);
        return;
      }

      if (event.key !== "Tab" || !playlistDialogRef.current) return;

      const focusable = Array.from(
        playlistDialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable[0];
      const last = focusable.at(-1);

      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closePlaylistSelector, isPlaylistSelectorOpen, state]);

  async function saveAttachment() {
    const commit = buildAttachmentCommit({
      draftId: selectedPlaylistId,
      action: reviewedAction,
      expectedCurrentDraftId: currentAttachment?.draftId,
      reviewReady,
    });
    if (!selectedDropId || !commit) return;
    setPendingPlaylistId(selectedPlaylistId);
    setState("saving");
    setMessage(undefined);
    try {
      const response = await fetch(`/api/drops/${encodeURIComponent(selectedDropId)}/playlist`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(commit),
      });
      const result = (await response.json()) as {
        error?: string;
        warning?: string;
        recovered?: boolean;
        playlist?: { title: string; sourceDraftId?: string };
      };
      if (!response.ok) {
        if (response.status === 409) {
          setReviewReady(false);
          setCurrentAttachments({});
          router.refresh();
        }
        throw new Error(result.error ?? "Could not attach this playlist.");
      }
      const savedPlaylist = result.playlist ?? {
        title: selectedPlaylist?.title ?? "Attached playlist",
        sourceDraftId: selectedPlaylistId,
      };
      setCurrentAttachments((attachments) => ({
        ...attachments,
        [selectedDropId]: {
          title: savedPlaylist.title,
          draftId: savedPlaylist.sourceDraftId,
        },
      }));
      setState("saved");
      setReviewReady(false);
      setMessage(result.warning ?? (result.recovered
        ? "Published late. The club rotation is moving again."
        : `Ready for ${selectedDrop?.scheduledLabel ?? "the assigned drop time"}.`));
      router.refresh();
    } catch (error) {
      setState("idle");
      setMessage(error instanceof Error ? error.message : "Could not attach this playlist.");
    } finally {
      setPendingPlaylistId(undefined);
    }
  }

  function selectPlaylist(nextPlaylistId: string) {
    const selection = selectPlaylistForReview(nextPlaylistId);
    setSelectedPlaylistId(selection.selectedPlaylistId);
    setReviewReady(selection.reviewReady);
    setState("idle");
    setMessage(undefined);
    closePlaylistSelector(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveAttachment();
  }

  return <form className="drop-attachment-form" onSubmit={submit}>
    {!dropId && <div className="field">
      <label htmlFor={`drop-for-${playlistId ?? "playlist"}`}>Club and assigned time</label>
      <select
        id={`drop-for-${playlistId ?? "playlist"}`}
        value={selectedDropId}
        onChange={(event) => {
          const nextDropId = event.target.value;
          const nextDrop = drops.find((drop) => drop.id === nextDropId);
          const nextAttachment = currentAttachments[nextDropId] ?? {
            title: nextDrop?.currentPlaylistTitle,
            draftId: nextDrop?.currentPlaylistDraftId,
          };
          setSelectedDropId(nextDropId);
          if (!playlistId) {
            setSelectedPlaylistId(nextAttachment.draftId ?? "");
          }
          setReviewReady(Boolean(playlistId));
          setState("idle");
          setMessage(undefined);
        }}
      >
        {drops.map((drop) => <option value={drop.id} key={drop.id}>
          {drop.clubName} · {drop.scheduledLabel}
        </option>)}
      </select>
    </div>}
    {!playlistId && <div className="field">
      <label id={`playlist-label-${dropId ?? "drop"}`}>Prepared playlist</label>
      <button
        ref={playlistTriggerRef}
        id={`playlist-for-${dropId ?? "drop"}`}
        className="playlist-selector-trigger"
        type="button"
        aria-labelledby={`playlist-label-${dropId ?? "drop"} playlist-for-${dropId ?? "drop"}`}
        aria-haspopup="dialog"
        aria-expanded={isPlaylistSelectorOpen}
        aria-controls={playlistDialogId}
        disabled={playlists.length === 0}
        onClick={() => setIsPlaylistSelectorOpen(true)}
      >
        <span className="playlist-selector-trigger-title"><Library size={16} /> {selectedPlaylist?.title ?? "Choose a playlist"}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
    </div>}
    {displayedCurrentPlaylistTitle && <p className="drop-attachment-current">
      Currently attached: <strong>{displayedCurrentPlaylistTitle}</strong>
    </p>}
    {reviewReady && selectedDrop && selectedPlaylist && <section className="panel drop-attachment-review" aria-labelledby={`attachment-review-${selectedDrop.id}`}>
      <span className="section-kicker">Review before committing</span>
      <h3 id={`attachment-review-${selectedDrop.id}`}>{selectedDrop.clubName} · {selectedDrop.scheduledLabel}</h3>
      <p>
        {reviewedAction === "publish-late"
          ? <><strong>{selectedPlaylist.title}</strong> will publish immediately, count as this drop, and advance the club rotation.</>
          : reviewedAction === "replace"
            ? <>Replace <strong>{displayedCurrentPlaylistTitle}</strong> with <strong>{selectedPlaylist.title}</strong>. It stays private until the scheduled drop.</>
            : reviewedAction === "no-op"
              ? <><strong>{selectedPlaylist.title}</strong> is already attached. Nothing will change.</>
              : <>Attach <strong>{selectedPlaylist.title}</strong>. It stays private until the scheduled drop.</>}
      </p>
      {reviewedAction !== "no-op" && <button
        className="button button-dark"
        type="submit"
        disabled={state === "saving"}
      >
        {state === "saving"
          ? <><LoaderCircle size={15} className="spin" /> Saving…</>
          : <><CalendarCheck size={15} /> {commitLabel}</>}
      </button>}
    </section>}
    {!isPlaylistSelectorOpen && message && <div className="drop-attachment-feedback">
      <p className={state === "idle" ? "form-error" : "form-note"} role={state === "idle" ? "alert" : "status"}>{message}</p>
      {!reviewReady && state === "idle" && selectedPlaylistId && <button
        className="button button-ghost button-small"
        type="button"
        onClick={() => {
          setReviewReady(true);
          setMessage(undefined);
        }}
      >Review latest state</button>}
    </div>}
    {isPlaylistSelectorOpen && <div className="playlist-selector-layer">
      <button
        className="playlist-selector-backdrop"
        type="button"
        aria-label="Close playlist selector"
        disabled={state === "saving"}
        onClick={() => closePlaylistSelector(true)}
      />
      <section
        ref={playlistDialogRef}
        id={playlistDialogId}
        className="playlist-selector-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={playlistDialogTitleId}
      >
        <div className="playlist-selector-heading">
          <div><span className="section-kicker">Your library</span><h2 id={playlistDialogTitleId}>Choose a playlist</h2></div>
          <button
            ref={playlistDialogCloseRef}
            className="playlist-selector-close"
            type="button"
            aria-label="Close playlist selector"
            disabled={state === "saving"}
            onClick={() => closePlaylistSelector(true)}
          >
            <X size={19} />
          </button>
        </div>
        <p>Select the prepared playlist you want to attach to this drop.</p>
        <div className="playlist-selector-list" aria-label="Your prepared playlists" aria-busy={state === "saving"}>
          {playlists.map((playlist) => {
            const isSelected = playlist.id === selectedPlaylistId;
            const isPending = playlist.id === pendingPlaylistId;
            return <button
              className={`playlist-selector-option${isSelected ? " playlist-selector-option-selected" : ""}`}
              type="button"
              aria-pressed={isSelected}
              disabled={state === "saving"}
              key={playlist.id}
              onClick={() => selectPlaylist(playlist.id)}
            >
              <span className="playlist-selector-option-icon"><Music2 size={18} /></span>
              <span className="playlist-selector-option-copy"><strong>{playlist.title}</strong><small>{isPending ? "Attaching playlist…" : isSelected ? "Selected for review" : "Prepared playlist"}</small></span>
              {isPending ? <LoaderCircle size={18} className="spin" aria-hidden="true" /> : isSelected && <Check size={18} aria-hidden="true" />}
            </button>;
          })}
        </div>
        {message && state === "idle" && <p className="form-error playlist-selector-error" role="alert">{message}</p>}
        <div className="playlist-selector-footer">
          <button
            className="button button-ghost"
            type="button"
            disabled={state === "saving"}
            onClick={() => closePlaylistSelector(true)}
          >
            {displayedCurrentPlaylistTitle ? "Keep current playlist" : "Not now"}
          </button>
        </div>
      </section>
    </div>}
  </form>;
}
