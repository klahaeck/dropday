"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

export function ActivateThemeButton({ clubSlug, version }: { clubSlug: string; version: number }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const router = useRouter();

  async function activate() {
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/clubs/${encodeURIComponent(clubSlug)}/themes/${version}/activate`, { method: "POST" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not make this theme current.");
      setLoading(false);
      router.refresh();
    } catch (activationError) {
      setLoading(false);
      setError(activationError instanceof Error ? activationError.message : "Could not make this theme current.");
    }
  }

  return <div className="club-theme-activate-action">
    <button className="button button-dark button-small" type="button" disabled={loading} onClick={activate}>{loading && <LoaderCircle size={13} className="spin" />}Make current</button>
    {error && <span className="club-theme-action-error" role="alert">{error}</span>}
  </div>;
}
