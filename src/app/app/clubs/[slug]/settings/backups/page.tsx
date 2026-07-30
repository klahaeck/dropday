import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ClubAdminTabs } from "@/components/club-admin-tabs";
import { ClubBackups } from "@/components/club-backups";
import { requireViewer } from "@/lib/auth";
import { canUseClubManagement } from "@/lib/club-management";
import { formatDateTime } from "@/lib/format";
import {
  getClubBySlug,
  getClubMemberships,
  getDropById,
  getUserProfile,
  listClubBackups,
  listDrafts,
} from "@/lib/repository";

export default async function ClubBackupSettingsPage({
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
  if (
    !features.playlistLibrary
    || !canUseClubManagement(
      viewerMembership,
      features.clubAdminTools && features.backupPlaylists,
    )
  ) {
    redirect("/pricing");
  }

  const [backups, drafts, activeDrop] = await Promise.all([
    listClubBackups(club.id),
    listDrafts(profile.id),
    club.activeDropId ? getDropById(club.activeDropId) : Promise.resolve(null),
  ]);
  const overdueAssignee = activeDrop?.status === "overdue"
    ? await getUserProfile(activeDrop.assignedUserId)
    : null;

  return <>
    <div className="page-actions" style={{ marginBottom: 22 }}><Link href={`/app/clubs/${club.slug}`} className="button button-ghost button-small"><ArrowLeft size={14} /> Back to {club.name}</Link></div>
    <header className="page-header club-admin-header"><div><span className="section-kicker">Club administration</span><h1>Manage {club.name}</h1><p>Preload fallback playlists and recover the rotation when a scheduled drop is missed.</p></div></header>
    <ClubAdminTabs clubSlug={club.slug} active="backups" memberCount={memberships.length} />
    <ClubBackups
      clubSlug={club.slug}
      playlists={drafts.map((draft) => ({ id: draft.id, title: draft.title }))}
      backups={backups.map((backup) => ({
        id: backup.id,
        title: backup.playlist.title,
        sourceDraftId: backup.playlist.sourceDraftId,
        status: backup.status,
        createdLabel: formatDateTime(backup.createdAt, club.schedule.timezone),
        usedLabel: backup.usedAt
          ? formatDateTime(backup.usedAt, club.schedule.timezone)
          : undefined,
      }))}
      overdueDrop={activeDrop?.status === "overdue" ? {
        assigneeName: overdueAssignee?.displayName ?? "The assigned member",
        scheduledLabel: formatDateTime(activeDrop.scheduledFor, club.schedule.timezone),
      } : undefined}
    />
  </>;
}
