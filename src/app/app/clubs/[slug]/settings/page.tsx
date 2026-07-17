import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, GripVertical, ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { CopyJoinLink } from "@/components/copy-join-link";
import { ClubSettingsForm } from "@/components/interactive-forms";
import { requireViewer } from "@/lib/auth";
import { getClubBySlug, getClubMemberships, getUsersByIds } from "@/lib/repository";

export default async function ClubSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { profile, features } = await requireViewer();
  const club = await getClubBySlug(slug);
  if (!club) notFound();
  const memberships = await getClubMemberships(club.id);
  const viewerMembership = memberships.find((item) => item.userId === profile.id);
  if (!viewerMembership || viewerMembership.role === "member") notFound();
  if (!features.clubAdminTools) redirect("/pricing");
  const users = await getUsersByIds(club.rotationMemberIds);
  return <><div className="page-actions" style={{ marginBottom: 22 }}><Link href={`/app/clubs/${club.slug}`} className="button button-ghost button-small"><ArrowLeft size={14} /> Back to {club.name}</Link></div><header className="page-header"><div><span className="section-kicker">Club administration</span><h1>Run the rotation</h1><p>Schedule changes supersede pending job versions. Published drops never change.</p></div></header><div className="dashboard-grid"><ClubSettingsForm clubSlug={club.slug} clubName={club.name} clubDescription={club.description} clubDescriptionHtml={club.descriptionHtml} ownerId={profile.id} clubImageUrl={club.imageUrl} theme={club.currentTheme.name} guidance={club.currentTheme.guidance} guidanceHtml={club.currentTheme.guidanceHtml} themeImageUrl={club.currentTheme.imageUrl} localTime={club.schedule.localTime} timezone={club.schedule.timezone} /><aside><section className="panel"><span className="section-kicker">Member order</span><h2>Queue</h2>{club.rotationMemberIds.map((userId, index) => { const user = users.find((item) => item.id === userId); return <div className="member-row" key={userId}><GripVertical size={15} /><Avatar user={user} /><div><strong>{user?.displayName}</strong><small>{index === 0 ? "Next" : `Position ${index + 1}`}</small></div><button className="button button-ghost button-small">Pause</button></div>; })}</section><section className="panel" style={{ marginTop: 16 }}><span className="section-kicker">Private access</span><h2>Shareable join link</h2><p>Revocable links expose only the club preview and request form.</p><CopyJoinLink clubSlug={club.slug} /></section><section className="panel" style={{ marginTop: 16 }}><ShieldCheck /><h2>Ownership</h2><p>Only a paid member with available capacity may accept ownership.</p></section></aside></div></>;
}
