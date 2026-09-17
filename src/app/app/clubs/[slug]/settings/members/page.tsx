import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ClubAdminTabs } from "@/components/club-admin-tabs";
import { ClubMembers } from "@/components/club-members";
import { requireViewer } from "@/lib/auth";
import { canUseClubManagement } from "@/lib/club-management";
import { getClubBySlug, getClubDrops, getClubMemberships, getUsersByIds } from "@/lib/repository";

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
  if (!canUseClubManagement(viewerMembership, features.clubAdminTools)) redirect("/pricing");

  const [users, drops] = await Promise.all([
    getUsersByIds(memberships.map((membership) => membership.userId)),
    getClubDrops(club.id),
  ]);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const activeDrop = drops.find((drop) =>
    drop.id === club.activeDropId
    && (drop.status === "scheduled" || drop.status === "overdue")
  );

  return <>
    <div className="page-actions" style={{ marginBottom: 22 }}><Link href={`/app/clubs/${club.slug}`} className="button button-ghost button-small"><ArrowLeft size={14} /> Back to {club.name}</Link></div>
    <header className="page-header club-admin-header"><div><span className="section-kicker">Club administration</span><h1>Manage {club.name}</h1><p>Update the club’s details, themes, schedule, access, and member rotation.</p></div></header>
    <ClubAdminTabs clubSlug={club.slug} active="members" memberCount={memberships.length} />
    <ClubMembers
      clubSlug={club.slug}
      currentUserId={profile.id}
      canManageRoles={viewerMembership.role === "owner"}
      canManageOwnership={
        viewerMembership.role === "owner"
        && features.ownershipTransfer
      }
      initialMembers={memberships.map((membership) => {
        const user = usersById.get(membership.userId);
        return {
          id: membership.userId,
          displayName: user?.displayName ?? "Dropday member",
          initials: user?.initials ?? "DM",
          imageUrl: user?.imageUrl,
          role: membership.role,
          canRemove:
            membership.userId !== profile.id
            && membership.role !== "owner"
            && (
              viewerMembership.role === "owner"
              || (viewerMembership.role === "admin" && membership.role === "member")
            ),
          ownsActiveTurn: activeDrop?.assignedUserId === membership.userId,
          activeTurnHasPlaylist:
            activeDrop?.assignedUserId === membership.userId
            && Boolean(activeDrop.playlist),
          isPrimaryOwner:
            membership.role === "owner"
            && membership.userId === club.custody.activeOwnerId,
        };
      })}
    />
  </>;
}
