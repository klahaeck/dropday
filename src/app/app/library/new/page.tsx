import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DraftComposer } from "@/components/interactive-forms";
import { requireViewer } from "@/lib/auth";

export default async function NewPlaylistPage() {
  const { profile, features } = await requireViewer();
  if (!features.playlistLibrary) redirect("/pricing");
  return <><header className="page-header"><div><span className="section-kicker">Ready before your turn</span><h1>Prepare a playlist</h1><p>Add a Spotify or Apple Music playlist to your library so it is ready when your next drop arrives.</p></div><Link href="/app/library" className="button button-ghost"><ArrowLeft size={16} /> Back to library</Link></header><DraftComposer ownerId={profile.id} /></>;
}
