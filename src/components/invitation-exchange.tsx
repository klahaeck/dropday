"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

export function InvitationExchange({ clubSlug }: { clubSlug: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const invitationFragment = useRef<string | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      if (invitationFragment.current === undefined) {
        invitationFragment.current = window.location.hash.slice(1);
        window.history.replaceState(null, "", window.location.pathname);
      }
      const fragment = invitationFragment.current;
      if (!fragment) throw new Error("This invitation link is incomplete.");
      let token: string;
      try {
        token = decodeURIComponent(fragment);
      } catch {
        throw new Error("This invitation link is invalid.");
      }
      const response = await fetch(`/api/clubs/${encodeURIComponent(clubSlug)}/invitation/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? "This invitation could not be opened.");
      router.replace(`/app/clubs/${encodeURIComponent(clubSlug)}`);
    })().catch((exchangeError) => {
      if (exchangeError instanceof DOMException && exchangeError.name === "AbortError") return;
      setError(exchangeError instanceof Error ? exchangeError.message : "This invitation could not be opened.");
    });
    return () => controller.abort();
  }, [clubSlug, router]);

  return <section className="panel" aria-live="polite">
    {error ? <><h1>Invitation unavailable.</h1><p className="form-error">{error}</p></> : <>
      <LoaderCircle className="spin" aria-hidden="true" />
      <h1>Opening your invitation…</h1>
      <p>The secret is being exchanged for a short-lived, secure session.</p>
    </>}
  </section>;
}
