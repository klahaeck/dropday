import Link from "next/link";
import { redirect } from "next/navigation";
import { Grid2X2, Library, List, Plus } from "lucide-react";
import { PlaylistLibraryTable } from "@/components/playlist-library-table";
import { PlaylistCard } from "@/components/playlist-card";
import { requireViewer } from "@/lib/auth";
import { getDropById, listClubsForUser, listDrafts } from "@/lib/repository";

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ view?: string | string[] }> }) {
  const { profile, features } = await requireViewer();
  if (!features.playlistLibrary) redirect("/pricing");
  const { view } = await searchParams;
  const activeView = view === "table" ? "table" : "grid";
  const [drafts, clubs] = await Promise.all([listDrafts(profile.id), listClubsForUser(profile.id)]);
  const activeDrops = await Promise.all(clubs.map(async (club) => ({
    clubName: club.name,
    drop: club.activeDropId ? await getDropById(club.activeDropId) : null,
  })));
  const attachedClubsByDraftId = new Map<string, string[]>();
  for (const { clubName, drop } of activeDrops) {
    const draftId = drop?.playlist?.sourceDraftId;
    if (!draftId || (drop.status !== "scheduled" && drop.status !== "overdue")) continue;
    const clubNames = attachedClubsByDraftId.get(draftId) ?? [];
    if (!clubNames.includes(clubName)) clubNames.push(clubName);
    attachedClubsByDraftId.set(draftId, clubNames);
  }
  return <>
    <header className="page-header">
      <div><span className="section-kicker">Ready before your turn</span><h1>Playlist library</h1><p>Keep reusable drop drafts here, with links for each listening platform your club uses.</p></div>
      <Link href="/app/library/new" className="button button-dark"><Plus size={16} /> Prepare a playlist</Link>
    </header>
    {drafts.length ? <>
      <div className="playlist-library-toolbar">
        <span>{drafts.length} prepared {drafts.length === 1 ? "playlist" : "playlists"}</span>
        <nav className="library-view-toggle" aria-label="Library view">
          <Link href="/app/library" className={activeView === "grid" ? "library-view-toggle-active" : ""} aria-current={activeView === "grid" ? "page" : undefined}><Grid2X2 size={15} /> Grid</Link>
          <Link href="/app/library?view=table" className={activeView === "table" ? "library-view-toggle-active" : ""} aria-current={activeView === "table" ? "page" : undefined}><List size={16} /> Table</Link>
        </nav>
      </div>
      {activeView === "table"
        ? <PlaylistLibraryTable drafts={drafts} attachedClubsByDraftId={attachedClubsByDraftId} />
        : <div className="playlist-grid">{drafts.map((draft) => <PlaylistCard playlist={draft} href={`/app/library/${draft.id}`} key={draft.id} kicker={`Updated ${new Date(draft.updatedAt).toLocaleDateString()}`} expandableDescription={false} attachedClubNames={attachedClubsByDraftId.get(draft.id)} />)}</div>}
    </> : <div className="empty-state"><Library size={32} /><h2>Your crate is empty.</h2><p>Prepare a playlist with Spotify, Apple Music, or both versions now and future you will look extremely organized.</p><Link href="/app/library/new" className="button button-dark"><Plus size={16} /> Prepare a playlist</Link></div>}
  </>;
}
