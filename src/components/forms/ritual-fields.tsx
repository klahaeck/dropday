"use client";

import { useState } from "react";
import { TimezoneField } from "@/components/timezone-field";
import type { RecurrenceConfig } from "@/types/domain";

function ritualStartLabel(startsOn: string, localTime: string) {
  const [year, month, day] = startsOn.split("-").map(Number);
  const [hour, minute] = localTime.split(":").map(Number);
  if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) return;

  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${date} at ${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

export function RitualFields({
  idPrefix,
  schedule,
  kicker = "02 · Drop day",
  suggestBrowserZone = false,
  hidden = false,
  sectionId,
}: {
  idPrefix: string;
  schedule?: Pick<RecurrenceConfig, "startsOn" | "localTime" | "timezone" | "frequency" | "interval">;
  kicker?: string;
  suggestBrowserZone?: boolean;
  hidden?: boolean;
  sectionId?: string;
}) {
  const [startsOn, setStartsOn] = useState(schedule?.startsOn ?? "");
  const [localTime, setLocalTime] = useState(schedule?.localTime ?? "09:00");
  const [timezone, setTimezone] = useState(schedule?.timezone ?? "America/Chicago");
  const [frequency, setFrequency] = useState<RecurrenceConfig["frequency"]>(schedule?.frequency ?? "weekly");
  const [interval, setInterval] = useState(String(schedule?.interval ?? 1));
  const intervalNumber = Number(interval);
  const startLabel = ritualStartLabel(startsOn, localTime);
  const unit = frequency === "daily" ? "day" : frequency === "weekly" ? "week" : "month";
  const cadence = intervalNumber === 1 ? `Every ${unit}` : `Every ${interval || "N"} ${unit}s`;
  const summary = startLabel
    ? `${cadence}, beginning ${startLabel} in ${timezone}.`
    : "Choose a start date to anchor the first drop and every drop after it.";

  return <section id={sectionId} className="form-section" hidden={hidden} data-club-creation-step={sectionId ? "ritual" : undefined}>
    <span className="section-kicker">{kicker}</span>
    <h2 tabIndex={sectionId ? -1 : undefined}>Set the ritual</h2>
    <p>Choose the first drop, then choose how often it repeats.</p>
    <div className="form-grid">
      <div className="field">
        <label htmlFor={`${idPrefix}-starts-on`}>Start date</label>
        <input id={`${idPrefix}-starts-on`} name="startsOn" type="date" required value={startsOn} onChange={(event) => setStartsOn(event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-local-time`}>Start time</label>
        <input id={`${idPrefix}-local-time`} name="localTime" type="time" required value={localTime} onChange={(event) => setLocalTime(event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-timezone`}>Timezone</label>
        <TimezoneField id={`${idPrefix}-timezone`} value={timezone} onValueChange={setTimezone} suggestBrowserZone={suggestBrowserZone} describedBy={`${idPrefix}-summary`} />
      </div>
      <div className="field ritual-repeat-field">
        <label htmlFor={`${idPrefix}-interval`} id={`${idPrefix}-repeat-label`}>Repeat</label>
        <div className="ritual-repeat-row" role="group" aria-labelledby={`${idPrefix}-repeat-label`}>
          <span>Every</span>
          <input
            id={`${idPrefix}-interval`}
            name="interval"
            type="number"
            min="1"
            max="52"
            required
            aria-label="Repeat interval"
            aria-describedby={`${idPrefix}-summary`}
            value={interval}
            onChange={(event) => setInterval(event.target.value)}
          />
          <select
            id={`${idPrefix}-frequency`}
            name="frequency"
            aria-label="Repeat unit"
            aria-describedby={`${idPrefix}-summary`}
            value={frequency}
            onChange={(event) => setFrequency(event.target.value as RecurrenceConfig["frequency"])}
          >
            <option value="daily">{intervalNumber === 1 ? "day" : "days"}</option>
            <option value="weekly">{intervalNumber === 1 ? "week" : "weeks"}</option>
            <option value="monthly">{intervalNumber === 1 ? "month" : "months"}</option>
          </select>
        </div>
      </div>
      <p id={`${idPrefix}-summary`} className="ritual-summary field-full" aria-live="polite">{summary}</p>
    </div>
  </section>;
}
