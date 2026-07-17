import { ExpandableDescription } from "@/components/expandable-description";
import { sanitizeClubDescriptionHtml } from "@/lib/club-description";

export function ClubDescription({ html, fallback, className }: { html?: string; fallback: string; className?: string }) {
  return <ExpandableDescription text={fallback} html={html ? sanitizeClubDescriptionHtml(html) : undefined} className={className} />;
}
