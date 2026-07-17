import Link from "next/link";
import Image from "next/image";
import { Apple, ArrowUpRight, Music2, UserRound } from "lucide-react";
import { Pill } from "@/components/pill";
import { PlaylistDescription } from "@/components/playlist-description";
import type { DropSlot, PlaylistDraft } from "@/types/domain";

type PlaylistLike = PlaylistDraft | NonNullable<DropSlot["playlist"]>;

function isDraft(item: PlaylistLike): item is PlaylistDraft {
  return "ownerId" in item;
}

export function PlaylistCard({
  playlist,
  href,
  kicker,
  droppedBy,
}: {
  playlist: PlaylistLike;
  href?: string;
  kicker?: string;
  droppedBy?: string;
}) {
  return (
    <article className="playlist-card">
      <div className={`playlist-cover playlist-cover-${playlist.provider}`}>
        {playlist.metadata.artworkUrl ? <Image src={playlist.metadata.artworkUrl} alt="" fill sizes="(max-width: 800px) 100vw, 33vw" unoptimized /> : (
          <><span>{playlist.title.slice(0, 2).toUpperCase()}</span><i /></>
        )}
      </div>
      <div className="playlist-card-body">
        <div className="eyebrow-row">
          <Pill tone={playlist.provider === "spotify" ? "green" : "neutral"}>
            {playlist.provider === "spotify" ? <Music2 size={12} /> : <Apple size={12} />}
            {playlist.provider === "spotify" ? "Spotify" : "Apple Music"}
          </Pill>
          {kicker && <span className="tiny-label">{kicker}</span>}
        </div>
        <h3>{playlist.title}</h3>
        <PlaylistDescription html={playlist.descriptionHtml} fallback={playlist.description} className="playlist-description" />
        {!isDraft(playlist) && droppedBy && <div className="playlist-card-author"><UserRound size={13} /> Dropped by <strong>{droppedBy}</strong></div>}
        <div className="playlist-card-foot">
          <span>{isDraft(playlist) ? "Prepared drop" : playlist.theme.name}</span>
          {href && <ArrowUpRight size={17} />}
        </div>
      </div>
      {href && <Link href={href} className="playlist-card-hit-area" aria-label={`Open ${playlist.title}`} />}
    </article>
  );
}
