import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { ClubAdminTabs } from "@/components/club-admin-tabs";
import { CopyJoinLink } from "@/components/copy-join-link";
import { ClubSettingsForm } from "@/components/interactive-forms";
import { requireViewer } from "@/lib/auth";
import { normalizeClubAccent } from "@/lib/club-accent";
import { formatDateTime } from "@/lib/format";
import {
  getClubBySlug,
  getClubMemberships,
  getDropById,
  getUserProfile,
} from "@/lib/repository";

export default async function ClubSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { profile, features } = await requireViewer();
  const club = await getClubBySlug(slug);
  if (!club) notFound();
  const memberships = await getClubMemberships(club.id);
  const viewerMembership = memberships.find((item) => item.userId === profile.id);
  if (!viewerMembership || viewerMembership.role === "member") notFound();
  if (!features.clubAdminTools || !features.customSchedules) redirect("/pricing");
  const activeDrop = club.activeDropId ? await getDropById(club.activeDropId) : null;
  const nextDrop = activeDrop?.status === "scheduled" ? activeDrop : null;
  const nextDropRecipient = nextDrop ? await getUserProfile(nextDrop.assignedUserId) : null;
  return <>
    <div className="page-actions" style={{ marginBottom: 22 }}><Link href={`/app/clubs/${club.slug}`} className="button button-ghost button-small"><ArrowLeft size={14} /> Back to {club.name}</Link></div>
    <header className="page-header club-admin-header"><div><span className="section-kicker">Club administration</span><h1>Manage {club.name}</h1><p>Update the club’s details, themes, schedule, access, and member rotation.</p></div></header>
    <ClubAdminTabs clubSlug={club.slug} active="settings" memberCount={memberships.length} />
    <div className="dashboard-grid club-admin-settings-grid">
      <ClubSettingsForm clubSlug={club.slug} clubName={club.name} clubDescription={club.description} clubDescriptionHtml={club.descriptionHtml} ownerId={profile.id} clubImageUrl={club.imageUrl} clubAccent={normalizeClubAccent(club.accent)} schedule={club.schedule} nextDropRecipientName={nextDropRecipient?.displayName} nextDropDueLabel={nextDrop ? formatDateTime(nextDrop.scheduledFor, club.schedule.timezone) : undefined} />
      <aside><section className="panel"><span className="section-kicker">Private access</span><h2>Shareable join link</h2><p>Revocable links expose only the club preview and request form.</p><CopyJoinLink clubSlug={club.slug} /></section><section className="panel" style={{ marginTop: 16 }}><ShieldCheck /><h2>Ownership</h2><p>Only a paid member with available capacity may accept ownership.</p></section></aside>
    </div>
  </>;
}
