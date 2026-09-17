"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import {
  prepareArtwork,
  uploadArtwork,
} from "@/components/forms/artwork-fields";
import { SubmitState } from "@/components/forms/submit-state";
import { RichTextEditor } from "@/components/rich-text-editor";
import { PLAYLIST_DESCRIPTION_MAX_LENGTH } from "@/lib/playlist-description";
import {
  firstPlaylistDraftError,
  validatePlaylistDraft,
  type PlaylistDraftField,
  type PlaylistDraftFieldErrors,
} from "@/lib/playlist-draft-validation";
import { getPlaylistVersions } from "@/lib/playlist-providers";
import { plainTextToRichTextHtml } from "@/lib/rich-text";
import type { PlaylistDraft } from "@/types/domain";

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
