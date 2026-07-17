import { describe, expect, it } from "vitest";
import { getPlaylistVersions, normalizePlaylistUrl } from "@/lib/playlist-providers";

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

describe("playlist versions", () => {
  const spotify = {
    provider: "spotify" as const,
    providerPlaylistId: "spotify-id",
    canonicalUrl: "https://open.spotify.com/playlist/spotify-id",
    embedUrl: "https://open.spotify.com/embed/playlist/spotify-id",
  };

  it("keeps legacy single-provider playlists readable", () => {
    expect(getPlaylistVersions(spotify)).toEqual([spotify]);
  });

  it("returns one link for each provider without duplicating the primary version", () => {
    const appleMusic = {
      provider: "apple-music" as const,
      providerPlaylistId: "pl.apple-id",
      canonicalUrl: "https://music.apple.com/us/playlist/example/pl.apple-id",
      embedUrl: "https://embed.music.apple.com/us/playlist/example/pl.apple-id",
    };

    expect(getPlaylistVersions({ ...spotify, versions: [spotify, appleMusic] })).toEqual([spotify, appleMusic]);
  });
});
