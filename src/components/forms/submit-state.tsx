import { Check, LoaderCircle } from "lucide-react";

export function SubmitState({ loading, success, idle }: { loading: boolean; success: boolean; idle: string }) {
  if (loading) return <><LoaderCircle size={15} className="spin" /> Saving…</>;
  if (success) return <><Check size={15} /> Saved</>;
  return <>{idle}</>;
}
