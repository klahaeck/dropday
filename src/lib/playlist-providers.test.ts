import { describe, expect, it } from "vitest";
import { normalizePlaylistUrl } from "@/lib/playlist-providers";

describe("playlist URL normalization", () => {
  it("normalizes Spotify playlists and drops tracking parameters", () => {
    expect(normalizePlaylistUrl("https://open.spotify.com/playlist/37i9dQZF1DX4JAvHpjipBk?si=secret")).toMatchObject({
      provider: "spotify",
      providerPlaylistId: "37i9dQZF1DX4JAvHpjipBk",
      canonicalUrl: "https://open.spotify.com/playlist/37i9dQZF1DX4JAvHpjipBk",
    });
  });

  it("creates an Apple Music embed URL", () => {
    expect(normalizePlaylistUrl("https://music.apple.com/us/playlist/example/pl.u-b3b8V4etKZA9p")).toMatchObject({
      provider: "apple-music",
      providerPlaylistId: "pl.u-b3b8V4etKZA9p",
      embedUrl: "https://embed.music.apple.com/us/playlist/example/pl.u-b3b8V4etKZA9p",
    });
  });

  it("rejects non-provider URLs and non-HTTPS schemes", () => {
    expect(() => normalizePlaylistUrl("https://example.com/playlist/abc")).toThrow(/Only Spotify/);
    expect(() => normalizePlaylistUrl("http://open.spotify.com/playlist/abc")).toThrow(/HTTPS/);
  });
});
