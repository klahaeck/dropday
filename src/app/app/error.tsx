"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";

export default function ApplicationError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Dropday application route failed", error);
  }, [error]);

  return <section className="app-route-error" role="alert">
    <span className="section-kicker">Something went wrong</span>
    <h1>We could not open this page.</h1>
    <p>The interruption may be temporary. Retry the page, or return to your dashboard and continue from there.</p>
    <div className="app-route-error-actions">
      <button type="button" className="button button-dark" onClick={() => retry()}>
        <RotateCcw size={15} /> Retry
      </button>
      <Link className="button button-ghost" href="/app">Back to dashboard</Link>
    </div>
  </section>;
}
