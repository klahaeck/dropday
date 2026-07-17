import type { Club, ClubTheme, DropSlot, PlaylistSnapshot } from "@/types/domain";

type ThemeHistoryClub = Pick<Club, "currentTheme" | "themeHistory">;
type ThemeHistoryDrop = Pick<DropSlot, "status"> & {
  playlist?: Pick<PlaylistSnapshot, "theme">;
};

export function listPastClubThemes(club: ThemeHistoryClub, drops: ThemeHistoryDrop[]): ClubTheme[] {
  const themesByVersion = new Map<number, ClubTheme>();

  for (const drop of drops) {
    if (drop.status !== "published" || !drop.playlist?.theme) continue;
    const theme = drop.playlist.theme;
    if (theme.version !== club.currentTheme?.version) themesByVersion.set(theme.version, theme);
  }

  for (const theme of club.themeHistory ?? []) {
    if (theme.version !== club.currentTheme?.version) themesByVersion.set(theme.version, theme);
  }

  return [...themesByVersion.values()].sort((a, b) =>
    b.version - a.version || b.updatedAt.localeCompare(a.updatedAt)
  );
}

export function nextClubThemeVersion(club: Pick<Club, "currentTheme" | "themeHistory" | "savedThemes">): number {
  return Math.max(
    club.currentTheme?.version ?? 0,
    ...(club.themeHistory ?? []).map((theme) => theme.version),
    ...(club.savedThemes ?? []).map((theme) => theme.version),
  ) + 1;
}
