import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { CopyJoinLink } from "@/components/copy-join-link";
import { ClubThemesTable } from "@/components/club-themes-table";
import { ClubSettingsForm } from "@/components/interactive-forms";
import { MemberOrder } from "@/components/member-order";
import { requireViewer } from "@/lib/auth";
import { normalizeClubAccent } from "@/lib/club-accent";
import { listPastClubThemes } from "@/lib/club-theme-history";
import { getClubBySlug, getClubDrops, getClubMemberships, getUsersByIds } from "@/lib/repository";

export default async function ClubSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { profile, features } = await requireViewer();
  const club = await getClubBySlug(slug);
  if (!club) notFound();
  const [memberships, drops] = await Promise.all([getClubMemberships(club.id), getClubDrops(club.id)]);
  const viewerMembership = memberships.find((item) => item.userId === profile.id);
  if (!viewerMembership || viewerMembership.role === "member") notFound();
  if (!features.clubAdminTools) redirect("/pricing");
  const users = await getUsersByIds(memberships.map((membership) => membership.userId));
  const membershipsByUserId = new Map(memberships.map((membership) => [membership.userId, membership]));
  const memberOrderStateKey = [
    ...club.rotationMemberIds,
    ...memberships.map((membership) => `${membership.userId}:${membership.queuePaused}`),
  ].join("|");
  const pastThemes = listPastClubThemes(club, drops);
  return <>
    <div className="page-actions" style={{ marginBottom: 22 }}><Link href={`/app/clubs/${club.slug}`} className="button button-ghost button-small"><ArrowLeft size={14} /> Back to {club.name}</Link></div>
    <header className="page-header"><div><span className="section-kicker">Club administration</span><h1>Run the rotation</h1><p>Schedule changes supersede pending job versions. Published drops never change.</p></div></header>
    <ClubThemesTable clubSlug={club.slug} currentTheme={club.currentTheme} savedThemes={club.savedThemes ?? []} pastThemes={pastThemes} clubAccent={club.accent} timezone={club.schedule.timezone} />
    <div className="dashboard-grid club-admin-settings-grid">
      <ClubSettingsForm clubSlug={club.slug} clubName={club.name} clubDescription={club.description} clubDescriptionHtml={club.descriptionHtml} ownerId={profile.id} clubImageUrl={club.imageUrl} clubAccent={normalizeClubAccent(club.accent)} localTime={club.schedule.localTime} timezone={club.schedule.timezone} />
      <aside><section className="panel"><span className="section-kicker">Member order</span><h2>Queue</h2><MemberOrder key={memberOrderStateKey} clubSlug={club.slug} initialMemberIds={club.rotationMemberIds} members={users.map(({ id, displayName, initials, imageUrl }) => ({ id, displayName, initials, imageUrl, queuePaused: membershipsByUserId.get(id)?.queuePaused ?? false }))} /></section><section className="panel" style={{ marginTop: 16 }}><span className="section-kicker">Private access</span><h2>Shareable join link</h2><p>Revocable links expose only the club preview and request form.</p><CopyJoinLink clubSlug={club.slug} /></section><section className="panel" style={{ marginTop: 16 }}><ShieldCheck /><h2>Ownership</h2><p>Only a paid member with available capacity may accept ownership.</p></section></aside>
    </div>
  </>;
}
