"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { freeformConfirmation } from "@/lib/admin-action-safety";

export function ClearCurrentThemeButton({
  clubSlug,
  themeName,
}: {
  clubSlug: string;
  themeName?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();
  const confirmation = freeformConfirmation(themeName);

  async function clearTheme() {
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/clubs/${encodeURIComponent(clubSlug)}/themes/current`, { method: "DELETE" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not switch this club to freeform.");
      setLoading(false);
      setConfirming(false);
      router.refresh();
    } catch (clearError) {
      setLoading(false);
      setConfirming(false);
      setError(clearError instanceof Error ? clearError.message : "Could not switch this club to freeform.");
    }
  }

  return <div className="club-theme-activate-action">
    <button className="button button-ghost button-small" type="button" disabled={loading} onClick={() => setConfirming(true)}>{loading && <LoaderCircle size={13} className="spin" />}Use no theme</button>
    {error && <span className="club-theme-action-error" role="alert">{error}</span>}
    <ConfirmationDialog
      open={confirming}
      title={confirmation.title}
      description={<p>{confirmation.description}</p>}
      confirmLabel={confirmation.confirmLabel}
      pending={loading}
      onCancel={() => setConfirming(false)}
      onConfirm={() => void clearTheme()}
    />
  </div>;
}
