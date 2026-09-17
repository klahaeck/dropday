"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { listTimeZones, suggestedTimeZone } from "@/lib/timezones";

export function TimezoneField({
  id,
  value,
  onValueChange,
  suggestBrowserZone = false,
  describedBy,
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  suggestBrowserZone?: boolean;
  describedBy?: string;
}) {
  const listboxId = useId();
  const touched = useRef(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const options = useMemo(() => listTimeZones({ storedZone: value }), [value]);

  useEffect(() => {
    if (!suggestBrowserZone || touched.current) return;
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const suggestion = suggestedTimeZone({
      currentZone: value,
      browserZone,
      touched: touched.current,
    });
    if (suggestion !== value) onValueChange(suggestion);
  }, [onValueChange, suggestBrowserZone, value]);

  const matches = useMemo(() => {
    const query = value.trim().toLocaleLowerCase();
    const filtered = query
      ? options.filter((zone) => zone.toLocaleLowerCase().includes(query))
      : options;
    return filtered.slice(0, 80);
  }, [options, value]);

  return (
    <div className="timezone-combobox">
      <input
        id={id}
        name="timezone"
        type="text"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open && matches[activeIndex] ? `${listboxId}-${activeIndex}` : undefined}
        aria-describedby={describedBy}
        value={value}
        onFocus={() => { setOpen(true); setActiveIndex(0); }}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((index) => Math.min(index + 1, Math.max(matches.length - 1, 0)));
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((index) => Math.max(index - 1, 0));
            return;
          }
          if (event.key === "Enter" && open && matches[activeIndex]) {
            event.preventDefault();
            touched.current = true;
            onValueChange(matches[activeIndex]);
            setOpen(false);
          }
        }}
        onChange={(event) => {
          touched.current = true;
          onValueChange(event.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
      />
      {open && (
        <div id={listboxId} className="timezone-listbox" role="listbox" aria-label="Timezone suggestions">
          {matches.length ? matches.map((zone, index) => (
            <button
              id={`${listboxId}-${index}`}
              key={zone}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                touched.current = true;
                onValueChange(zone);
                setOpen(false);
              }}
            >{zone}</button>
          )) : <p>No matching timezones</p>}
        </div>
      )}
    </div>
  );
}
