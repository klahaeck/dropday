import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireViewer: vi.fn(),
  discardArtwork: vi.fn(),
  isOwnedArtworkUrl: vi.fn(),
  resolvePlaylist: vi.fn(),
  insertDraft: vi.fn(),
  consumeRateLimit: vi.fn(),
  reportOperationalError: vi.fn(),
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
vi.mock("@/lib/observability", () => ({ reportOperationalError: mocks.reportOperationalError }));

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

function malformedRequest() {
  return new Request("http://localhost/api/drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
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

  it("returns a client error for malformed JSON", async () => {
    const response = await POST(malformedRequest());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid playlist request." });
    expect(mocks.consumeRateLimit).not.toHaveBeenCalled();
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

  it("returns a retryable server error without exposing persistence details", async () => {
    mocks.insertDraft.mockRejectedValueOnce(new Error("mongodb://internal-host unavailable"));

    const response = await POST(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Could not save this playlist. Try again." });
    expect(mocks.reportOperationalError).toHaveBeenCalledWith(
      "playlist-draft.create",
      expect.any(Error),
      { userId: "user-1" },
    );
  });

  it("classifies rate-limit storage failures as retryable server errors", async () => {
    mocks.consumeRateLimit.mockRejectedValueOnce(new Error("rate-limit database unavailable"));

    const response = await POST(request({ artworkUrl }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Could not save this playlist. Try again." });
    expect(mocks.discardArtwork).toHaveBeenCalledWith(artworkUrl);
    expect(mocks.reportOperationalError).toHaveBeenCalledWith(
      "playlist-draft.rate-limit",
      expect.any(Error),
      { userId: "user-1", operation: "create" },
    );
  });
});
