import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DraftComposer } from "@/components/interactive-forms";
import { requireViewer } from "@/lib/auth";
import { getDraftByIdForOwner } from "@/lib/repository";

export default async function EditPlaylistPage({ params }: { params: Promise<{ playlistId: string }> }) {
  const { playlistId } = await params;
  const { profile, features } = await requireViewer();
  if (!features.playlistLibrary) redirect("/pricing");
  const playlist = await getDraftByIdForOwner(playlistId, profile.id);
  if (!playlist) notFound();

  return <>
    <header className="page-header">
      <div><span className="section-kicker">Keep it current</span><h1>Edit playlist</h1><p>Update the story, artwork, or listening links saved in your library.</p></div>
      <Link href={`/app/library/${playlist.id}`} className="button button-ghost"><ArrowLeft size={16} /> Back to playlist</Link>
    </header>
    <DraftComposer ownerId={profile.id} playlist={playlist} />
  </>;
}
