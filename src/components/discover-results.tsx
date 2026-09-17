import Link from "next/link";
import { Sparkles } from "lucide-react";
import { ClubCard } from "@/components/club-card";
import type { Club } from "@/types/domain";

export function DiscoverResults({ clubs, query }: { clubs: Club[]; query: string }) {
  if (clubs.length === 0 && !query) {
    return (
      <div className="empty-state">
        <Sparkles size={32} />
        <h2>No public clubs yet.</h2>
        <p>The first one will have the whole record bin to itself.</p>
      </div>
    );
  }

  if (clubs.length === 0) {
    return (
      <div className="empty-state">
        <Sparkles size={32} />
        <h2>No clubs match “{query}”.</h2>
        <p>Try a club name, description, current theme, or bit of guidance.</p>
        <Link href="/app/discover" className="button button-ghost">Clear search</Link>
      </div>
    );
  }

  return (
    <>
      <p className="discover-result-summary" role="status">
        {clubs.length} public {clubs.length === 1 ? "club" : "clubs"}{query ? ` matching “${query}”` : ""}
      </p>
      <div className="club-grid">
        {clubs.map((club) => <ClubCard club={club} key={club.id} />)}
      </div>
    </>
  );
}
