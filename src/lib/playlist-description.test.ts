import { describe, expect, it } from "vitest";
import { playlistDescriptionToText, sanitizePlaylistDescriptionHtml } from "@/lib/playlist-description";

describe("playlist description rich text", () => {
  it("keeps basic formatting and removes tag attributes", () => {
    expect(sanitizePlaylistDescriptionHtml('<p class="intro">Turn up the <b onclick="bad()">drums</b>.</p>')).toBe(
      "<p>Turn up the <strong>drums</strong>.</p>",
    );
  });

  it("removes active and unsupported content", () => {
    expect(sanitizePlaylistDescriptionHtml('<p>Hello</p><script>alert(1)</script><img src=x onerror=bad()>')).toBe("<p>Hello</p>");
  });

  it("creates a readable plain-text fallback", () => {
    expect(playlistDescriptionToText("<p>Side A</p><ul><li>Warm</li><li>Fast &amp; loud</li></ul>")).toBe(
      "Side A\n• Warm\n• Fast & loud",
    );
  });

  it("normalizes contenteditable line blocks into paragraphs", () => {
    expect(sanitizePlaylistDescriptionHtml("<div>Side A</div><div>Side B</div>")).toBe("<p>Side A</p><p>Side B</p>");
  });
});
