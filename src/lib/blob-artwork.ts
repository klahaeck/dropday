import "server-only";
import { del } from "@vercel/blob";

export type ArtworkKind = "playlist" | "club" | "theme";

export function isOwnedArtworkUrl(value: string, kind: ArtworkKind, ownerId: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname.endsWith(".public.blob.vercel-storage.com")
      && url.pathname.startsWith(`/artwork/${kind}/${encodeURIComponent(ownerId)}/`);
  } catch {
    return false;
  }
}

export async function discardArtwork(url?: string | null): Promise<void> {
  if (!url) return;
  try {
    await del(url);
  } catch {}
}
