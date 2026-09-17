import type { Club } from "@/types/domain";

const MAX_DISCOVER_QUERY_LENGTH = 100;

export function normalizeDiscoverQuery(query?: string | string[]) {
  const selected = Array.isArray(query) ? query[0] : query;
  return (selected ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_DISCOVER_QUERY_LENGTH);
}

export function escapeMongoRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchesDiscoverQuery(club: Club, normalizedQuery: string) {
  if (!normalizedQuery) return true;
  const needle = normalizedQuery.toLocaleLowerCase();
  return [
    club.name,
    club.description,
    club.currentTheme?.name,
    club.currentTheme?.guidance,
  ].some((value) => value?.toLocaleLowerCase().includes(needle));
}
