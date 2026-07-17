"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

export function ClearCurrentThemeButton({ clubSlug }: { clubSlug: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const router = useRouter();

  async function clearTheme() {
    if (!window.confirm("Switch this club to freeform? The current theme will be saved for later.")) return;
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/clubs/${encodeURIComponent(clubSlug)}/themes/current`, { method: "DELETE" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not switch this club to freeform.");
      setLoading(false);
      router.refresh();
    } catch (clearError) {
      setLoading(false);
      setError(clearError instanceof Error ? clearError.message : "Could not switch this club to freeform.");
    }
  }

  return <div className="club-theme-activate-action">
    <button className="button button-ghost button-small" type="button" disabled={loading} onClick={clearTheme}>{loading && <LoaderCircle size={13} className="spin" />}Use no theme</button>
    {error && <span className="club-theme-action-error" role="alert">{error}</span>}
  </div>;
}
