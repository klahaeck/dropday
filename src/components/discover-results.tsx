import Link from "next/link";
import { Sparkles } from "lucide-react";
import { ClubCard } from "@/components/club-card";
import type { Club } from "@/types/domain";

function pageHref(query: string, page: number): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  const serialized = params.toString();
  return serialized ? `/app/discover?${serialized}` : "/app/discover";
}

export function DiscoverResults({
  clubs,
  query,
  page = 1,
  hasNext = false,
}: {
  clubs: Club[];
  query: string;
  page?: number;
  hasNext?: boolean;
}) {
  if (clubs.length === 0 && !query) {
    return (
      <div className="empty-state">
        <Sparkles size={32} />
        <h2>No public clubs yet.</h2>
        <p>The first one will have the whole record bin to itself.</p>
      </div>
    );
  }

  if (clubs.length === 0 && page === 1) {
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
        Showing {clubs.length} public {clubs.length === 1 ? "club" : "clubs"}{query ? ` matching “${query}”` : ""}{page > 1 ? ` on page ${page}` : ""}
      </p>
      <div className="club-grid">
        {clubs.map((club) => <ClubCard club={club} key={club.id} />)}
      </div>
      {(page > 1 || hasNext) && <nav className="page-actions" aria-label="Discover result pages">
        {page > 1 && <Link href={pageHref(query, page - 1)} className="button button-ghost">Previous</Link>}
        {hasNext && <Link href={pageHref(query, page + 1)} className="button button-ghost">Next</Link>}
      </nav>}
    </>
  );
}
