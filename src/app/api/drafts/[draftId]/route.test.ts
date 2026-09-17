import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaylistDraft } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  requireViewer: vi.fn(),
  discardArtwork: vi.fn(),
  isOwnedArtworkUrl: vi.fn(),
  resolvePlaylist: vi.fn(),
  getDraftByIdForOwner: vi.fn(),
  updateDraftForOwner: vi.fn(),
  consumeRateLimit: vi.fn(),
  reportOperationalError: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireViewer: mocks.requireViewer }));
vi.mock("@/lib/blob-artwork", () => ({
  discardArtwork: mocks.discardArtwork,
  isOwnedArtworkUrl: mocks.isOwnedArtworkUrl,
}));
vi.mock("@/lib/playlist-providers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/playlist-providers")>()),
  resolvePlaylist: mocks.resolvePlaylist,
}));
vi.mock("@/lib/repository", () => ({
  getDraftByIdForOwner: mocks.getDraftByIdForOwner,
  updateDraftForOwner: mocks.updateDraftForOwner,
}));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: mocks.consumeRateLimit }));
vi.mock("@/lib/observability", () => ({ reportOperationalError: mocks.reportOperationalError }));

import { PATCH } from "@/app/api/drafts/[draftId]/route";

const spotifyUrl = "https://open.spotify.com/playlist/37i9dQZF1DX4JAvHpjipBk";
const oldArtworkUrl = "https://store.public.blob.vercel-storage.com/artwork/playlist/user-1/old.jpg";
const incomingArtworkUrl = "https://store.public.blob.vercel-storage.com/artwork/playlist/user-1/new.jpg";

const existing: PlaylistDraft = {
  id: "draft-1",
  ownerId: "user-1",
  title: "Old title",
  description: "Old description",
  descriptionHtml: "<p>Old description</p>",
  provider: "spotify",
  providerPlaylistId: "37i9dQZF1DX4JAvHpjipBk",
  canonicalUrl: spotifyUrl,
  embedUrl: "https://open.spotify.com/embed/playlist/37i9dQZF1DX4JAvHpjipBk",
  metadata: { artworkUrl: oldArtworkUrl },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function request(overrides: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/drafts/draft-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      spotifyUrl,
      appleMusicUrl: "",
      title: "Updated title",
      descriptionHtml: "<p>An updated description.</p>",
      removeArtwork: false,
      ...overrides,
    }),
  });
}

function malformedRequest() {
  return new Request("http://localhost/api/drafts/draft-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
}

function update(overrides?: Record<string, unknown>) {
  return PATCH(request(overrides), { params: Promise.resolve({ draftId: "draft-1" }) });
}

describe("playlist draft update route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireViewer.mockResolvedValue({
      profile: { id: "user-1" },
      features: { playlistLibrary: true },
    });
    mocks.getDraftByIdForOwner.mockResolvedValue(existing);
    mocks.isOwnedArtworkUrl.mockReturnValue(true);
    mocks.consumeRateLimit.mockResolvedValue(true);
    mocks.updateDraftForOwner.mockResolvedValue(true);
    mocks.resolvePlaylist.mockResolvedValue({
      provider: "spotify",
      providerPlaylistId: "37i9dQZF1DX4JAvHpjipBk",
      canonicalUrl: spotifyUrl,
      embedUrl: "https://open.spotify.com/embed/playlist/37i9dQZF1DX4JAvHpjipBk",
      metadata: {},
    });
  });

  it("returns keyed validation and cleans up a newly uploaded image", async () => {
    const response = await update({ title: "x", artworkUrl: incomingArtworkUrl });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ field: "title" });
    expect(mocks.discardArtwork).toHaveBeenCalledWith(incomingArtworkUrl);
    expect(mocks.updateDraftForOwner).not.toHaveBeenCalled();
  });

  it("returns a client error for malformed JSON", async () => {
    const response = await PATCH(malformedRequest(), { params: Promise.resolve({ draftId: "draft-1" }) });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid playlist request." });
    expect(mocks.getDraftByIdForOwner).not.toHaveBeenCalled();
  });

  it("classifies initial lookup failures as retryable server errors", async () => {
    mocks.getDraftByIdForOwner.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await update();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Could not load this playlist. Try again." });
    expect(mocks.reportOperationalError).toHaveBeenCalledWith(
      "playlist-draft.lookup",
      expect.any(Error),
      { userId: "user-1", draftId: "draft-1" },
    );
  });

  it("updates a validated playlist and preserves the success response", async () => {
    const response = await update();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      draft: { id: "draft-1", title: "Updated title" },
    });
    expect(mocks.updateDraftForOwner).toHaveBeenCalledWith(expect.objectContaining({
      id: "draft-1",
      description: "An updated description.",
    }));
  });

  it("returns a retryable server error without exposing persistence details", async () => {
    mocks.updateDraftForOwner.mockRejectedValueOnce(new Error("blob or database detail"));

    const response = await update();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Could not save this playlist. Try again." });
    expect(mocks.reportOperationalError).toHaveBeenCalledWith(
      "playlist-draft.update",
      expect.any(Error),
      { userId: "user-1", draftId: "draft-1" },
    );
  });

  it("classifies rate-limit storage failures as retryable server errors", async () => {
    mocks.consumeRateLimit.mockRejectedValueOnce(new Error("rate-limit database unavailable"));

    const response = await update({ artworkUrl: incomingArtworkUrl });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Could not save this playlist. Try again." });
    expect(mocks.discardArtwork).toHaveBeenCalledWith(incomingArtworkUrl);
    expect(mocks.reportOperationalError).toHaveBeenCalledWith(
      "playlist-draft.rate-limit",
      expect.any(Error),
      { userId: "user-1", draftId: "draft-1", operation: "update" },
    );
  });
});
