import Link from "next/link";
import Image from "next/image";
import { Apple, ArrowUpRight, CalendarCheck, Music2, UserRound } from "lucide-react";
import { Pill } from "@/components/pill";
import { PlaylistDescription } from "@/components/playlist-description";
import { truncateDescription } from "@/lib/description-preview";
import { getPlaylistVersions } from "@/lib/playlist-providers";
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
  expandableDescription = true,
  attachedClubNames = [],
}: {
  playlist: PlaylistLike;
  href?: string;
  kicker?: string;
  droppedBy?: string;
  expandableDescription?: boolean;
  attachedClubNames?: string[];
}) {
  const versions = getPlaylistVersions(playlist);
  return (
    <article className="playlist-card">
      <div className={`playlist-cover playlist-cover-${playlist.provider}`}>
        {playlist.metadata.artworkUrl ? <Image src={playlist.metadata.artworkUrl} alt="" fill sizes="(max-width: 800px) 100vw, 33vw" unoptimized /> : (
          <><span>{playlist.title.slice(0, 2).toUpperCase()}</span><i /></>
        )}
      </div>
      <div className="playlist-card-body">
        <div className="eyebrow-row">
          <div className="playlist-provider-pills">
            {versions.map((version) => <Pill key={version.provider} tone={version.provider === "spotify" ? "green" : "neutral"}>
              {version.provider === "spotify" ? <Music2 size={12} /> : <Apple size={12} />}
              {version.provider === "spotify" ? "Spotify" : "Apple Music"}
            </Pill>)}
          </div>
          {kicker && <span className="tiny-label">{kicker}</span>}
        </div>
        <h3>{playlist.title}</h3>
        {expandableDescription
          ? <PlaylistDescription html={playlist.descriptionHtml} fallback={playlist.description} className="playlist-description" />
          : <div className="playlist-description"><p>{truncateDescription(playlist.description)}</p></div>}
        {attachedClubNames.length > 0 && <div className="playlist-card-attachment"><CalendarCheck size={13} /> <span>Attached to <strong>{attachedClubNames.join(", ")}</strong></span></div>}
        {!isDraft(playlist) && droppedBy && <div className="playlist-card-author"><UserRound size={13} /> Dropped by <strong>{droppedBy}</strong></div>}
        <div className="playlist-card-foot">
          <span>{isDraft(playlist) ? "Prepared drop" : playlist.theme?.name ?? "Freeform"}</span>
          {href && <ArrowUpRight size={17} />}
        </div>
      </div>
      {href && <Link href={href} className="playlist-card-hit-area" aria-label={`Open ${playlist.title}`} />}
    </article>
  );
}
