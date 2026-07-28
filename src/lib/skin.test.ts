import { describe, expect, it } from "vitest";
import { DEFAULT_SKIN, isSkinPreference, resolveSkinPreference, SKIN_IDS, SKINS, skinDefinition } from "@/lib/skin";

describe("skin preferences", () => {
  it("accepts only supported skins", () => {
    expect(isSkinPreference("classic")).toBe(true);
    expect(isSkinPreference("brutal")).toBe(true);
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
  });

  it("describes every registered skin", () => {
    for (const skin of SKINS) {
      expect(skinDefinition(skin.id)).toEqual(skin);
      expect(skin.label.length).toBeGreaterThan(0);
      expect(skin.description.length).toBeGreaterThan(0);
    }
  });
});
