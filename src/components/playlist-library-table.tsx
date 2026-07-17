import Image from "next/image";
import Link from "next/link";
import { Apple, ArrowUpRight, Music2 } from "lucide-react";
import { Pill } from "@/components/pill";
import { truncateDescription } from "@/lib/description-preview";
import { getPlaylistVersions } from "@/lib/playlist-providers";
import type { PlaylistDraft } from "@/types/domain";

export function PlaylistLibraryTable({
  drafts,
  attachedClubsByDraftId,
}: {
  drafts: PlaylistDraft[];
  attachedClubsByDraftId: ReadonlyMap<string, string[]>;
}) {
  return (
    <div className="playlist-library-table-scroll">
      <table className="playlist-library-table">
        <thead>
          <tr>
            <th scope="col">Playlist</th>
            <th scope="col">Description</th>
            <th scope="col">Platforms</th>
            <th scope="col">Attached to</th>
            <th scope="col">Updated</th>
            <th scope="col"><span className="sr-only">Open playlist</span></th>
          </tr>
        </thead>
        <tbody>
          {drafts.map((draft) => {
            const versions = getPlaylistVersions(draft);
            const attachedClubNames = attachedClubsByDraftId.get(draft.id) ?? [];
            const href = `/app/library/${draft.id}`;

            return (
              <tr key={draft.id}>
                <td>
                  <Link href={href} className="playlist-library-table-title">
                    <div className={`playlist-library-table-art playlist-library-table-art-${draft.provider}`}>
                      {draft.metadata.artworkUrl
                        ? <Image src={draft.metadata.artworkUrl} alt="" fill sizes="52px" unoptimized />
                        : <span>{draft.title.slice(0, 2).toUpperCase()}</span>}
                    </div>
                    <div><strong>{draft.title}</strong><small>Prepared drop</small></div>
                  </Link>
                </td>
                <td><p className="playlist-library-table-description">{truncateDescription(draft.description)}</p></td>
                <td>
                  <div className="playlist-library-table-providers">
                    {versions.map((version) => (
                      <Pill key={version.provider} tone={version.provider === "spotify" ? "green" : "neutral"}>
                        {version.provider === "spotify" ? <Music2 size={12} /> : <Apple size={12} />}
                        {version.provider === "spotify" ? "Spotify" : "Apple Music"}
                      </Pill>
                    ))}
                  </div>
                </td>
                <td className={attachedClubNames.length ? "" : "playlist-library-table-muted"}>
                  {attachedClubNames.length ? attachedClubNames.join(", ") : "Not attached"}
                </td>
                <td><time dateTime={draft.updatedAt}>{new Date(draft.updatedAt).toLocaleDateString()}</time></td>
                <td><Link href={href} className="playlist-library-table-open" aria-label={`Open ${draft.title}`}><ArrowUpRight size={17} /></Link></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
