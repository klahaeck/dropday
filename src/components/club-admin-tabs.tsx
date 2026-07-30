import Link from "next/link";
import { ListOrdered, PackageOpen, Palette, Settings, UsersRound } from "lucide-react";

export function ClubAdminTabs({
  clubSlug,
  active,
  memberCount,
}: {
  clubSlug: string;
  active: "settings" | "members" | "themes" | "backups" | "queue";
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
        className={`club-admin-tab${active === "members" ? " club-admin-tab-active" : ""}`}
        href={`${settingsHref}/members`}
        aria-current={active === "members" ? "page" : undefined}
      >
        <UsersRound size={16} aria-hidden="true" />
        Members
        <span className="club-admin-tab-count" aria-label={`${memberCount} members`}>
          {memberCount}
        </span>
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
        className={`club-admin-tab${active === "backups" ? " club-admin-tab-active" : ""}`}
        href={`${settingsHref}/backups`}
        aria-current={active === "backups" ? "page" : undefined}
      >
        <PackageOpen size={16} aria-hidden="true" />
        Backups
      </Link>
      <Link
        className={`club-admin-tab${active === "queue" ? " club-admin-tab-active" : ""}`}
        href={`${settingsHref}/queue`}
        aria-current={active === "queue" ? "page" : undefined}
      >
        <ListOrdered size={16} aria-hidden="true" />
        Queue
      </Link>
    </nav>
  );
}
