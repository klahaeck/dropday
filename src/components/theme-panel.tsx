import Image from "next/image";
import { ThemeDescription } from "@/components/theme-description";
import { normalizeClubAccent } from "@/lib/club-accent";
import type { ClubTheme } from "@/types/domain";

export function ThemePanel({ theme, clubAccent, showVersion = true }: { theme: ClubTheme; clubAccent?: string; showVersion?: boolean }) {
  return <section className={`panel theme-panel${theme.imageUrl ? " theme-panel-has-image" : ""}`} style={{ "--club-accent": normalizeClubAccent(clubAccent) } as React.CSSProperties}>
    {theme.imageUrl && <Image src={theme.imageUrl} alt="" fill sizes="(max-width: 800px) 100vw, 50vw" unoptimized />}
    <div className="theme-panel-content">
      <span className="section-kicker">Current theme{showVersion ? ` · #${theme.version}` : ""}</span>
      <h2>{theme.name}</h2>
      <ThemeDescription html={theme.guidanceHtml} fallback={theme.guidance ?? ""} />
    </div>
  </section>;
}
