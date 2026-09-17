"use client";

import { useEffect, useState } from "react";
import { getCountdownParts } from "@/lib/format";

export function DashboardCountdown({
  scheduledFor,
  nowIso,
}: {
  scheduledFor: string;
  nowIso: string;
}) {
  const [currentIso, setCurrentIso] = useState(nowIso);

  useEffect(() => {
    const update = () => setCurrentIso(new Date().toISOString());
    const interval = window.setInterval(update, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const countdown = getCountdownParts(scheduledFor, currentIso);
  if (!countdown) return <p className="countdown">Schedule unavailable</p>;

  return (
    <time className="countdown" dateTime={scheduledFor}>
      {countdown.isDue ? (
        <strong>Due now</strong>
      ) : (
        <>
          <span><strong>{String(countdown.days).padStart(2, "0")}</strong><small>days</small></span>
          <span><strong>{String(countdown.hours).padStart(2, "0")}</strong><small>hours</small></span>
          <span><strong>{String(countdown.minutes).padStart(2, "0")}</strong><small>minutes</small></span>
        </>
      )}
    </time>
  );
}
