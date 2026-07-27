import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ClubAdminTabs } from "@/components/club-admin-tabs";
import { MemberOrder } from "@/components/member-order";
import { requireViewer } from "@/lib/auth";
import { getClubBySlug, getClubMemberships, getUsersByIds } from "@/lib/repository";

export default async function ClubQueueSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { profile, features } = await requireViewer();
  const club = await getClubBySlug(slug);
  if (!club) notFound();

  const memberships = await getClubMemberships(club.id);
  const viewerMembership = memberships.find((item) => item.userId === profile.id);
  if (!viewerMembership || viewerMembership.role === "member") notFound();
  if (!features.clubAdminTools || !features.customSchedules) redirect("/pricing");

  const users = await getUsersByIds(memberships.map((membership) => membership.userId));
  const membershipsByUserId = new Map(memberships.map((membership) => [membership.userId, membership]));
  const memberOrderStateKey = [
    ...club.rotationMemberIds,
    ...memberships.map((membership) => `${membership.userId}:${membership.queuePaused}`),
  ].join("|");
  const pausedMemberCount = memberships.filter((membership) => membership.queuePaused).length;

  return <>
    <div className="page-actions" style={{ marginBottom: 22 }}><Link href={`/app/clubs/${club.slug}`} className="button button-ghost button-small"><ArrowLeft size={14} /> Back to {club.name}</Link></div>
    <header className="page-header club-admin-header"><div><span className="section-kicker">Club administration</span><h1>Manage {club.name}</h1><p>Update the club’s details, themes, schedule, access, and member rotation.</p></div></header>
    <ClubAdminTabs clubSlug={club.slug} active="queue" memberCount={memberships.length} />
    <section className="panel club-admin-queue">
      <div className="club-admin-queue-header">
        <div>
          <span className="section-kicker">Member order</span>
          <h2>Queue</h2>
          <p>Reorder future turns or pause a member without losing their place.</p>
        </div>
        <span className="tiny-label">
          {memberships.length - pausedMemberCount} active
          {pausedMemberCount > 0 ? ` · ${pausedMemberCount} paused` : ""}
        </span>
      </div>
      <MemberOrder
        key={memberOrderStateKey}
        clubSlug={club.slug}
        initialMemberIds={club.rotationMemberIds}
        members={users.map(({ id, displayName, initials, imageUrl }) => ({
          id,
          displayName,
          initials,
          imageUrl,
          queuePaused: membershipsByUserId.get(id)?.queuePaused ?? false,
        }))}
      />
    </section>
  </>;
}
