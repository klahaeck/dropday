import { describe, expect, it } from "vitest";
import { isThemePreference, resolveThemePreference } from "@/lib/theme";

describe("theme preferences", () => {
  it("accepts only supported preferences", () => {
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("midnight")).toBe(false);
  });

  it("follows the device when the preference is system", () => {
    expect(resolveThemePreference("system", true)).toBe("dark");
    expect(resolveThemePreference("system", false)).toBe("light");
  });

  it("keeps an explicit theme regardless of the device", () => {
    expect(resolveThemePreference("dark", false)).toBe("dark");
    expect(resolveThemePreference("light", true)).toBe("light");
  });
});
