"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, LoaderCircle, X } from "lucide-react";
import { EMAIL_PREFERENCE_KEYS } from "@/lib/email-preferences";
import type { EmailPreferenceKey, EmailPreferences } from "@/types/domain";

const preferenceOptions: Array<{
  key: EmailPreferenceKey;
  label: string;
  description: string;
}> = [
  {
    key: "assignments",
    label: "Drop assignments",
    description: "When a club assigns an upcoming drop to you.",
  },
  {
    key: "reminders",
    label: "Reminders and overdue drops",
    description: "Before your drop is due and if the queue is waiting on you.",
  },
  {
    key: "clubActivity",
    label: "Club activity",
    description: "New playlists, theme changes, and mentions in your clubs.",
  },
  {
    key: "membership",
    label: "Membership updates",
    description: "Invitations, request decisions, and membership changes.",
  },
  {
    key: "billing",
    label: "Plan and billing",
    description: "Billing, plan entitlement, and club ownership updates.",
  },
];

type SaveState = "idle" | "saving" | "saved" | "error";

export function EmailPreferences({
  initialPreferences,
  emailAddress,
}: {
  initialPreferences: EmailPreferences;
  emailAddress?: string;
}) {
  const [savedPreferences, setSavedPreferences] = useState(initialPreferences);
  const [draftPreferences, setDraftPreferences] = useState(initialPreferences);
  const [isOpen, setIsOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogId = useId();
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!dialogRef.current?.contains(document.activeElement)) closeRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (saveState === "saving") return;
        event.preventDefault();
        setIsOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
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
  }, [isOpen, saveState]);

  function openPreferences() {
    setDraftPreferences(savedPreferences);
    setSaveState("idle");
    setMessage("");
    setIsOpen(true);
  }

  function closePreferences() {
    if (saveState === "saving") return;
    setIsOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function setEveryPreference(enabled: boolean) {
    setDraftPreferences(Object.fromEntries(
      EMAIL_PREFERENCE_KEYS.map((key) => [key, enabled]),
    ) as EmailPreferences);
  }

  async function savePreferences() {
    setSaveState("saving");
    setMessage("");
    try {
      const response = await fetch("/api/preferences/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draftPreferences),
      });
      const payload = await response.json().catch(() => null) as {
        emailPreferences?: EmailPreferences;
        error?: string;
      } | null;
      if (!response.ok || !payload?.emailPreferences) {
        throw new Error(payload?.error || "Could not save email preferences");
      }

      setSavedPreferences(payload.emailPreferences);
      setDraftPreferences(payload.emailPreferences);
      setSaveState("saved");
      setMessage("Email preferences saved.");
      setIsOpen(false);
      requestAnimationFrame(() => triggerRef.current?.focus());
    } catch (error) {
      setSaveState("error");
      setMessage(error instanceof Error ? error.message : "Could not save email preferences");
    }
  }

  const enabledCount = EMAIL_PREFERENCE_KEYS.filter((key) => savedPreferences[key]).length;
  const summary = enabledCount === 0
    ? "Email delivery is off."
    : enabledCount === EMAIL_PREFERENCE_KEYS.length
      ? "Email delivery is on for all notification categories."
      : `${enabledCount} of ${EMAIL_PREFERENCE_KEYS.length} email notification categories are on.`;

  return (
    <div className="email-preferences">
      <p>{summary}</p>
      <button
        ref={triggerRef}
        className="button button-ghost button-small"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={dialogId}
        onClick={openPreferences}
      >
        Change preferences
      </button>
      {message && !isOpen && (
        <small className="email-preferences-status" role="status" aria-live="polite">
          {message}
        </small>
      )}

      {isOpen && (
        <div className="playlist-selector-layer email-preferences-layer">
          <button
            className="playlist-selector-backdrop"
            type="button"
            aria-label="Close email preferences"
            disabled={saveState === "saving"}
            onClick={closePreferences}
          />
          <section
            ref={dialogRef}
            id={dialogId}
            className="playlist-selector-dialog email-preferences-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
          >
            <div className="playlist-selector-heading">
              <div>
                <span className="section-kicker">Email delivery</span>
                <h2 id={titleId}>Choose what reaches your inbox</h2>
              </div>
              <button
                ref={closeRef}
                className="playlist-selector-close"
                type="button"
                aria-label="Close email preferences"
                disabled={saveState === "saving"}
                onClick={closePreferences}
              >
                <X size={19} />
              </button>
            </div>
            <p id={descriptionId}>
              Choose the account updates Dropday may send
              {emailAddress ? <> to <strong>{emailAddress}</strong></> : " by email"}.
            </p>
            <div className="email-preferences-bulk" aria-label="Select email preferences">
              <button
                className="button button-ghost button-small"
                type="button"
                disabled={saveState === "saving"}
                onClick={() => setEveryPreference(true)}
              >
                Select all
              </button>
              <button
                className="button button-ghost button-small"
                type="button"
                disabled={saveState === "saving"}
                onClick={() => setEveryPreference(false)}
              >
                Turn all off
              </button>
            </div>
            <div className="email-preferences-list">
              {preferenceOptions.map((option) => (
                <label className="email-preference-option" key={option.key}>
                  <span className="email-preference-copy">
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={draftPreferences[option.key]}
                    disabled={saveState === "saving"}
                    onChange={(event) => setDraftPreferences((current) => ({
                      ...current,
                      [option.key]: event.target.checked,
                    }))}
                  />
                </label>
              ))}
            </div>
            {saveState === "error" && (
              <p className="form-error email-preferences-error" role="alert">{message}</p>
            )}
            <div className="email-preferences-footer">
              <button
                className="button button-ghost"
                type="button"
                disabled={saveState === "saving"}
                onClick={closePreferences}
              >
                Cancel
              </button>
              <button
                className="button button-dark"
                type="button"
                disabled={saveState === "saving"}
                onClick={savePreferences}
              >
                {saveState === "saving"
                  ? <><LoaderCircle size={15} className="spin" /> Saving…</>
                  : <><Check size={15} /> Save preferences</>}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
