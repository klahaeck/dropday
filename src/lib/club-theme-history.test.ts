import { describe, expect, it } from "vitest";
import { listPastClubThemes, nextClubThemeVersion } from "@/lib/club-theme-history";
import type { ClubTheme } from "@/types/domain";

const theme = (version: number, name = `Theme ${version}`): ClubTheme => ({
  name,
  version,
  updatedAt: `2026-07-${String(version).padStart(2, "0")}T12:00:00.000Z`,
});

describe("club theme history", () => {
  it("combines persisted history with legacy published-drop snapshots", () => {
    const persistedTheme = { ...theme(2), guidance: "The complete saved version." };
    const result = listPastClubThemes(
      { currentTheme: theme(3), themeHistory: [persistedTheme] },
      [
        { status: "published", playlist: { theme: theme(1) } },
        { status: "published", playlist: { theme: { ...theme(2), guidance: "An older snapshot." } } },
        { status: "scheduled", playlist: { theme: theme(3) } },
      ],
    );

    expect(result).toEqual([persistedTheme, theme(1)]);
  });

  it("does not show the current version even when an earlier drop used it", () => {
    expect(listPastClubThemes(
      { currentTheme: theme(4) },
      [{ status: "published", playlist: { theme: theme(4) } }],
    )).toEqual([]);
  });

  it("allocates versions after saved and historical themes", () => {
    expect(nextClubThemeVersion({
      currentTheme: theme(3),
      themeHistory: [theme(2)],
      savedThemes: [theme(5), theme(4)],
    })).toBe(6);
  });

  it("starts at version one for a freeform club", () => {
    expect(nextClubThemeVersion({})).toBe(1);
  });
});
