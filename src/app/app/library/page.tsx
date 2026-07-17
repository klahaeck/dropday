import Link from "next/link";
import { redirect } from "next/navigation";
import { Library, Plus } from "lucide-react";
import { PlaylistCard } from "@/components/playlist-card";
import { requireViewer } from "@/lib/auth";
import { listDrafts } from "@/lib/repository";

export default async function LibraryPage() {
  const { profile, features } = await requireViewer();
  if (!features.playlistLibrary) redirect("/pricing");
  const drafts = await listDrafts(profile.id);
  return <><header className="page-header"><div><span className="section-kicker">Ready before your turn</span><h1>Playlist library</h1><p>Keep reusable drop drafts here, then attach a snapshot when your name reaches the top of a club queue.</p></div><Link href="/app/library/new" className="button button-dark"><Plus size={16} /> Prepare a playlist</Link></header>{drafts.length ? <div className="playlist-grid">{drafts.map((draft) => <PlaylistCard playlist={draft} key={draft.id} kicker={`Updated ${new Date(draft.updatedAt).toLocaleDateString()}`} />)}</div> : <div className="empty-state"><Library size={32} /><h2>Your crate is empty.</h2><p>Prepare a Spotify or Apple Music playlist now and future you will look extremely organized.</p><Link href="/app/library/new" className="button button-dark"><Plus size={16} /> Prepare a playlist</Link></div>}</>;
}
