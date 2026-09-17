"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import {
  ArtworkPicker,
  discardUploadedArtwork,
  uploadArtwork,
} from "@/components/forms/artwork-fields";
import { RitualFields } from "@/components/forms/ritual-fields";
import { SubmitState } from "@/components/forms/submit-state";
import { RichTextEditor } from "@/components/rich-text-editor";
import { useUnsavedChanges } from "@/components/use-unsaved-changes";
import { DEFAULT_CLUB_ACCENT } from "@/lib/club-accent";
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
import { CLUB_DESCRIPTION_MAX_LENGTH } from "@/lib/club-description";
import { THEME_DESCRIPTION_MAX_LENGTH } from "@/lib/theme-description";
import type { ClubVisibility } from "@/types/domain";

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
