import { describe, expect, it } from "vitest";
import {
  FALLBACK_TIMEZONES,
  isValidTimeZone,
  listTimeZones,
  suggestedTimeZone,
} from "@/lib/timezones";

describe("IANA timezone helpers", () => {
  it("sorts, deduplicates, and includes valid browser and stored zones", () => {
    expect(listTimeZones({
      storedZone: "Etc/GMT+5",
      browserZone: "Europe/Paris",
      supportedValuesOf: () => ["Europe/Paris", "America/Chicago", "Europe/Paris"],
    })).toEqual(["America/Chicago", "Etc/GMT+5", "Europe/Paris"]);
  });

  it("uses the conservative fallback when supported values are unavailable", () => {
    expect(listTimeZones({ supportedValuesOf: () => [] })).toEqual(
      [...FALLBACK_TIMEZONES].sort((a, b) => a.localeCompare(b)),
    );
    expect(listTimeZones({ supportedValuesOf: () => { throw new Error("unsupported"); } })).toEqual(
      [...FALLBACK_TIMEZONES].sort((a, b) => a.localeCompare(b)),
    );
  });

  it("validates canonical and legacy-valid identifiers", () => {
    expect(isValidTimeZone("America/Chicago")).toBe(true);
    expect(isValidTimeZone("Etc/GMT+5")).toBe(true);
    expect(isValidTimeZone("Chicago-ish")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });

  it("suggests a valid browser zone only while untouched", () => {
    expect(suggestedTimeZone({
      currentZone: "America/Chicago",
      browserZone: "Europe/Paris",
      touched: false,
    })).toBe("Europe/Paris");
    expect(suggestedTimeZone({
      currentZone: "America/Chicago",
      browserZone: "Europe/Paris",
      touched: true,
    })).toBe("America/Chicago");
    expect(suggestedTimeZone({
      currentZone: "America/Chicago",
      browserZone: "not-a-zone",
      touched: false,
    })).toBe("America/Chicago");
  });
});
