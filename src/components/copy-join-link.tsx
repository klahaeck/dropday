"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, Copy, LoaderCircle } from "lucide-react";
import { clubJoinUrl, copyTextToClipboard } from "@/lib/clipboard";

type CopyState = "idle" | "copied" | "error";

export function CopyJoinLink({
  clubSlug,
  initialExpiresAt,
}: {
  clubSlug: string;
  initialExpiresAt?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<CopyState>("idle");
  const [expiresAt, setExpiresAt] = useState(initialExpiresAt);
  const [busy, setBusy] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  async function copyJoinLink() {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setBusy(true);
    try {
      const response = await fetch(`/api/clubs/${encodeURIComponent(clubSlug)}/invitation`, {
        method: "POST",
      });
      const result = await response.json() as { token?: string; expiresAt?: string; error?: string };
      if (!response.ok || !result.token || !result.expiresAt) {
        throw new Error(result.error ?? "Could not create the invitation link.");
      }
      await copyTextToClipboard(clubJoinUrl(window.location.origin, clubSlug, result.token));
      setExpiresAt(result.expiresAt);
      setState("copied");
      resetTimer.current = setTimeout(() => setState("idle"), 3000);
    } catch {
      setState("error");
    } finally {
      setBusy(false);
    }
  }

  async function revokeJoinLink() {
    setBusy(true);
    setState("idle");
    try {
      const response = await fetch(`/api/clubs/${encodeURIComponent(clubSlug)}/invitation`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Could not revoke the invitation link.");
      setExpiresAt(undefined);
      router.refresh();
    } catch {
      setState("error");
    } finally {
      setBusy(false);
    }
  }

  return <div className="copy-join-link">
    {expiresAt && <p className="form-note">Active until {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(expiresAt))}. The secret can only be copied when it is generated.</p>}
    <div className="form-actions">
      <button className="button button-dark button-small" type="button" onClick={copyJoinLink} disabled={busy}>
        {busy ? <LoaderCircle size={14} className="spin" /> : state === "copied" ? <Check size={14} /> : <Copy size={14} />}
        {state === "copied" ? "Join link copied" : expiresAt ? "Replace and copy link" : "Create and copy link"}
      </button>
      {expiresAt && <button className="button button-ghost button-small" type="button" onClick={() => void revokeJoinLink()} disabled={busy}>
        <Ban size={14} /> Revoke link
      </button>}
    </div>
    <p className={`copy-feedback${state === "error" ? " copy-feedback-error" : ""}`} role="status" aria-live="polite">
      {state === "copied" ? "The new invite URL is ready to paste. Older links no longer work." : state === "error" ? "Couldn’t update the invite URL. Try again." : ""}
    </p>
  </div>;
}
