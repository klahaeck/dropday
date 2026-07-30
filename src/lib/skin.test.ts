import { describe, expect, it } from "vitest";
import {
  CLASSIC_ONLY_SKIN_ROUTES,
  DEFAULT_SKIN,
  isClassicOnlySkinPath,
  isSkinPreference,
  resolveSkinPreference,
  SKIN_IDS,
  SKINS,
  skinDefinition,
} from "@/lib/skin";

describe("skin preferences", () => {
  it("accepts only supported skins", () => {
    expect(isSkinPreference("classic")).toBe(true);
    expect(isSkinPreference("brutal")).toBe(true);
    expect(isSkinPreference("seventies")).toBe(true);
    expect(isSkinPreference("eighties")).toBe(true);
    expect(isSkinPreference("metal")).toBe(true);
    expect(isSkinPreference("rap")).toBe(true);
    expect(isSkinPreference("classical")).toBe(false);
    expect(isSkinPreference("stereo")).toBe(false);
    expect(isSkinPreference(undefined)).toBe(false);
  });

  it("accepts every registered skin and nothing else", () => {
    for (const skin of SKINS) expect(isSkinPreference(skin.id)).toBe(true);
    expect(SKIN_IDS).toEqual(SKINS.map((skin) => skin.id));
    expect(SKIN_IDS).toContain(DEFAULT_SKIN);
  });

  it("defaults to the original design", () => {
    expect(DEFAULT_SKIN).toBe("classic");
    expect(resolveSkinPreference(null)).toBe("classic");
    expect(resolveSkinPreference("nonsense")).toBe("classic");
  });

  it("keeps a stored skin that is still supported", () => {
    expect(resolveSkinPreference("brutal")).toBe("brutal");
    expect(resolveSkinPreference("classic")).toBe("classic");
    expect(resolveSkinPreference("seventies")).toBe("seventies");
    expect(resolveSkinPreference("eighties")).toBe("eighties");
    expect(resolveSkinPreference("metal")).toBe("metal");
    expect(resolveSkinPreference("rap")).toBe("rap");
    expect(resolveSkinPreference("classical")).toBe("classic");
  });

  it("uses the classic design throughout sign-in and sign-up routes", () => {
    expect(CLASSIC_ONLY_SKIN_ROUTES).toEqual(["/sign-in", "/sign-up"]);
    expect(isClassicOnlySkinPath("/sign-in")).toBe(true);
    expect(isClassicOnlySkinPath("/sign-in/factor-one")).toBe(true);
    expect(isClassicOnlySkinPath("/sign-up")).toBe(true);
    expect(isClassicOnlySkinPath("/sign-up/verify-email-address")).toBe(true);
    expect(isClassicOnlySkinPath("/sign-invitation")).toBe(false);
    expect(isClassicOnlySkinPath("/app")).toBe(false);
  });

  it("describes every registered skin", () => {
    expect(SKINS.map((skin) => skin.label)).toEqual(["Studio", "Raw", "Groove", "Neon", "Amped", "Mixtape"]);
    for (const skin of SKINS) {
      expect(skinDefinition(skin.id)).toEqual(skin);
      expect(skin.label.length).toBeGreaterThan(0);
      expect(skin.description.length).toBeGreaterThan(0);
    }
  });
});
