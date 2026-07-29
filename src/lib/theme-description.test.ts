import { describe, expect, it } from "vitest";
import {
  THEME_DESCRIPTION_HTML_MAX_LENGTH,
  THEME_DESCRIPTION_MAX_LENGTH,
  sanitizeThemeDescriptionHtml,
  themeDescriptionToText,
} from "@/lib/theme-description";

describe("theme description rich text", () => {
  it("allows descriptions up to 5,000 characters", () => {
    expect(THEME_DESCRIPTION_MAX_LENGTH).toBe(5_000);
    expect(THEME_DESCRIPTION_HTML_MAX_LENGTH).toBe(50_000);
  });

  it("preserves supported formatting and derives searchable text", () => {
    const html = sanitizeThemeDescriptionHtml("<p>Songs for <b>late nights</b>.</p><script>alert(1)</script>");

    expect(html).toBe("<p>Songs for <strong>late nights</strong>.</p>");
    expect(themeDescriptionToText(html)).toBe("Songs for late nights.");
  });
});
