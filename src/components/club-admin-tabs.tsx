import Link from "next/link";
import { ListOrdered, Palette, Settings } from "lucide-react";

export function ClubAdminTabs({
  clubSlug,
  active,
  memberCount,
}: {
  clubSlug: string;
  active: "settings" | "themes" | "queue";
  memberCount: number;
}) {
  const settingsHref = `/app/clubs/${clubSlug}/settings`;

  return (
    <nav className="club-admin-tabs" aria-label="Club management">
      <Link
        className={`club-admin-tab${active === "settings" ? " club-admin-tab-active" : ""}`}
        href={settingsHref}
        aria-current={active === "settings" ? "page" : undefined}
      >
        <Settings size={16} aria-hidden="true" />
        Settings
      </Link>
      <Link
        className={`club-admin-tab${active === "themes" ? " club-admin-tab-active" : ""}`}
        href={`${settingsHref}/themes`}
        aria-current={active === "themes" ? "page" : undefined}
      >
        <Palette size={16} aria-hidden="true" />
        Themes
      </Link>
      <Link
        className={`club-admin-tab${active === "queue" ? " club-admin-tab-active" : ""}`}
        href={`${settingsHref}/queue`}
        aria-current={active === "queue" ? "page" : undefined}
      >
        <ListOrdered size={16} aria-hidden="true" />
        Queue
        <span className="club-admin-tab-count" aria-label={`${memberCount} members`}>
          {memberCount}
        </span>
      </Link>
    </nav>
  );
}
