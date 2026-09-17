import { describe, expect, it } from "vitest";
import {
  CLUB_CREATION_STEPS,
  DEFAULT_CLUB_VISIBILITY,
  nextClubCreationStep,
  previousClubCreationStep,
  shouldWarnAboutUnsavedClub,
  validateClubCreationStep,
  type ClubCreationValues,
} from "@/lib/club-creation-flow";

const valid: ClubCreationValues = {
  name: "Needle Exchange",
  description: "A thoughtful listening club.",
  descriptionHtml: "<p>A thoughtful listening club.</p>",
  startsOn: "2026-09-20",
  localTime: "19:30",
  timezone: "America/Chicago",
  frequency: "weekly",
  interval: "1",
  useTheme: false,
  theme: "",
};

describe("club creation flow", () => {
  it("defines three ordered steps and a private default", () => {
    expect(CLUB_CREATION_STEPS.map((step) => step.id)).toEqual(["identity", "ritual", "finish"]);
    expect(DEFAULT_CLUB_VISIBILITY).toBe("private");
  });

  it("moves only between adjacent bounded steps", () => {
    expect(previousClubCreationStep("identity")).toBe("identity");
    expect(nextClubCreationStep("identity")).toBe("ritual");
    expect(previousClubCreationStep("finish")).toBe("ritual");
    expect(nextClubCreationStep("finish")).toBe("finish");
  });

  it("validates only the requested step", () => {
    expect(validateClubCreationStep("identity", { ...valid, name: "" })[0]).toMatchObject({ field: "name" });
    expect(validateClubCreationStep("ritual", { ...valid, timezone: "Chicago-ish" })[0]).toMatchObject({ field: "timezone" });
    expect(validateClubCreationStep("finish", { ...valid, useTheme: true, theme: "x" })[0]).toMatchObject({ field: "theme" });
    expect(validateClubCreationStep("finish", { ...valid, useTheme: false, theme: "" })).toEqual([]);
    expect(validateClubCreationStep("identity", valid)).toEqual([]);
    expect(validateClubCreationStep("ritual", valid)).toEqual([]);
  });

  it("warns only for dirty, uncommitted forms", () => {
    expect(shouldWarnAboutUnsavedClub({ dirty: false, created: false })).toBe(false);
    expect(shouldWarnAboutUnsavedClub({ dirty: true, created: false })).toBe(true);
    expect(shouldWarnAboutUnsavedClub({ dirty: true, created: true })).toBe(false);
  });
});
