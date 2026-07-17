import { NextResponse } from "next/server";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { discardArtwork, isOwnedArtworkUrl } from "@/lib/blob-artwork";
import { integrations } from "@/lib/env";
import {
  PLAYLIST_DESCRIPTION_HTML_MAX_LENGTH,
  PLAYLIST_DESCRIPTION_MAX_LENGTH,
  playlistDescriptionToText,
  sanitizePlaylistDescriptionHtml,
} from "@/lib/playlist-description";
import { resolvePlaylist } from "@/lib/playlist-providers";
import { createId, insertDraft } from "@/lib/repository";
import { consumeRateLimit } from "@/lib/rate-limit";
import type { PlaylistDraft, PlaylistMetadata } from "@/types/domain";

const schema = z.object({
  url: z.string().url().max(500),
  title: z.string().trim().min(2).max(100),
  descriptionHtml: z.string().max(PLAYLIST_DESCRIPTION_HTML_MAX_LENGTH),
  artworkUrl: z.string().url().max(1_000).refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname.endsWith(".public.blob.vercel-storage.com")
      && url.pathname.startsWith("/artwork/playlist/");
  }, "Upload artwork through Vercel Blob").optional(),
});

export async function POST(request: Request) {
  const { profile, features } = await requireViewer();
  if (!features.playlistLibrary) {
    return NextResponse.json({ error: "Your current plan does not include the playlist library." }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid playlist" }, { status: 400 });
  if (parsed.data.artworkUrl && !isOwnedArtworkUrl(parsed.data.artworkUrl, "playlist", profile.id)) {
    return NextResponse.json({ error: "This playlist artwork does not belong to your account." }, { status: 403 });
  }
  const descriptionHtml = sanitizePlaylistDescriptionHtml(parsed.data.descriptionHtml);
  const description = playlistDescriptionToText(descriptionHtml);
  if (description.length < 2) {
    await discardArtwork(parsed.data.artworkUrl);
    return NextResponse.json({ error: "Add a description before saving this playlist." }, { status: 400 });
  }
  if (description.length > PLAYLIST_DESCRIPTION_MAX_LENGTH) {
    await discardArtwork(parsed.data.artworkUrl);
    return NextResponse.json({ error: `Keep the description to ${PLAYLIST_DESCRIPTION_MAX_LENGTH.toLocaleString()} characters or fewer.` }, { status: 400 });
  }
  if (!(await consumeRateLimit(`draft:${profile.id}`, 12, 60))) {
    await discardArtwork(parsed.data.artworkUrl);
    return NextResponse.json({ error: "Too many drafts. Try again in a minute." }, { status: 429 });
  }
  try {
    const resolved = await resolvePlaylist(parsed.data.url);
    const metadata: PlaylistMetadata = resolved.metadata;
    const timestamp = new Date().toISOString();
    const draft: PlaylistDraft = {
      id: createId("draft"), ownerId: profile.id, title: parsed.data.title, description, descriptionHtml,
      provider: resolved.provider, providerPlaylistId: resolved.providerPlaylistId, canonicalUrl: resolved.canonicalUrl,
      embedUrl: resolved.embedUrl,
      metadata: { ...metadata, artworkUrl: parsed.data.artworkUrl ?? metadata.artworkUrl },
      createdAt: timestamp, updatedAt: timestamp,
    };
    await insertDraft(draft);
    return NextResponse.json({ draft, warning: resolved.warning, demo: !integrations.mongo }, { status: 201 });
  } catch (error) {
    await discardArtwork(parsed.data.artworkUrl);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid playlist URL" }, { status: 400 });
  }
}
