"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { clubJoinUrl, copyTextToClipboard } from "@/lib/clipboard";

type CopyState = "idle" | "copied" | "error";

export function CopyJoinLink({ clubSlug }: { clubSlug: string }) {
  const [state, setState] = useState<CopyState>("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  async function copyJoinLink() {
    if (resetTimer.current) clearTimeout(resetTimer.current);

    try {
      await copyTextToClipboard(clubJoinUrl(window.location.origin, clubSlug));
      setState("copied");
      resetTimer.current = setTimeout(() => setState("idle"), 3000);
    } catch {
      setState("error");
    }
  }

  return <div className="copy-join-link">
    <button className="button button-dark button-small" type="button" onClick={copyJoinLink}>
      {state === "copied" ? <Check size={14} /> : <Copy size={14} />}
      {state === "copied" ? "Join link copied" : "Copy join link"}
    </button>
    <p className={`copy-feedback${state === "error" ? " copy-feedback-error" : ""}`} role="status" aria-live="polite">
      {state === "copied" ? "The invite URL is ready to paste." : state === "error" ? "Couldn’t copy the invite URL. Try again." : ""}
    </p>
  </div>;
}
