import { NextResponse } from "next/server";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { discardArtwork, isOwnedArtworkUrl } from "@/lib/blob-artwork";
import { integrations } from "@/lib/env";
import { firstPlaylistDraftError, validatePlaylistDraft } from "@/lib/playlist-draft-validation";
import { PlaylistValidationError, resolvePlaylist } from "@/lib/playlist-providers";
import { reportOperationalError } from "@/lib/observability";
import { createId, insertDraft } from "@/lib/repository";
import { consumeRateLimit } from "@/lib/rate-limit";
import type { PlaylistDraft, PlaylistMetadata } from "@/types/domain";

const schema = z.object({
  url: z.unknown().optional(),
  spotifyUrl: z.unknown().optional(),
  appleMusicUrl: z.unknown().optional(),
  title: z.unknown().optional(),
  descriptionHtml: z.unknown().optional(),
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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid playlist request." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid playlist" }, { status: 400 });
  if (parsed.data.artworkUrl && !isOwnedArtworkUrl(parsed.data.artworkUrl, "playlist", profile.id)) {
    return NextResponse.json({ error: "This playlist artwork does not belong to your account." }, { status: 403 });
  }
  const validation = validatePlaylistDraft(parsed.data);
  if (!validation.success) {
    await discardArtwork(parsed.data.artworkUrl);
    const issue = firstPlaylistDraftError(validation.errors);
    return NextResponse.json({ error: issue?.error ?? "Invalid playlist", field: issue?.field }, { status: 400 });
  }
  const { description, descriptionHtml } = validation.data;
  let rateLimitAllowed: boolean;
  try {
    rateLimitAllowed = await consumeRateLimit(`draft:${profile.id}`, 12, 60);
  } catch (error) {
    await discardArtwork(parsed.data.artworkUrl);
    reportOperationalError("playlist-draft.rate-limit", error, { userId: profile.id, operation: "create" });
    return NextResponse.json({ error: "Could not save this playlist. Try again." }, { status: 503 });
  }
  if (!rateLimitAllowed) {
    await discardArtwork(parsed.data.artworkUrl);
    return NextResponse.json({ error: "Too many drafts. Try again in a minute." }, { status: 429 });
  }
  try {
    const requestedVersions = [
      validation.data.spotifyUrl ? { expectedProvider: "spotify" as const, field: "spotifyUrl" as const, url: validation.data.spotifyUrl } : undefined,
      validation.data.appleMusicUrl ? { expectedProvider: "apple-music" as const, field: "appleMusicUrl" as const, url: validation.data.appleMusicUrl } : undefined,
      validation.data.legacyUrl ? { expectedProvider: undefined, field: "spotifyUrl" as const, url: validation.data.legacyUrl } : undefined,
    ].filter((item): item is NonNullable<typeof item> => Boolean(item));
    const resolvedVersions = await Promise.all(requestedVersions.map(async ({ expectedProvider, url }) => {
      const resolved = await resolvePlaylist(url);
      if (expectedProvider && resolved.provider !== expectedProvider) {
        const providerName = expectedProvider === "spotify" ? "Spotify" : "Apple Music";
        const article = expectedProvider === "spotify" ? "a" : "an";
        throw new PlaylistValidationError(`Use ${article} ${providerName} playlist URL in the ${providerName} field.`);
      }
      return resolved;
    }));
    const versions = resolvedVersions.filter((version, index) =>
      resolvedVersions.findIndex((candidate) => candidate.provider === version.provider) === index
    );
    const primary = versions.find((version) => version.provider === "spotify") ?? versions[0];
    if (!primary) throw new PlaylistValidationError("Add a Spotify or Apple Music playlist URL");
    const metadataSource = versions.find((version) => version.metadata.artworkUrl || version.metadata.providerTitle);
    const metadata: PlaylistMetadata = metadataSource?.metadata ?? {};
    const timestamp = new Date().toISOString();
    const draft: PlaylistDraft = {
      id: createId("draft"), ownerId: profile.id, title: validation.data.title, description, descriptionHtml,
      provider: primary.provider, providerPlaylistId: primary.providerPlaylistId, canonicalUrl: primary.canonicalUrl,
      embedUrl: primary.embedUrl,
      versions: versions.map(({ provider, providerPlaylistId, canonicalUrl, embedUrl }) => ({
        provider, providerPlaylistId, canonicalUrl, embedUrl,
      })),
      metadata: { ...metadata, artworkUrl: parsed.data.artworkUrl ?? metadata.artworkUrl },
      createdAt: timestamp, updatedAt: timestamp,
    };
    await insertDraft(draft);
    const warnings = resolvedVersions.flatMap((version) => version.warning ? [version.warning] : []);
    return NextResponse.json({ draft, warning: warnings[0], demo: !integrations.mongo }, { status: 201 });
  } catch (error) {
    await discardArtwork(parsed.data.artworkUrl);
    if (error instanceof PlaylistValidationError) {
      const field = requestedFieldFromProviderError(error.message);
      return NextResponse.json({ error: error.message, field }, { status: 400 });
    }
    reportOperationalError("playlist-draft.create", error, { userId: profile.id });
    return NextResponse.json({ error: "Could not save this playlist. Try again." }, { status: 503 });
  }
}

function requestedFieldFromProviderError(message: string) {
  if (message.includes("Apple Music")) return "appleMusicUrl" as const;
  if (message.includes("Spotify") || message.includes("playlist URL")) return "spotifyUrl" as const;
  return undefined;
}
