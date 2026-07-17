import Image from "next/image";
import { ThemeDescription } from "@/components/theme-description";
import type { ClubTheme } from "@/types/domain";

export function ThemePanel({ theme, showVersion = true }: { theme: ClubTheme; showVersion?: boolean }) {
  return <section className={`panel panel-orange theme-panel${theme.imageUrl ? " theme-panel-has-image" : ""}`}>
    {theme.imageUrl && <Image src={theme.imageUrl} alt="" fill sizes="(max-width: 800px) 100vw, 50vw" unoptimized />}
    <div className="theme-panel-content">
      <span className="section-kicker">Current theme{showVersion ? ` · #${theme.version}` : ""}</span>
      <h2>{theme.name}</h2>
      <ThemeDescription html={theme.guidanceHtml} fallback={theme.guidance ?? ""} />
    </div>
  </section>;
}
