import Image from "next/image";
import { ThemeDescription } from "@/components/theme-description";
import { normalizeClubAccent } from "@/lib/club-accent";
import type { ClubTheme } from "@/types/domain";

export function ThemeHistory({ themes, clubAccent }: { themes: ClubTheme[]; clubAccent?: string }) {
  if (!themes.length) {
    return <div className="empty-state theme-history-empty">
      <h2>No past themes yet.</h2>
      <p>The current theme will move here when the club starts its next one.</p>
    </div>;
  }

  return <div className="theme-history-grid" style={{ "--club-accent": normalizeClubAccent(clubAccent) } as React.CSSProperties}>
    {themes.map((theme) => <article className={`theme-history-card${theme.imageUrl ? " theme-history-card-has-image" : ""}`} key={theme.version}>
      {theme.imageUrl && <Image src={theme.imageUrl} alt="" fill sizes="(max-width: 800px) 100vw, 33vw" unoptimized />}
      <div className="theme-history-card-content">
        <span className="section-kicker">Theme #{theme.version}</span>
        <h3>{theme.name}</h3>
        <ThemeDescription html={theme.guidanceHtml} fallback={theme.guidance ?? ""} />
      </div>
    </article>)}
  </div>;
}
