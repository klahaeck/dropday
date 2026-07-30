import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ClubAdminTabs } from "@/components/club-admin-tabs";
import { ClubMembers } from "@/components/club-members";
import { requireViewer } from "@/lib/auth";
import { getClubBySlug, getClubMemberships, getUsersByIds } from "@/lib/repository";

export default async function ClubMembersSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { profile, features } = await requireViewer();
  const club = await getClubBySlug(slug);
  if (!club) notFound();

  const memberships = await getClubMemberships(club.id);
  const viewerMembership = memberships.find((membership) => membership.userId === profile.id);
  if (!viewerMembership || viewerMembership.role === "member") notFound();
  if (!features.clubAdminTools) redirect("/pricing");

  const users = await getUsersByIds(memberships.map((membership) => membership.userId));
  const usersById = new Map(users.map((user) => [user.id, user]));

  return <>
    <div className="page-actions" style={{ marginBottom: 22 }}><Link href={`/app/clubs/${club.slug}`} className="button button-ghost button-small"><ArrowLeft size={14} /> Back to {club.name}</Link></div>
    <header className="page-header club-admin-header"><div><span className="section-kicker">Club administration</span><h1>Manage {club.name}</h1><p>Update the club’s details, themes, schedule, access, and member rotation.</p></div></header>
    <ClubAdminTabs clubSlug={club.slug} active="members" memberCount={memberships.length} />
    <ClubMembers
      clubSlug={club.slug}
      canManageRoles={
        viewerMembership.role === "owner"
        && club.custody.activeOwnerId === profile.id
      }
      initialMembers={memberships.map((membership) => {
        const user = usersById.get(membership.userId);
        return {
          id: membership.userId,
          displayName: user?.displayName ?? "Dropday member",
          initials: user?.initials ?? "DM",
          imageUrl: user?.imageUrl,
          role: membership.role,
        };
      })}
    />
  </>;
}
