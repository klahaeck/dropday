"use client";

import { useId, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { DESCRIPTION_PREVIEW_MAX_LENGTH, truncateDescription } from "@/lib/description-preview";

export function ExpandableDescription({
  text,
  html,
  className,
  maxCharacters = DESCRIPTION_PREVIEW_MAX_LENGTH,
}: {
  text: string;
  html?: string;
  className?: string;
  maxCharacters?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const isLong = Array.from(text.trim()).length > maxCharacters;
  const preview = isLong ? truncateDescription(text, maxCharacters) : text;

  return (
    <div className={`expandable-description${className ? ` ${className}` : ""}`}>
      {html && (expanded || !isLong) ? (
        <div id={contentId} className="expandable-description-content" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p id={contentId} className="expandable-description-content">{expanded ? text : preview}</p>
      )}
      {isLong && (
        <button
          type="button"
          className="expandable-description-toggle"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Show less" : "Read more"}
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      )}
    </div>
  );
}
