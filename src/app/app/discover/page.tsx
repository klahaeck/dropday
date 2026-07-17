import { Search, Sparkles } from "lucide-react";
import { ClubCard } from "@/components/club-card";
import { listPublicClubs } from "@/lib/repository";

export default async function DiscoverPage() {
  const clubs = await listPublicClubs();
  return <><header className="page-header"><div><span className="section-kicker">Find your people</span><h1>Discover clubs</h1><p>Public clubs share their premise, cadence, and current theme. The playlists stay inside until you join.</p></div></header><div className="form-shell" style={{ maxWidth: "none", marginBottom: 26, padding: 16 }}><div className="field"><label className="sr-only" htmlFor="club-search">Search public clubs</label><div style={{ position: "relative" }}><Search size={17} style={{ position: "absolute", left: 14, top: 14 }} /><input id="club-search" placeholder="Search by name, theme, or description" style={{ paddingLeft: 42 }} /></div></div></div>{clubs.length ? <div className="club-grid">{clubs.map((club) => <ClubCard club={club} key={club.id} />)}</div> : <div className="empty-state"><Sparkles size={32} /><h2>No public clubs yet.</h2><p>The first one will have the whole record bin to itself.</p></div>}</>;
}
