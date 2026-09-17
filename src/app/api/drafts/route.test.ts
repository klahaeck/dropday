import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireViewer: vi.fn(),
  discardArtwork: vi.fn(),
  isOwnedArtworkUrl: vi.fn(),
  resolvePlaylist: vi.fn(),
  insertDraft: vi.fn(),
  consumeRateLimit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireViewer: mocks.requireViewer }));
vi.mock("@/lib/blob-artwork", () => ({
  discardArtwork: mocks.discardArtwork,
  isOwnedArtworkUrl: mocks.isOwnedArtworkUrl,
}));
vi.mock("@/lib/env", () => ({ integrations: { mongo: false } }));
vi.mock("@/lib/playlist-providers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/playlist-providers")>()),
  resolvePlaylist: mocks.resolvePlaylist,
}));
vi.mock("@/lib/repository", () => ({
  createId: () => "draft-created",
  insertDraft: mocks.insertDraft,
}));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: mocks.consumeRateLimit }));

import { POST } from "@/app/api/drafts/route";

const spotifyUrl = "https://open.spotify.com/playlist/37i9dQZF1DX4JAvHpjipBk";
const artworkUrl = "https://store.public.blob.vercel-storage.com/artwork/playlist/user-1/test.jpg";

function request(overrides: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      spotifyUrl,
      appleMusicUrl: "",
      title: "Night drive",
      descriptionHtml: "<p>Songs for the long way home.</p>",
      ...overrides,
    }),
  });
}

describe("playlist draft create route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireViewer.mockResolvedValue({
      profile: { id: "user-1" },
      features: { playlistLibrary: true },
    });
    mocks.isOwnedArtworkUrl.mockReturnValue(true);
    mocks.consumeRateLimit.mockResolvedValue(true);
    mocks.resolvePlaylist.mockResolvedValue({
      provider: "spotify",
      providerPlaylistId: "37i9dQZF1DX4JAvHpjipBk",
      canonicalUrl: spotifyUrl,
      embedUrl: "https://open.spotify.com/embed/playlist/37i9dQZF1DX4JAvHpjipBk",
      metadata: {},
    });
  });

  it("returns the field for shared validation errors and discards incoming artwork", async () => {
    const response = await POST(request({ spotifyUrl: "", artworkUrl }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Add a Spotify or Apple Music playlist URL.",
      field: "spotifyUrl",
    });
    expect(mocks.discardArtwork).toHaveBeenCalledWith(artworkUrl);
    expect(mocks.insertDraft).not.toHaveBeenCalled();
  });

  it("identifies a URL placed in the wrong provider field", async () => {
    const response = await POST(request({
      spotifyUrl: "https://music.apple.com/us/playlist/example/pl.u-b3b8V4etKZA9p",
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ field: "spotifyUrl" });
    expect(mocks.resolvePlaylist).not.toHaveBeenCalled();
  });

  it("creates a validated playlist without changing the success contract", async () => {
    const response = await POST(request());

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      draft: { id: "draft-created", title: "Night drive" },
      demo: true,
    });
    expect(mocks.insertDraft).toHaveBeenCalledWith(expect.objectContaining({
      id: "draft-created",
      ownerId: "user-1",
      description: "Songs for the long way home.",
    }));
  });
});
