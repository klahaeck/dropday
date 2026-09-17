"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import {
  ArtworkPicker,
  discardUploadedArtwork,
  uploadArtwork,
} from "@/components/forms/artwork-fields";
import { SubmitState } from "@/components/forms/submit-state";
import { RichTextEditor } from "@/components/rich-text-editor";
import { plainTextToRichTextHtml } from "@/lib/rich-text";
import {
  THEME_DESCRIPTION_HTML_MAX_LENGTH,
  THEME_DESCRIPTION_MAX_LENGTH,
  sanitizeThemeDescriptionHtml,
} from "@/lib/theme-description";
import type { ClubTheme } from "@/types/domain";

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
