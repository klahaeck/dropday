"use client";

import { FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Check, ChevronDown, Library, LoaderCircle, Music2, X } from "lucide-react";

export interface DropAttachmentOption {
  id: string;
  clubName: string;
  scheduledLabel: string;
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
  const displayedCurrentPlaylistTitle = !playlistId && state === "saved"
    ? selectedPlaylist?.title
    : selectedDrop?.currentPlaylistTitle;
  const isReplacing = Boolean(selectedDrop?.currentPlaylistTitle);
  const isUpdatingCurrent = Boolean(
    selectedDrop?.currentPlaylistDraftId
    && selectedDrop.currentPlaylistDraftId === selectedPlaylistId,
  );

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

  async function saveAttachment(nextPlaylistId: string, closeOnSuccess: boolean) {
    if (!selectedDropId || !nextPlaylistId) return;
    setPendingPlaylistId(nextPlaylistId);
    setState("saving");
    setMessage(undefined);
    try {
      const response = await fetch(`/api/drops/${encodeURIComponent(selectedDropId)}/playlist`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: nextPlaylistId }),
      });
      const result = (await response.json()) as { error?: string; warning?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not attach this playlist.");
      setSelectedPlaylistId(nextPlaylistId);
      setState("saved");
      setMessage(result.warning ?? `Ready for ${selectedDrop?.scheduledLabel ?? "the assigned drop time"}.`);
      if (closeOnSuccess) closePlaylistSelector(true);
      router.refresh();
    } catch (error) {
      setState("idle");
      setMessage(error instanceof Error ? error.message : "Could not attach this playlist.");
    } finally {
      setPendingPlaylistId(undefined);
    }
  }

  async function selectPlaylist(nextPlaylistId: string) {
    if (nextPlaylistId === selectedPlaylistId) {
      closePlaylistSelector(true);
      return;
    }
    await saveAttachment(nextPlaylistId, true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveAttachment(selectedPlaylistId, false);
  }

  return <form className="drop-attachment-form" onSubmit={submit}>
    {!dropId && <div className="field">
      <label htmlFor={`drop-for-${playlistId ?? "playlist"}`}>Club and assigned time</label>
      <select
        id={`drop-for-${playlistId ?? "playlist"}`}
        value={selectedDropId}
        onChange={(event) => {
          setSelectedDropId(event.target.value);
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
    {playlistId && <div className="drop-attachment-actions">
      <button
        className="button button-dark"
        type="submit"
        disabled={state === "saving" || !selectedDropId || !selectedPlaylistId}
      >
        {state === "saving" ? <><LoaderCircle size={15} className="spin" /> Attaching…</>
          : state === "saved" ? <><Check size={15} /> Attached</>
            : <><CalendarCheck size={15} /> {isUpdatingCurrent ? "Update attached playlist" : isReplacing ? "Replace attached playlist" : "Attach to this drop"}</>}
      </button>
      {message && <p className={state === "idle" ? "form-error" : "form-note"} role={state === "idle" ? "alert" : "status"}>{message}</p>}
    </div>}
    {!playlistId && !isPlaylistSelectorOpen && message && <p className={`drop-attachment-feedback ${state === "idle" ? "form-error" : "form-note"}`} role={state === "idle" ? "alert" : "status"}>{message}</p>}
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
              <span className="playlist-selector-option-copy"><strong>{playlist.title}</strong><small>{isPending ? "Updating attached playlist…" : isSelected ? "Currently attached" : "Prepared playlist"}</small></span>
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
