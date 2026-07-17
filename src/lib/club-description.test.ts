import { describe, expect, it } from "vitest";
import { clubDescriptionToText, sanitizeClubDescriptionHtml } from "@/lib/club-description";
import { plainTextToRichTextHtml } from "@/lib/rich-text";

describe("club description rich text", () => {
  it("keeps supported formatting while removing unsafe markup", () => {
    expect(sanitizeClubDescriptionHtml('<p class="intro">Deep <b onclick="bad()">listening</b>.</p><script>alert(1)</script>')).toBe(
      "<p>Deep <strong>listening</strong>.</p>",
    );
  });

  it("creates the plain-text description used by cards and search", () => {
    expect(clubDescriptionToText("<p>For curious ears.</p><ul><li>Jazz</li><li>Soul</li></ul>")).toBe(
      "For curious ears.\n• Jazz\n• Soul",
    );
  });

  it("safely prepares legacy plain-text descriptions for the editor", () => {
    const html = plainTextToRichTextHtml('Jazz & soul <script>\n"After dark"');

    expect(html).toBe("<p>Jazz &amp; soul &lt;script&gt;<br>&quot;After dark&quot;</p>");
    expect(clubDescriptionToText(html)).toBe('Jazz & soul <script>\n"After dark"');
  });
});
