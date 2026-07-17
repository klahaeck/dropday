import type { PlaylistProvider, PlaylistMetadata, PlaylistVersion } from "@/types/domain";

export interface NormalizedPlaylist {
  provider: PlaylistProvider;
  providerPlaylistId: string;
  canonicalUrl: string;
  embedUrl: string;
}

export interface ResolvedPlaylist extends NormalizedPlaylist {
  metadata: PlaylistMetadata;
  warning?: string;
}

export interface PlaylistProviderAdapter {
  provider: PlaylistProvider;
  matches(url: URL): boolean;
  normalize(url: URL): NormalizedPlaylist;
  fetchMetadata(url: string): Promise<PlaylistMetadata>;
}

const spotifyAdapter: PlaylistProviderAdapter = {
  provider: "spotify",
  matches: (url) => url.hostname === "open.spotify.com" && url.pathname.startsWith("/playlist/"),
  normalize(url) {
    const id = url.pathname.split("/").filter(Boolean)[1];
    if (!id || !/^[A-Za-z0-9]+$/.test(id)) throw new Error("Invalid Spotify playlist URL");
    return {
      provider: "spotify",
      providerPlaylistId: id,
      canonicalUrl: `https://open.spotify.com/playlist/${id}`,
      embedUrl: `https://open.spotify.com/embed/playlist/${id}?utm_source=generator&theme=0`,
    };
  },
  async fetchMetadata(url) {
    const response = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return {};
    const data = (await response.json()) as { title?: string; thumbnail_url?: string };
    return { providerTitle: data.title, artworkUrl: data.thumbnail_url };
  },
};

const appleMusicAdapter: PlaylistProviderAdapter = {
  provider: "apple-music",
  matches: (url) =>
    (url.hostname === "music.apple.com" || url.hostname === "embed.music.apple.com") &&
    url.pathname.includes("/playlist/"),
  normalize(url) {
    const id = url.searchParams.get("i") ?? url.pathname.split("/").filter(Boolean).at(-1);
    if (!id || !/^[A-Za-z0-9.-]+$/.test(id)) throw new Error("Invalid Apple Music playlist URL");
    const path = url.pathname.replace(/^\/(?:embed\/)?/, "/");
    const canonicalUrl = `https://music.apple.com${path}`;
    return {
      provider: "apple-music",
      providerPlaylistId: id,
      canonicalUrl,
      embedUrl: `https://embed.music.apple.com${path}`,
    };
  },
  async fetchMetadata(url) {
    const response = await fetch(url, {
      headers: { "User-Agent": "Dropday/1.0 (+https://dropday.app)" },
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return {};
    const html = await response.text();
    const title = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1];
    const artworkUrl = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)?.[1];
    return { providerTitle: title, artworkUrl };
  },
};

export const playlistAdapters = [spotifyAdapter, appleMusicAdapter] as const;

export function normalizePlaylistUrl(input: string): NormalizedPlaylist {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Enter a complete Spotify or Apple Music playlist URL");
  }
  if (url.protocol !== "https:") throw new Error("Playlist links must use HTTPS");
  const adapter = playlistAdapters.find((candidate) => candidate.matches(url));
  if (!adapter) throw new Error("Only Spotify and Apple Music playlist links are supported");
  return adapter.normalize(url);
}

export async function resolvePlaylist(input: string): Promise<ResolvedPlaylist> {
  const normalized = normalizePlaylistUrl(input);
  const adapter = playlistAdapters.find((candidate) => candidate.provider === normalized.provider)!;
  try {
    return { ...normalized, metadata: await adapter.fetchMetadata(normalized.canonicalUrl), warning: undefined };
  } catch {
    return {
      ...normalized,
      metadata: {},
      warning: "The link is valid, but provider artwork and metadata could not be loaded.",
    };
  }
}

type PlaylistWithVersions = PlaylistVersion & { versions?: PlaylistVersion[] };

export function getPlaylistVersions(playlist: PlaylistWithVersions): PlaylistVersion[] {
  const primary = {
    provider: playlist.provider,
    providerPlaylistId: playlist.providerPlaylistId,
    canonicalUrl: playlist.canonicalUrl,
    embedUrl: playlist.embedUrl,
  };
  const versions = [primary, ...(playlist.versions ?? [])];
  return versions.filter((version, index) =>
    versions.findIndex((candidate) => candidate.provider === version.provider) === index
  );
}
