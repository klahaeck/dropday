import { sanitizeClubDescriptionHtml } from "@/lib/club-description";

export function ClubDescription({ html, fallback, className }: { html?: string; fallback: string; className?: string }) {
  const sanitizedHtml = html ? sanitizeClubDescriptionHtml(html) : "";

  return sanitizedHtml ? (
    <div className={className} dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
  ) : (
    <div className={className}><p>{fallback}</p></div>
  );
}
