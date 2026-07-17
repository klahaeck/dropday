import { ExpandableDescription } from "@/components/expandable-description";
import { sanitizeThemeDescriptionHtml } from "@/lib/theme-description";

export function ThemeDescription({ html, fallback, className }: { html?: string; fallback: string; className?: string }) {
  return <ExpandableDescription text={fallback} html={html ? sanitizeThemeDescriptionHtml(html) : undefined} className={className} />;
}
