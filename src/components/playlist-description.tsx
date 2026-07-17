import { ExpandableDescription } from "@/components/expandable-description";
import { sanitizePlaylistDescriptionHtml } from "@/lib/playlist-description";

export function PlaylistDescription({ html, fallback, className }: { html?: string; fallback: string; className?: string }) {
  return <ExpandableDescription text={fallback} html={html ? sanitizePlaylistDescriptionHtml(html) : undefined} className={className} />;
}
