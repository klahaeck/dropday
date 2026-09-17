"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Check, ImagePlus, LoaderCircle, X } from "lucide-react";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { RichTextEditor } from "@/components/rich-text-editor";
import { TimezoneField } from "@/components/timezone-field";
import { useUnsavedChanges } from "@/components/use-unsaved-changes";
import type { ArtworkKind } from "@/lib/blob-artwork";
import { DEFAULT_CLUB_ACCENT, normalizeClubAccent } from "@/lib/club-accent";
import {
  CLUB_CREATION_STEPS,
  DEFAULT_CLUB_VISIBILITY,
  nextClubCreationStep,
  previousClubCreationStep,
  shouldWarnAboutUnsavedClub,
  validateClubCreationStep,
  type ClubCreationField,
  type ClubCreationStep,
} from "@/lib/club-creation-flow";
import { CLUB_DESCRIPTION_HTML_MAX_LENGTH, CLUB_DESCRIPTION_MAX_LENGTH, sanitizeClubDescriptionHtml } from "@/lib/club-description";
import { PLAYLIST_DESCRIPTION_MAX_LENGTH } from "@/lib/playlist-description";
import {
  firstPlaylistDraftError,
  validatePlaylistDraft,
  type PlaylistDraftField,
  type PlaylistDraftFieldErrors,
} from "@/lib/playlist-draft-validation";
import { getPlaylistVersions } from "@/lib/playlist-providers";
import { plainTextToRichTextHtml } from "@/lib/rich-text";
import {
  THEME_DESCRIPTION_HTML_MAX_LENGTH,
  THEME_DESCRIPTION_MAX_LENGTH,
  sanitizeThemeDescriptionHtml,
} from "@/lib/theme-description";
import type { ClubTheme, ClubVisibility, PlaylistDraft, RecurrenceConfig } from "@/types/domain";

const ARTWORK_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
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
  suggestBrowserZone = false,
  hidden = false,
  sectionId,
}: {
  idPrefix: string;
  schedule?: Pick<RecurrenceConfig, "startsOn" | "localTime" | "timezone" | "frequency" | "interval">;
  kicker?: string;
  suggestBrowserZone?: boolean;
  hidden?: boolean;
  sectionId?: string;
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

  return <section id={sectionId} className="form-section" hidden={hidden} data-club-creation-step={sectionId ? "ritual" : undefined}>
    <span className="section-kicker">{kicker}</span>
    <h2 tabIndex={sectionId ? -1 : undefined}>Set the ritual</h2>
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
        <TimezoneField id={`${idPrefix}-timezone`} value={timezone} onValueChange={setTimezone} suggestBrowserZone={suggestBrowserZone} describedBy={`${idPrefix}-summary`} />
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

export function DraftComposer({ ownerId, playlist }: { ownerId: string; playlist?: PlaylistDraft }) {
  const initialDescriptionHtml = playlist?.descriptionHtml ?? plainTextToRichTextHtml(playlist?.description ?? "");
  const initialVersions = playlist ? getPlaylistVersions(playlist) : [];
  const initialSpotifyUrl = initialVersions.find((version) => version.provider === "spotify")?.canonicalUrl ?? "";
  const initialAppleMusicUrl = initialVersions.find((version) => version.provider === "apple-music")?.canonicalUrl ?? "";
  const [loading, setLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [message, setMessage] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<PlaylistDraftFieldErrors>({});
  const [spotifyUrl, setSpotifyUrl] = useState(initialSpotifyUrl);
  const [appleMusicUrl, setAppleMusicUrl] = useState(initialAppleMusicUrl);
  const [title, setTitle] = useState(playlist?.title ?? "");
  const [descriptionHtml, setDescriptionHtml] = useState(initialDescriptionHtml);
  const [descriptionText, setDescriptionText] = useState(playlist?.description ?? "");
  const [artworkFile, setArtworkFile] = useState<File>();
  const [artworkPreviewUrl, setArtworkPreviewUrl] = useState<string | undefined>(playlist?.metadata.artworkUrl);
  const [artworkRemoved, setArtworkRemoved] = useState(false);
  const [artworkName, setArtworkName] = useState<string>();
  const [uploadProgress, setUploadProgress] = useState<number>();
  const editorRef = useRef<HTMLDivElement>(null);
  const spotifyUrlRef = useRef<HTMLInputElement>(null);
  const appleMusicUrlRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const artworkInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => () => {
    if (artworkPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(artworkPreviewUrl);
  }, [artworkPreviewUrl]);

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

  function clearFieldError(field: PlaylistDraftField) {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function focusPlaylistField(field: PlaylistDraftField) {
    if (field === "spotifyUrl") spotifyUrlRef.current?.focus();
    if (field === "appleMusicUrl") appleMusicUrlRef.current?.focus();
    if (field === "title") titleRef.current?.focus();
    if (field === "description") editorRef.current?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const validation = validatePlaylistDraft({ spotifyUrl, appleMusicUrl, title, descriptionHtml });
    if (!validation.success) {
      setMessage(undefined);
      setFieldErrors(validation.errors);
      const issue = firstPlaylistDraftError(validation.errors);
      if (issue) focusPlaylistField(issue.field);
      return;
    }
    setLoading(true);
    setMessage(undefined);
    setFieldErrors({});
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
      const result = (await response.json()) as { error?: string; field?: PlaylistDraftField };
      if (!response.ok) {
        setLoading(false);
        if (result.field && result.error) {
          setFieldErrors({ [result.field]: result.error });
          focusPlaylistField(result.field);
        } else {
          setMessage(result.error ?? "Could not save this playlist.");
        }
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

  return <form className="form-shell" onSubmit={submit} noValidate>
    <div className="form-grid playlist-form-grid">
      <div className="field field-full"><label htmlFor="spotify-url">Spotify playlist URL <span className="optional-label">Add one or both</span></label><input ref={spotifyUrlRef} id="spotify-url" name="spotifyUrl" type="url" placeholder="https://open.spotify.com/playlist/…" value={spotifyUrl} aria-invalid={Boolean(fieldErrors.spotifyUrl) || undefined} aria-describedby={fieldErrors.spotifyUrl ? "spotify-url-error" : undefined} onChange={(event) => { setSpotifyUrl(event.target.value); clearFieldError("spotifyUrl"); }} />{fieldErrors.spotifyUrl && <p id="spotify-url-error" className="form-error" role="alert">{fieldErrors.spotifyUrl}</p>}</div>
      <div className="field field-full"><label htmlFor="apple-music-url">Apple Music playlist URL <span className="optional-label">Add one or both</span></label><input ref={appleMusicUrlRef} id="apple-music-url" name="appleMusicUrl" type="url" placeholder="https://music.apple.com/…/playlist/…" value={appleMusicUrl} aria-invalid={Boolean(fieldErrors.appleMusicUrl) || undefined} aria-describedby={fieldErrors.appleMusicUrl ? "apple-music-url-error" : undefined} onChange={(event) => { setAppleMusicUrl(event.target.value); clearFieldError("appleMusicUrl"); }} />{fieldErrors.appleMusicUrl && <p id="apple-music-url-error" className="form-error" role="alert">{fieldErrors.appleMusicUrl}</p>}</div>
      <div className="field field-full"><label htmlFor="draft-title">Playlist title</label><input ref={titleRef} id="draft-title" name="title" type="text" required minLength={2} maxLength={100} placeholder="Sunburn after dark" value={title} aria-invalid={Boolean(fieldErrors.title) || undefined} aria-describedby={fieldErrors.title ? "draft-title-error" : undefined} onChange={(event) => { setTitle(event.target.value); clearFieldError("title"); }} />{fieldErrors.title && <p id="draft-title-error" className="form-error" role="alert">{fieldErrors.title}</p>}</div>
      <div className="field field-full">
        <label id="draft-description-label">Description</label>
        <RichTextEditor
          ref={editorRef}
          id="draft-description"
          labelledBy="draft-description-label"
          toolbarLabel="Description formatting"
          placeholder="Tell the club what they are about to hear."
          initialHtml={initialDescriptionHtml}
          required
          invalid={Boolean(fieldErrors.description)}
          describedBy={fieldErrors.description ? "draft-description-error" : undefined}
          onValueChange={(html, text) => {
            setDescriptionHtml(html);
            setDescriptionText(text);
            clearFieldError("description");
          }}
        />
        <input type="hidden" name="descriptionHtml" value={descriptionHtml} />
        {fieldErrors.description && <p id="draft-description-error" className="form-error" role="alert">{fieldErrors.description}</p>}
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
  const [step, setStep] = useState<ClubCreationStep>("identity");
  const [dirty, setDirty] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [created, setCreated] = useState<{ slug: string; warning: string }>();
  const [clubName, setClubName] = useState("");
  const [visibility, setVisibility] = useState<ClubVisibility>(DEFAULT_CLUB_VISIBILITY);
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
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useUnsavedChanges(shouldWarnAboutUnsavedClub({ dirty, created: Boolean(created) }));

  function imageBusy(busy: boolean) {
    setPreparingImages((count) => Math.max(0, count + (busy ? 1 : -1)));
  }

  function values() {
    const form = formRef.current ? new FormData(formRef.current) : new FormData();
    return {
      name: clubName,
      description: clubDescriptionText,
      descriptionHtml: clubDescriptionHtml,
      startsOn: String(form.get("startsOn") ?? ""),
      localTime: String(form.get("localTime") ?? ""),
      timezone: String(form.get("timezone") ?? ""),
      frequency: String(form.get("frequency") ?? ""),
      interval: String(form.get("interval") ?? ""),
      useTheme,
      theme: themeName,
    };
  }

  function focusCreationField(field: ClubCreationField) {
    if (field === "description") {
      clubDescriptionEditorRef.current?.focus();
      return;
    }
    const ids: Record<Exclude<ClubCreationField, "description">, string> = {
      name: "name",
      startsOn: "new-club-ritual-starts-on",
      localTime: "new-club-ritual-local-time",
      timezone: "new-club-ritual-timezone",
      frequency: "new-club-ritual-frequency",
      interval: "new-club-ritual-interval",
      theme: "theme",
    };
    document.getElementById(ids[field])?.focus();
  }

  function validateStep(targetStep: ClubCreationStep) {
    const error = validateClubCreationStep(targetStep, values())[0];
    if (!error) return true;
    setMessage(error.message);
    if (targetStep !== step) setStep(targetStep);
    requestAnimationFrame(() => focusCreationField(error.field));
    return false;
  }

  function continueToNextStep() {
    if (!validateStep(step)) return;
    setMessage(undefined);
    const next = nextClubCreationStep(step);
    setStep(next);
    requestAnimationFrame(() => formRef.current
      ?.querySelector<HTMLElement>(`[data-club-creation-step="${next}"] h2`)
      ?.focus());
  }

  function goBack() {
    setMessage(undefined);
    const previous = previousClubCreationStep(step);
    setStep(previous);
    requestAnimationFrame(() => formRef.current
      ?.querySelector<HTMLElement>(`[data-club-creation-step="${previous}"] h2`)
      ?.focus());
  }

  function cancel() {
    if (shouldWarnAboutUnsavedClub({ dirty, created: Boolean(created) })) {
      setCancelOpen(true);
      return;
    }
    router.push("/app/clubs");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canOwn) return;
    for (const candidate of CLUB_CREATION_STEPS) {
      if (!validateStep(candidate.id)) return;
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
      const result = (await response.json()) as { slug?: string; warning?: string; error?: string; demo?: boolean };
      if (!response.ok) {
        await discardUploadedArtwork(uploadedUrls);
        setLoading(false);
        setMessage(result.error ?? "Could not create this club.");
        return;
      }
      const slug = result.demo ? "needle-exchange" : result.slug;
      if (!slug) {
        setLoading(false);
        setMessage("The club was created, but its destination could not be loaded.");
        return;
      }
      setDirty(false);
      if (result.warning) {
        setLoading(false);
        setCreated({ slug, warning: result.warning });
        return;
      }
      router.push(`/app/clubs/${slug}`);
    } catch {
      if (!submissionStarted) await discardUploadedArtwork(uploadedUrls);
      setLoading(false);
      setUploadStatus(undefined);
      setMessage("Could not create this club. Check your connection and try again.");
    }
  }

  if (!canOwn) return <div className="empty-state"><h2>A paid plan is required to own a club.</h2><p>Free members can join three clubs but may never own one. Choose any paid tier to start hosting.</p><a href="/pricing" className="button button-dark">See paid plans</a></div>;
  if (created) return <ClubCreationSuccess slug={created.slug} warning={created.warning} />;

  return <>
    <form ref={formRef} className="form-shell club-creation-form" onSubmit={submit} onChange={() => setDirty(true)} noValidate>
      <ol className="club-creation-progress" aria-label="Club creation progress">
        {CLUB_CREATION_STEPS.map((candidate, index) => <li key={candidate.id} aria-current={candidate.id === step ? "step" : undefined} className={candidate.id === step ? "club-creation-step-current" : ""}><span>{index + 1}</span>{candidate.label}</li>)}
      </ol>
      <section className="form-section" hidden={step !== "identity"} data-club-creation-step="identity"><span className="section-kicker">01 · Identity</span><h2 tabIndex={-1}>Name the room</h2><div className="form-grid"><div className="field"><label htmlFor="name">Club name</label><input id="name" name="name" required minLength={2} maxLength={70} placeholder="Needle Exchange" value={clubName} onChange={(event) => setClubName(event.target.value)} /></div><div className="field"><label htmlFor="visibility">Visibility</label><select id="visibility" name="visibility" value={visibility} onChange={(event) => setVisibility(event.target.value as ClubVisibility)}><option value="private">Private · link or invite only</option><option value="public">Public · discoverable</option></select><small>Private clubs stay out of Discover until you choose to make them public.</small></div><div className="field field-full"><label id="description-label">Description</label><RichTextEditor ref={clubDescriptionEditorRef} id="description" labelledBy="description-label" toolbarLabel="Description formatting" placeholder="What kind of listening club is this?" compact required onValueChange={(html, text) => { setClubDescriptionHtml(html); setClubDescriptionText(text); setDirty(true); }} /><input type="hidden" name="description" value={clubDescriptionText} /><input type="hidden" name="descriptionHtml" value={clubDescriptionHtml} /><span className={`field-counter${clubDescriptionText.length > CLUB_DESCRIPTION_MAX_LENGTH ? " field-counter-over" : ""}`}>{clubDescriptionText.length.toLocaleString()}/{CLUB_DESCRIPTION_MAX_LENGTH.toLocaleString()}</span></div></div></section>
      <RitualFields idPrefix="new-club-ritual" suggestBrowserZone hidden={step !== "ritual"} sectionId="club-creation-ritual" />
      <section className="form-section" hidden={step !== "finish"} data-club-creation-step="finish"><span className="section-kicker">03 · Optional finish</span><h2 tabIndex={-1}>Give the club its look</h2><p>Color, artwork, and an opening theme can all be changed later.</p><div className="form-grid"><div className="field field-full"><label htmlFor="accent">Primary color</label><div className="color-field"><input id="accent" name="accent" type="color" value={clubAccent} onChange={(event) => setClubAccent(event.target.value)} /><span>{clubAccent.toUpperCase()}</span></div><small>Used as the background color on the club detail page.</small></div><ArtworkPicker id="club-image" label="Club image" initials={clubName.trim().slice(0, 1).toUpperCase() || "D"} onChange={(file) => { setClubArtwork(file); setDirty(true); }} onBusyChange={imageBusy} /></div><label className="theme-current-toggle"><input type="checkbox" checked={useTheme} onChange={(event) => setUseTheme(event.target.checked)} /><span><strong>Start this club with a theme</strong><small>Leave this unchecked for a freeform club. You can add themes later.</small></span></label><div hidden={!useTheme} className="form-grid theme-fields-grid optional-theme-fields"><div className="field"><label htmlFor="theme">Theme</label><input id="theme" name="theme" minLength={2} maxLength={100} placeholder="Heatwave at midnight" value={themeName} onChange={(event) => setThemeName(event.target.value)} /></div><div className="field"><label htmlFor="guidance">Guidance</label><textarea id="guidance" name="guidance" maxLength={THEME_DESCRIPTION_MAX_LENGTH} placeholder="Songs that feel like…" /></div><ArtworkPicker id="theme-image" label="Theme image" initials={themeName.trim().slice(0, 2).toUpperCase() || "TH"} onChange={(file) => { setThemeArtwork(file); setDirty(true); }} onBusyChange={imageBusy} /></div></section>
      {message && <p className="form-note form-error" role="alert">{message}</p>}
      <div className="form-actions club-creation-actions"><span className="form-note">{uploadStatus ?? "The creator becomes the first queue member."}</span><button type="button" className="button button-ghost" onClick={cancel}>Cancel</button><button type="button" className="button button-ghost" hidden={step === "identity"} onClick={goBack}>Back</button><button type="button" className="button button-dark" hidden={step === "finish"} onClick={continueToNextStep}>Continue</button><button type="submit" className="button button-dark" hidden={step !== "finish"} disabled={loading || preparingImages > 0}><SubmitState loading={loading} success={false} idle="Create club" /></button></div>
    </form>
    <ConfirmationDialog open={cancelOpen} title="Discard this club?" description="Your club details have not been saved. Leave now and discard these changes?" confirmLabel="Discard changes" onCancel={() => setCancelOpen(false)} onConfirm={() => { setDirty(false); router.push("/app/clubs"); }} />
  </>;
}

export function ClubCreationSuccess({ slug, warning }: { slug: string; warning: string }) {
  return <section className="form-shell club-creation-success" role="status"><span className="section-kicker">Club created</span><h2>Your club is ready.</h2><p>{warning}</p><div className="form-actions"><Link href={`/app/clubs/${slug}/settings#schedule`} className="button button-ghost">Review schedule</Link><Link href={`/app/clubs/${slug}`} className="button button-dark">Open club</Link></div></section>;
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
    <section className="form-section"><span className="section-kicker">Theme #{version}</span><h2>{theme ? "Update this prompt" : "Give the club a new prompt"}</h2><div className="form-grid theme-fields-grid"><div className="field field-full"><label htmlFor="theme-editor-name">Theme</label><input id="theme-editor-name" required minLength={2} maxLength={100} placeholder="Heatwave at midnight" value={themeName} onChange={(event) => setThemeName(event.target.value)} /></div><div className="field field-full"><label id="theme-editor-description-label">Theme description</label><RichTextEditor ref={themeDescriptionEditorRef} id="theme-editor-description" labelledBy="theme-editor-description-label" toolbarLabel="Theme description formatting" placeholder="Songs that feel like…" initialHtml={initialThemeDescriptionHtml} compact onValueChange={(html, text) => { setThemeDescriptionHtml(html); setThemeDescriptionText(text); }} /><span className={`field-counter${themeDescriptionText.length > THEME_DESCRIPTION_MAX_LENGTH ? " field-counter-over" : ""}`}>{themeDescriptionText.length.toLocaleString()}/{THEME_DESCRIPTION_MAX_LENGTH.toLocaleString()}</span></div><ArtworkPicker id="theme-editor-image" label="Theme image" initials={themeName.trim().slice(0, 2).toUpperCase() || "TH"} existingUrl={theme?.imageUrl} onChange={setThemeArtwork} onBusyChange={(busy) => setPreparingImage((count) => Math.max(0, count + (busy ? 1 : -1)))} /></div></section>
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
  clubVisibility,
  ownerId,
  clubImageUrl,
  clubAccent,
}: {
  clubSlug: string;
  clubName: string;
  clubDescription: string;
  clubDescriptionHtml?: string;
  clubVisibility: ClubVisibility;
  ownerId: string;
  clubImageUrl?: string;
  clubAccent: string;
}) {
  const initialDescriptionHtml = clubDescriptionHtml
    ? sanitizeClubDescriptionHtml(clubDescriptionHtml)
    : plainTextToRichTextHtml(clubDescription);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>();
  const [name, setName] = useState(clubName);
  const [descriptionHtml, setDescriptionHtml] = useState(initialDescriptionHtml);
  const [descriptionText, setDescriptionText] = useState(clubDescription);
  const [visibility, setVisibility] = useState<ClubVisibility>(clubVisibility);
  const [accent, setAccent] = useState(normalizeClubAccent(clubAccent));
  const [clubArtwork, setClubArtwork] = useState<File | null>();
  const [preparingImages, setPreparingImages] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<string>();
  const descriptionEditorRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  function imageBusy(busy: boolean) {
    setPreparingImages((count) => Math.max(0, count + (busy ? 1 : -1)));
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
          visibility,
          accent,
          clubImageUrl: nextClubImageUrl,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        await discardUploadedArtwork(uploadedUrls);
        setLoading(false);
        setMessage(result.error ?? "Could not update club settings.");
        return;
      }
      setClubArtwork(undefined);
      setLoading(false);
      setSaved(true);
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
    <section className="form-section"><span className="section-kicker">Club identity</span><h2>Club details</h2><div className="form-grid"><div className="field field-full"><label htmlFor="settings-club-name">Club title</label><input id="settings-club-name" required minLength={2} maxLength={70} value={name} onChange={(event) => setName(event.target.value)} /></div><div className="field field-full"><label htmlFor="settings-club-visibility">Visibility</label><select id="settings-club-visibility" value={visibility} onChange={(event) => setVisibility(event.target.value as ClubVisibility)}><option value="private">Private · link or invite only</option><option value="public">Public · discoverable</option></select><small>Public clubs can appear in Discover. Private clubs are available only through membership, invitations, and join links.</small></div><div className="field field-full"><label id="settings-club-description-label">Description</label><RichTextEditor ref={descriptionEditorRef} id="settings-club-description" labelledBy="settings-club-description-label" toolbarLabel="Description formatting" placeholder="What kind of listening club is this?" initialHtml={initialDescriptionHtml} compact required onValueChange={(html, text) => { setDescriptionHtml(html); setDescriptionText(text); }} /><span className={`field-counter${descriptionText.length > CLUB_DESCRIPTION_MAX_LENGTH ? " field-counter-over" : ""}`}>{descriptionText.length.toLocaleString()}/{CLUB_DESCRIPTION_MAX_LENGTH.toLocaleString()}</span></div><div className="field field-full"><label htmlFor="settings-club-accent">Primary color</label><div className="color-field"><input id="settings-club-accent" type="color" value={accent} onChange={(event) => setAccent(event.target.value)} /><span>{accent.toUpperCase()}</span></div><small>Used as the background color on the club detail page.</small></div><ArtworkPicker id="settings-club-image" label="Club image" initials={name.trim().slice(0, 1).toUpperCase() || "D"} existingUrl={clubImageUrl} onChange={setClubArtwork} onBusyChange={imageBusy} /></div></section>
    {message && <p className="form-note form-error" role="alert">{message}</p>}
    <div className="form-actions"><span className="form-note">{uploadStatus}</span><button className="button button-dark" disabled={loading || preparingImages > 0}><SubmitState loading={loading} success={saved} idle="Save settings" /></button></div>
  </form>;
}
