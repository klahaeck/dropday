import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Apple, ArrowLeft, CalendarClock, ExternalLink, Music2, Pencil } from "lucide-react";
import { DropAttachmentForm } from "@/components/drop-attachment-form";
import { Pill } from "@/components/pill";
import { PlaylistDescription } from "@/components/playlist-description";
import { requireViewer } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { getPlaylistVersions } from "@/lib/playlist-providers";
import { getClubDrops, getDraftByIdForOwner, listClubsForUser } from "@/lib/repository";

function formatLibraryDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function providerName(provider: "spotify" | "apple-music") {
  return provider === "spotify" ? "Spotify" : "Apple Music";
}

export default async function PlaylistDetailPage({ params }: { params: Promise<{ playlistId: string }> }) {
  const { playlistId } = await params;
  const { profile, features } = await requireViewer();
  if (!features.playlistLibrary) redirect("/pricing");
  const [playlist, clubs] = await Promise.all([
    getDraftByIdForOwner(playlistId, profile.id),
    listClubsForUser(profile.id),
  ]);
  if (!playlist) notFound();

  const versions = getPlaylistVersions(playlist);
  const dropsByClub = await Promise.all(clubs.map(async (club) => ({
    club,
    drops: await getClubDrops(club.id),
  })));
  const attachableDrops = dropsByClub.flatMap(({ club, drops }) => drops
    .filter((drop) =>
      drop.id === club.activeDropId
      && drop.assignedUserId === profile.id
      && (drop.status === "scheduled" || drop.status === "overdue")
      && drop.scheduleVersion === club.schedule.version
      && !club.schedule.paused
      && club.custody.status !== "archived"
    )
    .map((drop) => ({
      id: drop.id,
      clubName: club.name,
      scheduledFor: drop.scheduledFor,
      scheduledLabel: drop.status === "overdue"
        ? `Overdue since ${formatDateTime(drop.scheduledFor, club.schedule.timezone)}`
        : formatDateTime(drop.scheduledFor, club.schedule.timezone),
      currentPlaylistTitle: drop.playlist?.title,
      currentPlaylistDraftId: drop.playlist?.sourceDraftId,
    })))
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  return <>
    <div className="page-actions playlist-detail-actions">
      <Link href="/app/library" className="button button-ghost button-small"><ArrowLeft size={14} /> Back to library</Link>
      <Link href={`/app/library/${playlist.id}/edit`} className="button button-ghost button-small"><Pencil size={14} /> Edit playlist</Link>
      {versions.map((version) => <a key={version.provider} href={version.canonicalUrl} target="_blank" rel="noreferrer" className="button button-dark button-small">Open in {providerName(version.provider)} <ExternalLink size={14} /></a>)}
    </div>

    <article className="playlist-detail-hero">
      <div className={`playlist-cover playlist-detail-cover playlist-cover-${playlist.provider}`}>
        {playlist.metadata.artworkUrl ? <Image src={playlist.metadata.artworkUrl} alt="" fill priority sizes="(max-width: 800px) calc(100vw - 36px), 420px" unoptimized /> : <><span>{playlist.title.slice(0, 2).toUpperCase()}</span><i /></>}
      </div>
      <div className="playlist-detail-copy">
        <div className="eyebrow-row">
          <div className="playlist-provider-pills">
            {versions.map((version) => <Pill key={version.provider} tone={version.provider === "spotify" ? "green" : "neutral"}>
              {version.provider === "spotify" ? <Music2 size={12} /> : <Apple size={12} />}
              {providerName(version.provider)}
            </Pill>)}
          </div>
          <span className="tiny-label">Prepared playlist</span>
        </div>
        <h1>{playlist.title}</h1>
        <dl className="playlist-detail-meta">
          <div><dt>Updated</dt><dd>{formatLibraryDate(playlist.updatedAt)}</dd></div>
          <div><dt>Added</dt><dd>{formatLibraryDate(playlist.createdAt)}</dd></div>
          <div><dt>Versions</dt><dd>{versions.length} {versions.length === 1 ? "platform" : "platforms"}</dd></div>
          {playlist.metadata.providerTitle && <div><dt>Source title</dt><dd>{playlist.metadata.providerTitle}</dd></div>}
        </dl>
        <PlaylistDescription html={playlist.descriptionHtml} fallback={playlist.description} className="playlist-detail-description" />
      </div>
    </article>

    <section className="panel drop-attachment-section" aria-labelledby="attach-heading">
      <div className="drop-attachment-heading">
        <span className="drop-attachment-icon"><CalendarClock size={22} /></span>
        <div><span className="section-kicker">Your turn</span><h2 id="attach-heading">Attach to an assigned drop</h2></div>
      </div>
      {attachableDrops.length ? <>
        <p>Choose one of your upcoming club slots. This playlist will stay private until its assigned date and time.</p>
        <DropAttachmentForm drops={attachableDrops} playlists={[]} playlistId={playlist.id} />
      </> : <p>You do not have an upcoming active drop to fill. When your turn reaches the top of a club’s rotation, it will appear here.</p>}
    </section>

    <section className="playlist-listen-section" aria-labelledby="listen-heading">
      <div className="section-title-row"><div><span className="section-kicker">Press play</span><h2 id="listen-heading">Listen to the playlist</h2></div><span className="tiny-label">{versions.length} saved {versions.length === 1 ? "version" : "versions"}</span></div>
      <div className={`playlist-version-grid${versions.length === 1 ? " playlist-version-grid-single" : ""}`}>
        {versions.map((version) => <article className="playlist-version-card" key={version.provider}>
          <div className="playlist-version-header">
            <div className="playlist-version-title">{version.provider === "spotify" ? <Music2 size={18} /> : <Apple size={18} />}<div><span>Listen on</span><h3>{providerName(version.provider)}</h3></div></div>
            <a href={version.canonicalUrl} target="_blank" rel="noreferrer" className="button button-ghost button-small" aria-label={`Open ${playlist.title} in ${providerName(version.provider)}`}><ExternalLink size={14} /> Open</a>
          </div>
          <div className={`embed-shell playlist-version-embed playlist-version-embed-${version.provider}`}><iframe title={`${playlist.title} on ${providerName(version.provider)}`} src={version.embedUrl} allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write" loading="lazy" /></div>
        </article>)}
      </div>
    </section>
  </>;
}
