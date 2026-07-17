import { describe, expect, it } from "vitest";
import { sanitizeThemeDescriptionHtml, themeDescriptionToText } from "@/lib/theme-description";

describe("theme description rich text", () => {
  it("preserves supported formatting and derives searchable text", () => {
    const html = sanitizeThemeDescriptionHtml("<p>Songs for <b>late nights</b>.</p><script>alert(1)</script>");

    expect(html).toBe("<p>Songs for <strong>late nights</strong>.</p>");
    expect(themeDescriptionToText(html)).toBe("Songs for late nights.");
  });
});
