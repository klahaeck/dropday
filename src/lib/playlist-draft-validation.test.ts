import { describe, expect, it } from "vitest";
import { validatePlaylistDraft } from "@/lib/playlist-draft-validation";
import { PLAYLIST_DESCRIPTION_HTML_MAX_LENGTH, PLAYLIST_DESCRIPTION_MAX_LENGTH } from "@/lib/playlist-description";

const spotifyUrl = "https://open.spotify.com/playlist/37i9dQZF1DX4JAvHpjipBk";
const appleMusicUrl = "https://music.apple.com/us/playlist/example/pl.u-b3b8V4etKZA9p";

function valid(overrides: Record<string, unknown> = {}) {
  return {
    spotifyUrl,
    appleMusicUrl: "",
    title: "Late-night selections",
    descriptionHtml: "<p>A playlist for listening after dark.</p>",
    ...overrides,
  };
}

describe("playlist draft validation", () => {
  it("requires at least one supported provider URL", () => {
    const result = validatePlaylistDraft(valid({ spotifyUrl: "", appleMusicUrl: "" }));

    expect(result).toEqual(expect.objectContaining({
      success: false,
      errors: { spotifyUrl: "Add a Spotify or Apple Music playlist URL." },
    }));
  });

  it("identifies malformed and mismatched provider fields", () => {
    expect(validatePlaylistDraft(valid({ spotifyUrl: "not a url" }))).toEqual(expect.objectContaining({
      success: false,
      errors: expect.objectContaining({ spotifyUrl: expect.stringMatching(/complete/) }),
    }));
    expect(validatePlaylistDraft(valid({ spotifyUrl: appleMusicUrl }))).toEqual(expect.objectContaining({
      success: false,
      errors: expect.objectContaining({ spotifyUrl: expect.stringMatching(/Spotify field/) }),
    }));
    expect(validatePlaylistDraft(valid({ spotifyUrl: "", appleMusicUrl: spotifyUrl }))).toEqual(expect.objectContaining({
      success: false,
      errors: expect.objectContaining({ appleMusicUrl: expect.stringMatching(/Apple Music field/) }),
    }));
  });

  it("accepts either provider or both and returns sanitized content", () => {
    expect(validatePlaylistDraft(valid()).success).toBe(true);
    expect(validatePlaylistDraft(valid({ spotifyUrl: "", appleMusicUrl })).success).toBe(true);
    const both = validatePlaylistDraft(valid({ appleMusicUrl, descriptionHtml: "<p>Hello<script>alert(1)</script></p>" }));

    expect(both.success).toBe(true);
    if (both.success) {
      expect(both.data.spotifyUrl).toBe(spotifyUrl);
      expect(both.data.appleMusicUrl).toBe(appleMusicUrl);
      expect(both.data.descriptionHtml).not.toContain("script");
    }
  });

  it("enforces title and description bounds with keyed errors", () => {
    expect(validatePlaylistDraft(valid({ title: "x" }))).toEqual(expect.objectContaining({
      success: false,
      errors: expect.objectContaining({ title: expect.stringMatching(/at least 2/) }),
    }));
    expect(validatePlaylistDraft(valid({ title: "x".repeat(101) }))).toEqual(expect.objectContaining({
      success: false,
      errors: expect.objectContaining({ title: expect.stringMatching(/100/) }),
    }));
    expect(validatePlaylistDraft(valid({ descriptionHtml: "<p>x</p>" }))).toEqual(expect.objectContaining({
      success: false,
      errors: expect.objectContaining({ description: expect.stringMatching(/description/) }),
    }));
    expect(validatePlaylistDraft(valid({ descriptionHtml: `<p>${"x".repeat(PLAYLIST_DESCRIPTION_MAX_LENGTH + 1)}</p>` }))).toEqual(expect.objectContaining({
      success: false,
      errors: expect.objectContaining({ description: expect.stringMatching(/10,000/) }),
    }));
    expect(validatePlaylistDraft(valid({ descriptionHtml: "x".repeat(PLAYLIST_DESCRIPTION_HTML_MAX_LENGTH + 1) }))).toEqual(expect.objectContaining({
      success: false,
      errors: expect.objectContaining({ description: expect.stringMatching(/formatting/) }),
    }));
  });
});
