import { NextResponse } from "next/server";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { discardArtwork, isOwnedArtworkUrl, type ArtworkKind } from "@/lib/blob-artwork";

const schema = z.object({ urls: z.array(z.string().url().max(1_000)).max(3) });
const kinds: ArtworkKind[] = ["playlist", "club", "theme"];

export async function POST(request: Request) {
  const { profile } = await requireViewer();
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid artwork URLs." }, { status: 400 });
  if (parsed.data.urls.some((url) => !kinds.some((kind) => isOwnedArtworkUrl(url, kind, profile.id)))) {
    return NextResponse.json({ error: "Artwork does not belong to your account." }, { status: 403 });
  }
  await Promise.all(parsed.data.urls.map(discardArtwork));
  return NextResponse.json({ discarded: parsed.data.urls.length });
}
