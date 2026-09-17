"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import {
  ArtworkPicker,
  discardUploadedArtwork,
  uploadArtwork,
} from "@/components/forms/artwork-fields";
import { SubmitState } from "@/components/forms/submit-state";
import { RichTextEditor } from "@/components/rich-text-editor";
import { normalizeClubAccent } from "@/lib/club-accent";
import {
  CLUB_DESCRIPTION_HTML_MAX_LENGTH,
  CLUB_DESCRIPTION_MAX_LENGTH,
  sanitizeClubDescriptionHtml,
} from "@/lib/club-description";
import { plainTextToRichTextHtml } from "@/lib/rich-text";
import type { ClubVisibility } from "@/types/domain";

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
