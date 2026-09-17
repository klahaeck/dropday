import Link from "next/link";
import { Search } from "lucide-react";
import { DiscoverResults } from "@/components/discover-results";
import { normalizeDiscoverQuery } from "@/lib/discover-search";
import { listPublicClubs } from "@/lib/repository";

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const query = normalizeDiscoverQuery((await searchParams).q);
  const clubs = await listPublicClubs(query);

  return <><header className="page-header"><div><span className="section-kicker">Find your people</span><h1>Discover clubs</h1><p>Public clubs share their premise, cadence, and current theme. The playlists stay inside until you join.</p></div></header><form action="/app/discover" method="get" className="form-shell discover-search-form"><div className="field discover-search-field"><label className="sr-only" htmlFor="club-search">Search public clubs</label><div className="discover-search-input"><Search size={17} aria-hidden="true" /><input id="club-search" name="q" defaultValue={query} placeholder="Search by name, theme, or description" maxLength={100} /></div></div><div className="discover-search-actions"><button type="submit" className="button button-dark">Search</button>{query && <Link href="/app/discover" className="button button-ghost">Clear</Link>}</div></form><DiscoverResults clubs={clubs} query={query} /></>;
}
