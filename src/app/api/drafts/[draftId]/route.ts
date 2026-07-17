import { NextResponse } from "next/server";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { discardArtwork, isOwnedArtworkUrl } from "@/lib/blob-artwork";
import {
  PLAYLIST_DESCRIPTION_HTML_MAX_LENGTH,
  PLAYLIST_DESCRIPTION_MAX_LENGTH,
  playlistDescriptionToText,
  sanitizePlaylistDescriptionHtml,
} from "@/lib/playlist-description";
import { resolvePlaylist } from "@/lib/playlist-providers";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getDraftByIdForOwner, updateDraftForOwner } from "@/lib/repository";
import type { PlaylistDraft, PlaylistMetadata } from "@/types/domain";

const schema = z.object({
  spotifyUrl: z.string().trim().max(500).optional(),
  appleMusicUrl: z.string().trim().max(500).optional(),
  title: z.string().trim().min(2).max(100),
  descriptionHtml: z.string().max(PLAYLIST_DESCRIPTION_HTML_MAX_LENGTH),
  artworkUrl: z.string().url().max(1_000).refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname.endsWith(".public.blob.vercel-storage.com")
      && url.pathname.startsWith("/artwork/playlist/");
  }, "Upload artwork through Vercel Blob").optional(),
  removeArtwork: z.boolean().optional().default(false),
}).refine((value) => value.spotifyUrl || value.appleMusicUrl, {
  message: "Add a Spotify or Apple Music playlist URL",
  path: ["spotifyUrl"],
});

export async function PATCH(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params;
  const { profile, features } = await requireViewer();
  if (!features.playlistLibrary) {
    return NextResponse.json({ error: "Your current plan does not include the playlist library." }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid playlist" }, { status: 400 });
  const existing = await getDraftByIdForOwner(draftId, profile.id);
  if (!existing) return NextResponse.json({ error: "Playlist not found." }, { status: 404 });
  if (parsed.data.artworkUrl && !isOwnedArtworkUrl(parsed.data.artworkUrl, "playlist", profile.id)) {
    return NextResponse.json({ error: "This playlist artwork does not belong to your account." }, { status: 403 });
  }

  const discardIncomingArtwork = async () => {
    if (parsed.data.artworkUrl && parsed.data.artworkUrl !== existing.metadata.artworkUrl) {
      await discardArtwork(parsed.data.artworkUrl);
    }
  };
  const descriptionHtml = sanitizePlaylistDescriptionHtml(parsed.data.descriptionHtml);
  const description = playlistDescriptionToText(descriptionHtml);
  if (description.length < 2) {
    await discardIncomingArtwork();
    return NextResponse.json({ error: "Add a description before saving this playlist." }, { status: 400 });
  }
  if (description.length > PLAYLIST_DESCRIPTION_MAX_LENGTH) {
    await discardIncomingArtwork();
    return NextResponse.json({ error: `Keep the description to ${PLAYLIST_DESCRIPTION_MAX_LENGTH.toLocaleString()} characters or fewer.` }, { status: 400 });
  }
  if (!(await consumeRateLimit(`draft-update:${profile.id}`, 20, 60))) {
    await discardIncomingArtwork();
    return NextResponse.json({ error: "Too many playlist updates. Try again in a minute." }, { status: 429 });
  }

  try {
    const requestedVersions = [
      parsed.data.spotifyUrl ? { expectedProvider: "spotify" as const, url: parsed.data.spotifyUrl } : undefined,
      parsed.data.appleMusicUrl ? { expectedProvider: "apple-music" as const, url: parsed.data.appleMusicUrl } : undefined,
    ].filter((item): item is NonNullable<typeof item> => Boolean(item));
    const resolvedVersions = await Promise.all(requestedVersions.map(async ({ expectedProvider, url }) => {
      const resolved = await resolvePlaylist(url);
      if (resolved.provider !== expectedProvider) {
        const providerName = expectedProvider === "spotify" ? "Spotify" : "Apple Music";
        const article = expectedProvider === "spotify" ? "a" : "an";
        throw new Error(`Use ${article} ${providerName} playlist URL in the ${providerName} field.`);
      }
      return resolved;
    }));
    const versions = resolvedVersions.filter((version, index) =>
      resolvedVersions.findIndex((candidate) => candidate.provider === version.provider) === index
    );
    const primary = versions.find((version) => version.provider === "spotify") ?? versions[0];
    if (!primary) throw new Error("Add a Spotify or Apple Music playlist URL");
    const metadataSource = versions.find((version) => version.metadata.artworkUrl || version.metadata.providerTitle);
    const providerMetadata: PlaylistMetadata = metadataSource?.metadata ?? {};
    const artworkUrl = parsed.data.removeArtwork
      ? undefined
      : parsed.data.artworkUrl ?? existing.metadata.artworkUrl ?? providerMetadata.artworkUrl;
    const draft: PlaylistDraft = {
      ...existing,
      title: parsed.data.title,
      description,
      descriptionHtml,
      provider: primary.provider,
      providerPlaylistId: primary.providerPlaylistId,
      canonicalUrl: primary.canonicalUrl,
      embedUrl: primary.embedUrl,
      versions: versions.map(({ provider, providerPlaylistId, canonicalUrl, embedUrl }) => ({
        provider, providerPlaylistId, canonicalUrl, embedUrl,
      })),
      metadata: { ...existing.metadata, ...providerMetadata, artworkUrl },
      updatedAt: new Date().toISOString(),
    };
    if (!(await updateDraftForOwner(draft))) {
      await discardIncomingArtwork();
      return NextResponse.json({ error: "Playlist not found." }, { status: 404 });
    }
    if (existing.metadata.artworkUrl
      && existing.metadata.artworkUrl !== artworkUrl
      && isOwnedArtworkUrl(existing.metadata.artworkUrl, "playlist", profile.id)) {
      await discardArtwork(existing.metadata.artworkUrl);
    }
    const warnings = resolvedVersions.flatMap((version) => version.warning ? [version.warning] : []);
    return NextResponse.json({ draft, warning: warnings[0] });
  } catch (error) {
    await discardIncomingArtwork();
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid playlist URL" }, { status: 400 });
  }
}
