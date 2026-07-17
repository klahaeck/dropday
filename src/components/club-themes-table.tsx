import Image from "next/image";
import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { ActivateThemeButton } from "@/components/activate-theme-button";
import { ClearCurrentThemeButton } from "@/components/clear-current-theme-button";
import { Pill } from "@/components/pill";
import { normalizeClubAccent } from "@/lib/club-accent";
import { formatDateTime } from "@/lib/format";
import type { ClubTheme } from "@/types/domain";

export function ClubThemesTable({
  clubSlug,
  currentTheme,
  savedThemes,
  pastThemes,
  clubAccent,
  timezone,
}: {
  clubSlug: string;
  currentTheme?: ClubTheme;
  savedThemes: ClubTheme[];
  pastThemes: ClubTheme[];
  clubAccent?: string;
  timezone: string;
}) {
  const saved = savedThemes.filter((theme) => theme.version !== currentTheme?.version);
  const savedVersions = new Set(saved.map((theme) => theme.version));
  const themes = [...(currentTheme ? [currentTheme] : []), ...saved.slice().sort((a, b) => b.version - a.version), ...pastThemes.filter((theme) => !savedVersions.has(theme.version))];

  return <section className="panel club-themes-admin" style={{ "--club-accent": normalizeClubAccent(clubAccent) } as React.CSSProperties}>
    <div className="club-themes-admin-header">
      <div><span className="section-kicker">Playlist prompts</span><h2>Club themes</h2><p>{currentTheme ? `${themes.length} theme${themes.length === 1 ? "" : "s"} in this club.` : "This club is currently freeform."}</p></div>
      <div className="club-themes-admin-actions">{currentTheme && <ClearCurrentThemeButton clubSlug={clubSlug} />}<Link className="button button-dark button-small" href={`/app/clubs/${clubSlug}/themes/new`}><Plus size={15} /> New theme</Link></div>
    </div>
    <div className="club-themes-table-scroll">
      <table className="club-themes-table">
        <thead><tr><th scope="col">Theme</th><th scope="col">Description</th><th scope="col">Updated</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{themes.length ? themes.map((theme) => {
          const isCurrent = theme.version === currentTheme?.version;
          const isSaved = savedVersions.has(theme.version);
          return <tr key={theme.version}>
            <td><div className="club-theme-table-title"><div className={`club-theme-table-art${theme.imageUrl ? " club-theme-table-art-image" : ""}`}>{theme.imageUrl ? <Image src={theme.imageUrl} alt="" fill sizes="48px" unoptimized /> : <span>{theme.name.slice(0, 2).toUpperCase()}</span>}</div><div><strong>{theme.name}</strong><small>Theme #{theme.version}</small></div></div></td>
            <td><p className="club-theme-table-description">{theme.guidance || "No description"}</p></td>
            <td><time dateTime={theme.updatedAt}>{formatDateTime(theme.updatedAt, timezone)}</time></td>
            <td><Pill tone={isCurrent ? "green" : isSaved ? "orange" : "neutral"}>{isCurrent ? "Current" : isSaved ? "Saved" : "Past"}</Pill></td>
            <td><div className="club-theme-table-actions">{isSaved && <ActivateThemeButton clubSlug={clubSlug} version={theme.version} />}<Link className="button button-ghost button-small" href={`/app/clubs/${clubSlug}/themes/${theme.version}/edit`}><Pencil size={13} /> Edit</Link></div></td>
          </tr>;
        }) : <tr><td colSpan={5} className="club-themes-table-empty">No themes yet. Create one whenever the club wants a shared prompt.</td></tr>}</tbody>
      </table>
    </div>
  </section>;
}
