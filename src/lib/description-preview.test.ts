import { describe, expect, it } from "vitest";
import { truncateDescription } from "@/lib/description-preview";

describe("description previews", () => {
  it("leaves short descriptions unchanged", () => {
    expect(truncateDescription("A concise description.", 30)).toBe("A concise description.");
  });

  it("truncates long descriptions at a nearby word boundary", () => {
    expect(truncateDescription("A description that keeps going", 20)).toBe("A description…");
  });

  it("does not split multi-code-point characters", () => {
    expect(truncateDescription("🎧🎧🎧🎧", 3)).toBe("🎧🎧…");
  });
});
