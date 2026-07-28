"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Bold, Check, ImagePlus, Italic, List, LoaderCircle, X } from "lucide-react";
import type { ArtworkKind } from "@/lib/blob-artwork";
import { DEFAULT_CLUB_ACCENT, normalizeClubAccent } from "@/lib/club-accent";
import { CLUB_DESCRIPTION_HTML_MAX_LENGTH, CLUB_DESCRIPTION_MAX_LENGTH, sanitizeClubDescriptionHtml } from "@/lib/club-description";
import { PLAYLIST_DESCRIPTION_HTML_MAX_LENGTH, PLAYLIST_DESCRIPTION_MAX_LENGTH } from "@/lib/playlist-description";
import { getPlaylistVersions } from "@/lib/playlist-providers";
import { plainTextToRichTextHtml } from "@/lib/rich-text";
import {
  THEME_DESCRIPTION_HTML_MAX_LENGTH,
  THEME_DESCRIPTION_MAX_LENGTH,
  sanitizeThemeDescriptionHtml,
} from "@/lib/theme-description";
import type { ClubTheme, PlaylistDraft, RecurrenceConfig } from "@/types/domain";

const ARTWORK_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const RITUAL_TIMEZONES = [
  "America/Chicago",
  "America/New_York",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
];

async function prepareArtwork(file: File): Promise<File> {
  if (!ARTWORK_TYPES.has(file.type)) throw new Error("Choose a JPEG, PNG, or WebP image.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Choose an image smaller than 10 MB.");

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const candidate = new window.Image();
      candidate.onload = () => resolve(candidate);
      candidate.onerror = () => reject(new Error("This image could not be opened."));
      candidate.src = sourceUrl;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("This image has no usable dimensions.");

    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 720;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the image.");
    // Letterboxing should match the paper the artwork sits on, which differs per
    // skin, so read it from the active theme instead of hard-coding one palette.
    const paper = getComputedStyle(document.documentElement).getPropertyValue("--paper").trim();
    context.fillStyle = paper || "#f4f0e6";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) throw new Error("This browser could not prepare the image.");
    if (blob.size > 2 * 1024 * 1024) throw new Error("This image is still too large after optimization. Try a simpler image.");
    return new File([blob], "artwork.jpg", { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

async function uploadArtwork(kind: ArtworkKind, ownerId: string, file: File, onProgress?: (percentage: number) => void) {
  return upload(`artwork/${kind}/${encodeURIComponent(ownerId)}/${Date.now()}.jpg`, file, {
    access: "public",
    contentType: "image/jpeg",
    handleUploadUrl: "/api/artwork/upload",
    onUploadProgress: ({ percentage }) => onProgress?.(Math.round(percentage)),
  });
}

async function discardUploadedArtwork(urls: string[]) {
  if (!urls.length) return;
  try {
    await fetch("/api/artwork/discard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
    });
  } catch {}
}

function ritualStartLabel(startsOn: string, localTime: string) {
  const [year, month, day] = startsOn.split("-").map(Number);
  const [hour, minute] = localTime.split(":").map(Number);
  if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) return;

  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${date} at ${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

function RitualFields({
  idPrefix,
  schedule,
  kicker = "02 · Drop day",
}: {
  idPrefix: string;
  schedule?: Pick<RecurrenceConfig, "startsOn" | "localTime" | "timezone" | "frequency" | "interval">;
  kicker?: string;
}) {
  const [startsOn, setStartsOn] = useState(schedule?.startsOn ?? "");
  const [localTime, setLocalTime] = useState(schedule?.localTime ?? "09:00");
  const [timezone, setTimezone] = useState(schedule?.timezone ?? "America/Chicago");
  const [frequency, setFrequency] = useState<RecurrenceConfig["frequency"]>(schedule?.frequency ?? "weekly");
  const [interval, setInterval] = useState(String(schedule?.interval ?? 1));
  const intervalNumber = Number(interval);
  const startLabel = ritualStartLabel(startsOn, localTime);
  const unit = frequency === "daily" ? "day" : frequency === "weekly" ? "week" : "month";
  const cadence = intervalNumber === 1 ? `Every ${unit}` : `Every ${interval || "N"} ${unit}s`;
  const summary = startLabel
    ? `${cadence}, beginning ${startLabel} in ${timezone}.`
    : "Choose a start date to anchor the first drop and every drop after it.";
  const timezoneOptions = RITUAL_TIMEZONES.includes(timezone)
    ? RITUAL_TIMEZONES
    : [timezone, ...RITUAL_TIMEZONES];

  return <section className="form-section">
    <span className="section-kicker">{kicker}</span>
    <h2>Set the ritual</h2>
    <p>Choose the first drop, then choose how often it repeats.</p>
    <div className="form-grid">
      <div className="field">
        <label htmlFor={`${idPrefix}-starts-on`}>Start date</label>
        <input id={`${idPrefix}-starts-on`} name="startsOn" type="date" required value={startsOn} onChange={(event) => setStartsOn(event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-local-time`}>Start time</label>
        <input id={`${idPrefix}-local-time`} name="localTime" type="time" required value={localTime} onChange={(event) => setLocalTime(event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-timezone`}>Timezone</label>
        <select id={`${idPrefix}-timezone`} name="timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)}>
          {timezoneOptions.map((option) => <option key={option}>{option}</option>)}
        </select>
      </div>
      <div className="field ritual-repeat-field">
        <label htmlFor={`${idPrefix}-interval`} id={`${idPrefix}-repeat-label`}>Repeat</label>
        <div className="ritual-repeat-row" role="group" aria-labelledby={`${idPrefix}-repeat-label`}>
          <span>Every</span>
          <input
            id={`${idPrefix}-interval`}
            name="interval"
            type="number"
            min="1"
            max="52"
            required
            aria-label="Repeat interval"
            aria-describedby={`${idPrefix}-summary`}
            value={interval}
            onChange={(event) => setInterval(event.target.value)}
          />
          <select
            id={`${idPrefix}-frequency`}
            name="frequency"
            aria-label="Repeat unit"
            aria-describedby={`${idPrefix}-summary`}
            value={frequency}
            onChange={(event) => setFrequency(event.target.value as RecurrenceConfig["frequency"])}
          >
            <option value="daily">{intervalNumber === 1 ? "day" : "days"}</option>
            <option value="weekly">{intervalNumber === 1 ? "week" : "weeks"}</option>
            <option value="monthly">{intervalNumber === 1 ? "month" : "months"}</option>
          </select>
        </div>
      </div>
      <p id={`${idPrefix}-summary`} className="ritual-summary field-full" aria-live="polite">{summary}</p>
    </div>
  </section>;
}

function ArtworkPicker({
  id,
  label,
  initials,
  existingUrl,
  onChange,
  onBusyChange,
}: {
  id: string;
  label: string;
  initials: string;
  existingUrl?: string;
  onChange(value: File | null): void;
  onBusyChange(busy: boolean): void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [removed, setRemoved] = useState(false);
  const [fileName, setFileName] = useState<string>();
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function select(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    onBusyChange(true);
    setError(undefined);
    try {
      const prepared = await prepareArtwork(file);
      setPreviewUrl(URL.createObjectURL(prepared));
      setRemoved(false);
      setFileName(file.name);
      onChange(prepared);
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : "This image could not be prepared.");
    } finally {
      onBusyChange(false);
    }
  }

  function remove() {
    setPreviewUrl(undefined);
    setRemoved(true);
    setFileName(undefined);
    setError(undefined);
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const imageUrl = previewUrl ?? (removed ? undefined : existingUrl);

  return <div className="field field-full">
    <label htmlFor={id}>{label} <span className="optional-label">Optional</span></label>
    <div className="artwork-picker">
      <div className={`artwork-preview${imageUrl ? " artwork-preview-image" : ""}`}>
        {imageUrl ? <Image src={imageUrl} alt={`Selected ${label.toLowerCase()}`} fill sizes="112px" unoptimized /> : <><span>{initials}</span><i /></>}
      </div>
      <div className="artwork-picker-copy">
        <input ref={inputRef} id={id} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={select} />
        <div className="artwork-picker-actions"><label htmlFor={id} className="button button-ghost button-small"><ImagePlus size={15} /> {imageUrl ? "Replace image" : "Add image"}</label>{imageUrl && <button type="button" className="button button-ghost button-small" onClick={remove}><X size={15} /> Remove</button>}</div>
        <p>{error ?? fileName ?? "JPEG, PNG, or WebP up to 10 MB. Images are cropped square."}</p>
      </div>
    </div>
  </div>;
}

function SubmitState({ loading, success, idle }: { loading: boolean; success: boolean; idle: string }) {
  if (loading) return <><LoaderCircle size={15} className="spin" /> Saving…</>;
  if (success) return <><Check size={15} /> Saved</>;
  return <>{idle}</>;
}

export function JoinRequestButton({ clubId, initialRequested = false }: { clubId: string; initialRequested?: boolean }) {
  const [state, setState] = useState<"idle" | "loading" | "sent" | "blocked">(initialRequested ? "sent" : "idle");
  const [error, setError] = useState<string>();
  async function request() {
    setState("loading");
    setError(undefined);
    try {
      const response = await fetch("/api/join-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clubId }) });
      const result = (await response.json()) as { error?: string };
      if (response.status === 402) {
        setState("blocked");
        return;
      }
      if (!response.ok) throw new Error(result.error ?? "Could not send this request.");
      setState("sent");
    } catch (requestError) {
      setState("idle");
      setError(requestError instanceof Error ? requestError.message : "Could not send this request.");
    }
  }
  return <div><button className="button button-dark" type="button" onClick={request} disabled={state !== "idle"}>{state === "loading" ? "Sending…" : state === "sent" ? "Request sent" : state === "blocked" ? "Upgrade or leave a club" : "Request to join"}</button>{state === "blocked" && <p className="form-note" style={{ marginTop: 10 }}>Free accounts can hold three active memberships.</p>}{error && <p className="form-error" role="alert">{error}</p>}</div>;
}

export function DraftComposer({ ownerId, playlist }: { ownerId: string; playlist?: PlaylistDraft }) {
  const initialDescriptionHtml = playlist?.descriptionHtml ?? plainTextToRichTextHtml(playlist?.description ?? "");
  const initialVersions = playlist ? getPlaylistVersions(playlist) : [];
  const initialSpotifyUrl = initialVersions.find((version) => version.provider === "spotify")?.canonicalUrl ?? "";
  const initialAppleMusicUrl = initialVersions.find((version) => version.provider === "apple-music")?.canonicalUrl ?? "";
  const [loading, setLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [message, setMessage] = useState<string>();
  const [title, setTitle] = useState(playlist?.title ?? "");
  const [descriptionHtml, setDescriptionHtml] = useState(initialDescriptionHtml);
  const [descriptionText, setDescriptionText] = useState(playlist?.description ?? "");
  const [artworkFile, setArtworkFile] = useState<File>();
  const [artworkPreviewUrl, setArtworkPreviewUrl] = useState<string | undefined>(playlist?.metadata.artworkUrl);
  const [artworkRemoved, setArtworkRemoved] = useState(false);
  const [artworkName, setArtworkName] = useState<string>();
  const [uploadProgress, setUploadProgress] = useState<number>();
  const editorRef = useRef<HTMLDivElement>(null);
  const artworkInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => () => {
    if (artworkPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(artworkPreviewUrl);
  }, [artworkPreviewUrl]);

  function updateDescription() {
    const editor = editorRef.current;
    if (!editor) return;
    setDescriptionHtml(editor.innerHTML);
    setDescriptionText(editor.innerText);
  }

  function formatDescription(command: "bold" | "italic" | "insertUnorderedList") {
    editorRef.current?.focus();
    document.execCommand(command, false);
    updateDescription();
  }

  function pasteDescription(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
  }

  async function selectArtwork(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    setImageLoading(true);
    setMessage(undefined);
    try {
      const prepared = await prepareArtwork(file);
      setArtworkFile(prepared);
      setArtworkPreviewUrl(URL.createObjectURL(prepared));
      setArtworkRemoved(false);
      setArtworkName(file.name);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "This image could not be prepared.");
    } finally {
      setImageLoading(false);
    }
  }

  function removeArtwork() {
    setArtworkFile(undefined);
    setArtworkPreviewUrl(undefined);
    setArtworkRemoved(true);
    setArtworkName(undefined);
    setUploadProgress(undefined);
    if (artworkInputRef.current) artworkInputRef.current.value = "";
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const spotifyUrl = String(form.get("spotifyUrl") ?? "").trim();
    const appleMusicUrl = String(form.get("appleMusicUrl") ?? "").trim();
    if (!spotifyUrl && !appleMusicUrl) {
      setMessage("Add a Spotify or Apple Music playlist URL.");
      (event.currentTarget.elements.namedItem("spotifyUrl") as HTMLInputElement | null)?.focus();
      return;
    }
    const normalizedDescription = descriptionText.trim();
    if (normalizedDescription.length < 2) {
      setMessage("Add a description before saving this playlist.");
      editorRef.current?.focus();
      return;
    }
    if (normalizedDescription.length > PLAYLIST_DESCRIPTION_MAX_LENGTH) {
      setMessage(`Keep the description to ${PLAYLIST_DESCRIPTION_MAX_LENGTH.toLocaleString()} characters or fewer.`);
      editorRef.current?.focus();
      return;
    }
    if (descriptionHtml.length > PLAYLIST_DESCRIPTION_HTML_MAX_LENGTH) {
      setMessage("This description has too much formatting. Simplify it and try again.");
      editorRef.current?.focus();
      return;
    }
    setLoading(true);
    setMessage(undefined);
    try {
      if (artworkFile) setUploadProgress(0);
      const artworkUrl = artworkFile
        ? (await uploadArtwork("playlist", ownerId, artworkFile, setUploadProgress)).url
        : undefined;
      const response = await fetch(playlist ? `/api/drafts/${playlist.id}` : "/api/drafts", {
        method: playlist ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...Object.fromEntries(form.entries()), artworkUrl, removeArtwork: artworkRemoved }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setLoading(false);
        setMessage(result.error ?? "Could not save this playlist.");
        return;
      }
      router.push(playlist ? `/app/library/${playlist.id}` : "/app/library");
      router.refresh();
    } catch {
      setLoading(false);
      setMessage("Could not save this playlist. Check your connection and try again.");
    }
  }

  const initials = title.trim().slice(0, 2).toUpperCase() || "DD";

  return <form className="form-shell" onSubmit={submit}>
    <div className="form-grid playlist-form-grid">
      <div className="field field-full"><label htmlFor="spotify-url">Spotify playlist URL <span className="optional-label">Add one or both</span></label><input id="spotify-url" name="spotifyUrl" type="url" placeholder="https://open.spotify.com/playlist/…" defaultValue={initialSpotifyUrl} /></div>
      <div className="field field-full"><label htmlFor="apple-music-url">Apple Music playlist URL <span className="optional-label">Add one or both</span></label><input id="apple-music-url" name="appleMusicUrl" type="url" placeholder="https://music.apple.com/…/playlist/…" defaultValue={initialAppleMusicUrl} /></div>
      <div className="field field-full"><label htmlFor="draft-title">Drop title</label><input id="draft-title" name="title" type="text" required minLength={2} maxLength={100} placeholder="Sunburn after dark" value={title} onChange={(event) => setTitle(event.target.value)} /></div>
      <div className="field field-full">
        <label id="draft-description-label">Description</label>
        <div className="rich-text-shell">
          <div className="rich-text-toolbar" role="toolbar" aria-label="Description formatting">
            <button type="button" aria-label="Bold" title="Bold" onMouseDown={(event) => event.preventDefault()} onClick={() => formatDescription("bold")}><Bold size={16} /></button>
            <button type="button" aria-label="Italic" title="Italic" onMouseDown={(event) => event.preventDefault()} onClick={() => formatDescription("italic")}><Italic size={16} /></button>
            <button type="button" aria-label="Bulleted list" title="Bulleted list" onMouseDown={(event) => event.preventDefault()} onClick={() => formatDescription("insertUnorderedList")}><List size={16} /></button>
          </div>
          <div ref={editorRef} id="draft-description" className="rich-text-editor" contentEditable role="textbox" aria-labelledby="draft-description-label" aria-multiline="true" aria-required="true" data-placeholder="Tell the club what they are about to hear." onInput={updateDescription} onPaste={pasteDescription} suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: initialDescriptionHtml }} />
        </div>
        <input type="hidden" name="descriptionHtml" value={descriptionHtml} />
        <span className={`field-counter${descriptionText.length > PLAYLIST_DESCRIPTION_MAX_LENGTH ? " field-counter-over" : ""}`}>{descriptionText.length.toLocaleString()}/{PLAYLIST_DESCRIPTION_MAX_LENGTH.toLocaleString()}</span>
      </div>
      <div className="field field-full">
        <label htmlFor="playlist-artwork">Playlist image <span className="optional-label">Optional</span></label>
        <div className="artwork-picker">
          <div className={`artwork-preview${artworkPreviewUrl ? " artwork-preview-image" : ""}`}>
            {artworkPreviewUrl ? <Image src={artworkPreviewUrl} alt="Selected playlist artwork" fill sizes="112px" unoptimized /> : <><span>{initials}</span><i /></>}
          </div>
          <div className="artwork-picker-copy">
            <input ref={artworkInputRef} id="playlist-artwork" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectArtwork} />
            <div className="artwork-picker-actions"><label htmlFor="playlist-artwork" className="button button-ghost button-small"><ImagePlus size={15} /> {artworkPreviewUrl ? "Replace image" : "Add image"}</label>{artworkPreviewUrl && <button type="button" className="button button-ghost button-small" onClick={removeArtwork}><X size={15} /> Remove</button>}</div>
            <p>{imageLoading ? "Optimizing image…" : uploadProgress !== undefined && loading ? `Uploading to Vercel Blob… ${uploadProgress}%` : artworkName ?? (artworkPreviewUrl ? "Current playlist image." : "JPEG, PNG, or WebP up to 10 MB. Images are cropped square.")}</p>
          </div>
        </div>
      </div>
    </div>
    {message && <p className="form-note form-error" role="alert">{message}</p>}
    <div className="form-actions"><button className="button button-dark" disabled={loading || imageLoading}><SubmitState loading={loading} success={false} idle={playlist ? "Save changes" : "Save to library"} /></button></div>
  </form>;
}

export function CreateClubForm({ canOwn, ownerId }: { canOwn: boolean; ownerId: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>();
  const [clubName, setClubName] = useState("");
  const [clubDescriptionHtml, setClubDescriptionHtml] = useState("");
  const [clubDescriptionText, setClubDescriptionText] = useState("");
  const [clubAccent, setClubAccent] = useState(DEFAULT_CLUB_ACCENT);
  const [useTheme, setUseTheme] = useState(false);
  const [themeName, setThemeName] = useState("");
  const [clubArtwork, setClubArtwork] = useState<File | null>(null);
  const [themeArtwork, setThemeArtwork] = useState<File | null>(null);
  const [preparingImages, setPreparingImages] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<string>();
  const clubDescriptionEditorRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  function imageBusy(busy: boolean) {
    setPreparingImages((count) => Math.max(0, count + (busy ? 1 : -1)));
  }

  function updateClubDescription() {
    const editor = clubDescriptionEditorRef.current;
    if (!editor) return;
    setClubDescriptionHtml(editor.innerHTML);
    setClubDescriptionText(editor.innerText);
  }

  function formatClubDescription(command: "bold" | "italic" | "insertUnorderedList") {
    clubDescriptionEditorRef.current?.focus();
    document.execCommand(command, false);
    updateClubDescription();
  }

  function pasteClubDescription(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canOwn) return;
    const normalizedDescription = clubDescriptionText.trim();
    if (normalizedDescription.length < 10) {
      setMessage("Add a description of at least 10 characters before creating this club.");
      clubDescriptionEditorRef.current?.focus();
      return;
    }
    if (normalizedDescription.length > CLUB_DESCRIPTION_MAX_LENGTH) {
      setMessage(`Keep the description to ${CLUB_DESCRIPTION_MAX_LENGTH.toLocaleString()} characters or fewer.`);
      clubDescriptionEditorRef.current?.focus();
      return;
    }
    if (clubDescriptionHtml.length > CLUB_DESCRIPTION_HTML_MAX_LENGTH) {
      setMessage("This description has too much formatting. Simplify it and try again.");
      clubDescriptionEditorRef.current?.focus();
      return;
    }
    setLoading(true);
    setMessage(undefined);
    const form = new FormData(event.currentTarget);
    const uploadedUrls: string[] = [];
    let submissionStarted = false;
    try {
      let clubImageUrl: string | undefined;
      let themeImageUrl: string | undefined;
      if (clubArtwork) {
        setUploadStatus("Uploading club image…");
        clubImageUrl = (await uploadArtwork("club", ownerId, clubArtwork, (progress) => setUploadStatus(`Uploading club image… ${progress}%`))).url;
        uploadedUrls.push(clubImageUrl);
      }
      if (useTheme && themeArtwork) {
        setUploadStatus("Uploading theme image…");
        themeImageUrl = (await uploadArtwork("theme", ownerId, themeArtwork, (progress) => setUploadStatus(`Uploading theme image… ${progress}%`))).url;
        uploadedUrls.push(themeImageUrl);
      }
      setUploadStatus(undefined);
      submissionStarted = true;
      const response = await fetch("/api/clubs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...Object.fromEntries(form.entries()), clubImageUrl, themeImageUrl }),
      });
      const result = (await response.json()) as { slug?: string; error?: string; demo?: boolean };
      if (!response.ok) {
        await discardUploadedArtwork(uploadedUrls);
        setLoading(false);
        setMessage(result.error ?? "Could not create this club.");
        return;
      }
      if (result.demo) return router.push("/app/clubs/needle-exchange");
      router.push(`/app/clubs/${result.slug}`);
    } catch {
      if (!submissionStarted) await discardUploadedArtwork(uploadedUrls);
      setLoading(false);
      setUploadStatus(undefined);
      setMessage("Could not create this club. Check your connection and try again.");
    }
  }

  if (!canOwn) return <div className="empty-state"><h2>A paid plan is required to own a club.</h2><p>Free members can join three clubs but may never own one. Choose any paid tier to start hosting.</p><a href="/pricing" className="button button-dark">See paid plans</a></div>;
  return <form className="form-shell" onSubmit={submit}>
    <section className="form-section"><span className="section-kicker">01 · Identity</span><h2>Name the room</h2><div className="form-grid"><div className="field"><label htmlFor="name">Club name</label><input id="name" name="name" required minLength={2} maxLength={70} placeholder="Needle Exchange" value={clubName} onChange={(event) => setClubName(event.target.value)} /></div><div className="field"><label htmlFor="visibility">Visibility</label><select id="visibility" name="visibility"><option value="public">Public · discoverable</option><option value="private">Private · link or invite only</option></select></div><div className="field field-full"><label id="description-label">Description</label><div className="rich-text-shell"><div className="rich-text-toolbar" role="toolbar" aria-label="Description formatting"><button type="button" aria-label="Bold" title="Bold" onMouseDown={(event) => event.preventDefault()} onClick={() => formatClubDescription("bold")}><Bold size={16} /></button><button type="button" aria-label="Italic" title="Italic" onMouseDown={(event) => event.preventDefault()} onClick={() => formatClubDescription("italic")}><Italic size={16} /></button><button type="button" aria-label="Bulleted list" title="Bulleted list" onMouseDown={(event) => event.preventDefault()} onClick={() => formatClubDescription("insertUnorderedList")}><List size={16} /></button></div><div ref={clubDescriptionEditorRef} id="description" className="rich-text-editor rich-text-editor-compact" contentEditable role="textbox" aria-labelledby="description-label" aria-multiline="true" aria-required="true" data-placeholder="What kind of listening club is this?" onInput={updateClubDescription} onPaste={pasteClubDescription} suppressContentEditableWarning /></div><input type="hidden" name="description" value={clubDescriptionText} /><input type="hidden" name="descriptionHtml" value={clubDescriptionHtml} /><span className={`field-counter${clubDescriptionText.length > CLUB_DESCRIPTION_MAX_LENGTH ? " field-counter-over" : ""}`}>{clubDescriptionText.length.toLocaleString()}/{CLUB_DESCRIPTION_MAX_LENGTH.toLocaleString()}</span></div><div className="field field-full"><label htmlFor="accent">Primary color</label><div className="color-field"><input id="accent" name="accent" type="color" value={clubAccent} onChange={(event) => setClubAccent(event.target.value)} /><span>{clubAccent.toUpperCase()}</span></div><small>Used as the background color on the club detail page.</small></div><ArtworkPicker id="club-image" label="Club image" initials={clubName.trim().slice(0, 1).toUpperCase() || "D"} onChange={setClubArtwork} onBusyChange={imageBusy} /></div></section>
    <RitualFields idPrefix="new-club-ritual" />
    <section className="form-section"><span className="section-kicker">03 · Listening format</span><h2>Theme or freeform</h2><label className="theme-current-toggle"><input type="checkbox" checked={useTheme} onChange={(event) => setUseTheme(event.target.checked)} /><span><strong>Start this club with a theme</strong><small>Leave this unchecked for a freeform club. You can add themes later.</small></span></label>{useTheme && <div className="form-grid theme-fields-grid optional-theme-fields"><div className="field"><label htmlFor="theme">Theme</label><input id="theme" name="theme" required minLength={2} maxLength={100} placeholder="Heatwave at midnight" value={themeName} onChange={(event) => setThemeName(event.target.value)} /></div><div className="field"><label htmlFor="guidance">Guidance</label><textarea id="guidance" name="guidance" maxLength={THEME_DESCRIPTION_MAX_LENGTH} placeholder="Songs that feel like…" /></div><ArtworkPicker id="theme-image" label="Theme image" initials={themeName.trim().slice(0, 2).toUpperCase() || "TH"} onChange={setThemeArtwork} onBusyChange={imageBusy} /></div>}</section>
    {message && <p className="form-note form-error" role="alert">{message}</p>}<div className="form-actions"><span className="form-note">{uploadStatus ?? "The creator becomes the first queue member."}</span><button className="button button-dark" disabled={loading || preparingImages > 0}><SubmitState loading={loading} success={false} idle="Create club" /></button></div>
  </form>;
}

export function NewClubThemeForm({
  clubSlug,
  ownerId,
  nextVersion,
  cancelHref,
}: {
  clubSlug: string;
  ownerId: string;
  nextVersion: number;
  cancelHref: string;
}) {
  return <ClubThemeEditor clubSlug={clubSlug} ownerId={ownerId} version={nextVersion} cancelHref={cancelHref} />;
}

export function EditClubThemeForm({
  clubSlug,
  ownerId,
  theme,
  cancelHref,
}: {
  clubSlug: string;
  ownerId: string;
  theme: ClubTheme;
  cancelHref: string;
}) {
  return <ClubThemeEditor clubSlug={clubSlug} ownerId={ownerId} version={theme.version} cancelHref={cancelHref} theme={theme} />;
}

function ClubThemeEditor({
  clubSlug,
  ownerId,
  version,
  cancelHref,
  theme,
}: {
  clubSlug: string;
  ownerId: string;
  version: number;
  cancelHref: string;
  theme?: ClubTheme;
}) {
  const initialThemeDescriptionHtml = theme?.guidanceHtml
    ? sanitizeThemeDescriptionHtml(theme.guidanceHtml)
    : plainTextToRichTextHtml(theme?.guidance ?? "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>();
  const [themeName, setThemeName] = useState(theme?.name ?? "");
  const [themeDescriptionHtml, setThemeDescriptionHtml] = useState(initialThemeDescriptionHtml);
  const [themeDescriptionText, setThemeDescriptionText] = useState(theme?.guidance ?? "");
  const [themeArtwork, setThemeArtwork] = useState<File | null>();
  const [setCurrent, setSetCurrent] = useState(false);
  const [preparingImage, setPreparingImage] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<string>();
  const themeDescriptionEditorRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  function updateThemeDescription() {
    const editor = themeDescriptionEditorRef.current;
    if (!editor) return;
    setThemeDescriptionHtml(editor.innerHTML);
    setThemeDescriptionText(editor.innerText);
  }

  function formatThemeDescription(command: "bold" | "italic" | "insertUnorderedList") {
    themeDescriptionEditorRef.current?.focus();
    document.execCommand(command, false);
    updateThemeDescription();
  }

  function pasteThemeDescription(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalizedThemeDescription = themeDescriptionText.trim();
    if (normalizedThemeDescription.length > THEME_DESCRIPTION_MAX_LENGTH) {
      setMessage(`Keep the theme description to ${THEME_DESCRIPTION_MAX_LENGTH.toLocaleString()} characters or fewer.`);
      themeDescriptionEditorRef.current?.focus();
      return;
    }
    if (themeDescriptionHtml.length > THEME_DESCRIPTION_HTML_MAX_LENGTH) {
      setMessage("The theme description has too much formatting. Simplify it and try again.");
      themeDescriptionEditorRef.current?.focus();
      return;
    }

    setLoading(true);
    setMessage(undefined);
    setUploadStatus(undefined);
    const uploadedUrls: string[] = [];
    let submissionStarted = false;
    try {
      let imageUrl: string | null | undefined = themeArtwork === null ? null : undefined;
      if (themeArtwork instanceof File) {
        setUploadStatus("Uploading theme image…");
        imageUrl = (await uploadArtwork("theme", ownerId, themeArtwork, (progress) => setUploadStatus(`Uploading theme image… ${progress}%`))).url;
        uploadedUrls.push(imageUrl);
      }
      setUploadStatus(undefined);
      submissionStarted = true;
      const response = await fetch(`/api/clubs/${encodeURIComponent(clubSlug)}/themes${theme ? `/${theme.version}` : ""}`, {
        method: theme ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: themeName,
          guidance: normalizedThemeDescription,
          guidanceHtml: themeDescriptionHtml,
          imageUrl,
          ...(!theme ? { setCurrent } : {}),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        await discardUploadedArtwork(uploadedUrls);
        setLoading(false);
        setMessage(result.error ?? `Could not ${theme ? "update" : "create"} this theme.`);
        return;
      }
      router.push(cancelHref);
    } catch {
      if (!submissionStarted) await discardUploadedArtwork(uploadedUrls);
      setLoading(false);
      setUploadStatus(undefined);
      setMessage(`Could not ${theme ? "update" : "create"} this theme. Check your connection and try again.`);
    }
  }

  return <form className="form-shell" onSubmit={submit}>
    <section className="form-section"><span className="section-kicker">Theme #{version}</span><h2>{theme ? "Update this prompt" : "Give the club a new prompt"}</h2><div className="form-grid theme-fields-grid"><div className="field field-full"><label htmlFor="theme-editor-name">Theme</label><input id="theme-editor-name" required minLength={2} maxLength={100} placeholder="Heatwave at midnight" value={themeName} onChange={(event) => setThemeName(event.target.value)} /></div><div className="field field-full"><label id="theme-editor-description-label">Theme description</label><div className="rich-text-shell"><div className="rich-text-toolbar" role="toolbar" aria-label="Theme description formatting"><button type="button" aria-label="Bold" title="Bold" onMouseDown={(event) => event.preventDefault()} onClick={() => formatThemeDescription("bold")}><Bold size={16} /></button><button type="button" aria-label="Italic" title="Italic" onMouseDown={(event) => event.preventDefault()} onClick={() => formatThemeDescription("italic")}><Italic size={16} /></button><button type="button" aria-label="Bulleted list" title="Bulleted list" onMouseDown={(event) => event.preventDefault()} onClick={() => formatThemeDescription("insertUnorderedList")}><List size={16} /></button></div><div ref={themeDescriptionEditorRef} id="theme-editor-description" className="rich-text-editor rich-text-editor-compact" contentEditable role="textbox" aria-labelledby="theme-editor-description-label" aria-multiline="true" data-placeholder="Songs that feel like…" onInput={updateThemeDescription} onPaste={pasteThemeDescription} suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: initialThemeDescriptionHtml }} /></div><span className={`field-counter${themeDescriptionText.length > THEME_DESCRIPTION_MAX_LENGTH ? " field-counter-over" : ""}`}>{themeDescriptionText.length.toLocaleString()}/{THEME_DESCRIPTION_MAX_LENGTH.toLocaleString()}</span></div><ArtworkPicker id="theme-editor-image" label="Theme image" initials={themeName.trim().slice(0, 2).toUpperCase() || "TH"} existingUrl={theme?.imageUrl} onChange={setThemeArtwork} onBusyChange={(busy) => setPreparingImage((count) => Math.max(0, count + (busy ? 1 : -1)))} /></div></section>
    {!theme && <label className="theme-current-toggle"><input type="checkbox" checked={setCurrent} onChange={(event) => setSetCurrent(event.target.checked)} /><span><strong>Make this the current theme now</strong><small>Leave this unchecked to save the theme for later.</small></span></label>}
    {message && <p className="form-note form-error" role="alert">{message}</p>}
    <div className="form-actions"><span className="form-note">{uploadStatus}</span><Link href={cancelHref} className="button button-ghost">Cancel</Link><button className="button button-dark" disabled={loading || preparingImage > 0}><SubmitState loading={loading} success={false} idle={theme ? "Save changes" : setCurrent ? "Create and make current" : "Save theme"} /></button></div>
  </form>;
}

export function ClubSettingsForm({
  clubSlug,
  clubName,
  clubDescription,
  clubDescriptionHtml,
  ownerId,
  clubImageUrl,
  clubAccent,
  schedule,
}: {
  clubSlug: string;
  clubName: string;
  clubDescription: string;
  clubDescriptionHtml?: string;
  ownerId: string;
  clubImageUrl?: string;
  clubAccent: string;
  schedule: RecurrenceConfig;
}) {
  const initialDescriptionHtml = clubDescriptionHtml
    ? sanitizeClubDescriptionHtml(clubDescriptionHtml)
    : plainTextToRichTextHtml(clubDescription);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [name, setName] = useState(clubName);
  const [descriptionHtml, setDescriptionHtml] = useState(initialDescriptionHtml);
  const [descriptionText, setDescriptionText] = useState(clubDescription);
  const [accent, setAccent] = useState(normalizeClubAccent(clubAccent));
  const [clubArtwork, setClubArtwork] = useState<File | null>();
  const [preparingImages, setPreparingImages] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<string>();
  const descriptionEditorRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  function imageBusy(busy: boolean) {
    setPreparingImages((count) => Math.max(0, count + (busy ? 1 : -1)));
  }

  function updateDescription() {
    const editor = descriptionEditorRef.current;
    if (!editor) return;
    setDescriptionHtml(editor.innerHTML);
    setDescriptionText(editor.innerText);
  }

  function formatDescription(command: "bold" | "italic" | "insertUnorderedList") {
    descriptionEditorRef.current?.focus();
    document.execCommand(command, false);
    updateDescription();
  }

  function pasteDescription(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedDescription = descriptionText.trim();
    if (normalizedDescription.length < 10) {
      setMessage("Add a description of at least 10 characters before saving this club.");
      descriptionEditorRef.current?.focus();
      return;
    }
    if (normalizedDescription.length > CLUB_DESCRIPTION_MAX_LENGTH) {
      setMessage(`Keep the description to ${CLUB_DESCRIPTION_MAX_LENGTH.toLocaleString()} characters or fewer.`);
      descriptionEditorRef.current?.focus();
      return;
    }
    if (descriptionHtml.length > CLUB_DESCRIPTION_HTML_MAX_LENGTH) {
      setMessage("This description has too much formatting. Simplify it and try again.");
      descriptionEditorRef.current?.focus();
      return;
    }
    setLoading(true);
    setSaved(false);
    setMessage(undefined);
    setNotice(undefined);
    const form = new FormData(event.currentTarget);
    const uploadedUrls: string[] = [];
    let submissionStarted = false;
    try {
      let nextClubImageUrl: string | null | undefined = clubArtwork === null ? null : undefined;
      if (clubArtwork instanceof File) {
        setUploadStatus("Uploading club image…");
        nextClubImageUrl = (await uploadArtwork("club", ownerId, clubArtwork, (progress) => setUploadStatus(`Uploading club image… ${progress}%`))).url;
        uploadedUrls.push(nextClubImageUrl);
      }
      setUploadStatus(undefined);
      submissionStarted = true;
      const response = await fetch(`/api/clubs/${encodeURIComponent(clubSlug)}/artwork`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: normalizedDescription,
          descriptionHtml,
          accent,
          clubImageUrl: nextClubImageUrl,
          ...Object.fromEntries(form.entries()),
        }),
      });
      const result = (await response.json()) as { error?: string; warning?: string };
      if (!response.ok) {
        await discardUploadedArtwork(uploadedUrls);
        setLoading(false);
        setMessage(result.error ?? "Could not update club settings.");
        return;
      }
      setClubArtwork(undefined);
      setLoading(false);
      setSaved(true);
      setNotice(result.warning);
      router.refresh();
      setTimeout(() => setSaved(false), 2500);
    } catch {
      if (!submissionStarted) await discardUploadedArtwork(uploadedUrls);
      setLoading(false);
      setUploadStatus(undefined);
      setMessage("Could not update club settings. Check your connection and try again.");
    }
  }

  return <form className="form-shell" onSubmit={submit}>
    <section className="form-section"><span className="section-kicker">Club identity</span><h2>Club details</h2><div className="form-grid"><div className="field field-full"><label htmlFor="settings-club-name">Club title</label><input id="settings-club-name" required minLength={2} maxLength={70} value={name} onChange={(event) => setName(event.target.value)} /></div><div className="field field-full"><label id="settings-club-description-label">Description</label><div className="rich-text-shell"><div className="rich-text-toolbar" role="toolbar" aria-label="Description formatting"><button type="button" aria-label="Bold" title="Bold" onMouseDown={(event) => event.preventDefault()} onClick={() => formatDescription("bold")}><Bold size={16} /></button><button type="button" aria-label="Italic" title="Italic" onMouseDown={(event) => event.preventDefault()} onClick={() => formatDescription("italic")}><Italic size={16} /></button><button type="button" aria-label="Bulleted list" title="Bulleted list" onMouseDown={(event) => event.preventDefault()} onClick={() => formatDescription("insertUnorderedList")}><List size={16} /></button></div><div ref={descriptionEditorRef} id="settings-club-description" className="rich-text-editor rich-text-editor-compact" contentEditable role="textbox" aria-labelledby="settings-club-description-label" aria-multiline="true" aria-required="true" data-placeholder="What kind of listening club is this?" onInput={updateDescription} onPaste={pasteDescription} suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: initialDescriptionHtml }} /></div><span className={`field-counter${descriptionText.length > CLUB_DESCRIPTION_MAX_LENGTH ? " field-counter-over" : ""}`}>{descriptionText.length.toLocaleString()}/{CLUB_DESCRIPTION_MAX_LENGTH.toLocaleString()}</span></div><div className="field field-full"><label htmlFor="settings-club-accent">Primary color</label><div className="color-field"><input id="settings-club-accent" type="color" value={accent} onChange={(event) => setAccent(event.target.value)} /><span>{accent.toUpperCase()}</span></div><small>Used as the background color on the club detail page.</small></div><ArtworkPicker id="settings-club-image" label="Club image" initials={name.trim().slice(0, 1).toUpperCase() || "D"} existingUrl={clubImageUrl} onChange={setClubArtwork} onBusyChange={imageBusy} /></div></section>
    <RitualFields idPrefix="club-settings-ritual" schedule={schedule} kicker="Schedule" />
    {message && <p className="form-note form-error" role="alert">{message}</p>}
    {notice && <p className="form-note" role="status">{notice}</p>}
    <div className="form-actions"><span className="form-note">{uploadStatus}</span><button className="button button-dark" disabled={loading || preparingImages > 0}><SubmitState loading={loading} success={saved} idle="Save settings" /></button></div>
  </form>;
}
