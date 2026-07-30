import Link from "next/link";
import { clerkClient } from "@clerk/nextjs/server";
import { Search, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import {
  SuperAdminUsers,
  type SuperAdminUserRow,
} from "@/components/super-admin-users";
import { requireViewer } from "@/lib/auth";
import { hasSuperAdminAccess } from "@/lib/clerk-metadata";
import { complimentaryPlanFromPrivateMetadata } from "@/lib/entitlements";

const PAGE_SIZE = 25;

function pageHref(query: string, page: number): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `/app/super-admin?${search}` : "/app/super-admin";
}

export default async function SuperAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const viewer = await requireViewer();
  if (!viewer.isSuperAdmin) notFound();

  const requested = await searchParams;
  const query = requested.q?.trim().slice(0, 100) ?? "";
  const requestedPage = Number(requested.page);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const offset = (page - 1) * PAGE_SIZE;
  const result = await (await clerkClient()).users.getUserList({
    ...(query ? { query } : {}),
    limit: PAGE_SIZE,
    offset,
    orderBy: "-last_active_at",
  });
  const users: SuperAdminUserRow[] = result.data.map((user) => {
    const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ")
      || user.username
      || "Dropday member";
    return {
      id: user.id,
      displayName,
      initials: displayName
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase(),
      imageUrl: user.imageUrl,
      primaryEmail: user.primaryEmailAddress?.emailAddress,
      complimentaryPlan: complimentaryPlanFromPrivateMetadata(user.privateMetadata),
      isSuperAdmin: hasSuperAdminAccess(user.privateMetadata),
      lastActiveAt: user.lastActiveAt ? new Date(user.lastActiveAt).toISOString() : null,
    };
  });
  const firstResult = result.totalCount === 0 ? 0 : offset + 1;
  const lastResult = Math.min(offset + users.length, result.totalCount);
  const hasPrevious = page > 1;
  const hasNext = offset + users.length < result.totalCount;

  return (
    <>
      <header className="page-header">
        <div>
          <span className="section-kicker">Platform administration</span>
          <h1>Super admin</h1>
          <p>Grant account plans without changing a user’s paid Clerk subscription.</p>
        </div>
        <span className="super-admin-security-note">
          <ShieldCheck size={17} />
          Clerk private metadata
        </span>
      </header>

      <section className="panel super-admin-panel">
        <div className="super-admin-toolbar">
          <form className="super-admin-search" action="/app/super-admin" method="get">
            <label className="sr-only" htmlFor="super-admin-user-search">Search users</label>
            <Search size={17} aria-hidden="true" />
            <input
              id="super-admin-user-search"
              name="q"
              type="search"
              defaultValue={query}
              maxLength={100}
              placeholder="Search name, email, username, or user ID"
            />
            <button type="submit" className="button button-dark button-small">Search</button>
            {query && <Link href="/app/super-admin" className="button button-ghost button-small">Clear</Link>}
          </form>
          <p>
            {result.totalCount === 0
              ? "No users"
              : `Showing ${firstResult}–${lastResult} of ${result.totalCount.toLocaleString()}`}
          </p>
        </div>

        <SuperAdminUsers users={users} />

        {(hasPrevious || hasNext) && (
          <nav className="super-admin-pagination" aria-label="User list pages">
            {hasPrevious
              ? <Link className="button button-ghost button-small" href={pageHref(query, page - 1)}>Previous</Link>
              : <span />}
            <span>Page {page}</span>
            {hasNext
              ? <Link className="button button-ghost button-small" href={pageHref(query, page + 1)}>Next</Link>
              : <span />}
          </nav>
        )}
      </section>
    </>
  );
}
