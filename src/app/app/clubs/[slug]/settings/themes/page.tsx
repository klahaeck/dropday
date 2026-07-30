import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ClubAdminTabs } from "@/components/club-admin-tabs";
import { ClubThemesTable } from "@/components/club-themes-table";
import { requireViewer } from "@/lib/auth";
import { canUseClubManagement } from "@/lib/club-management";
import { listPastClubThemes } from "@/lib/club-theme-history";
import { getClubBySlug, getClubDrops, getClubMemberships } from "@/lib/repository";

export default async function ClubThemeSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { profile, features } = await requireViewer();
  const club = await getClubBySlug(slug);
  if (!club) notFound();

  const [memberships, drops] = await Promise.all([
    getClubMemberships(club.id),
    getClubDrops(club.id),
  ]);
  const viewerMembership = memberships.find((item) => item.userId === profile.id);
  if (!viewerMembership || viewerMembership.role === "member") notFound();
  if (!canUseClubManagement(
    viewerMembership,
    features.clubAdminTools && features.clubThemes,
  )) redirect("/pricing");

  const pastThemes = listPastClubThemes(club, drops);

  return <>
    <div className="page-actions" style={{ marginBottom: 22 }}><Link href={`/app/clubs/${club.slug}`} className="button button-ghost button-small"><ArrowLeft size={14} /> Back to {club.name}</Link></div>
    <header className="page-header club-admin-header"><div><span className="section-kicker">Club administration</span><h1>Manage {club.name}</h1><p>Update the club’s details, themes, schedule, access, and member rotation.</p></div></header>
    <ClubAdminTabs clubSlug={club.slug} active="themes" memberCount={memberships.length} />
    <ClubThemesTable
      clubSlug={club.slug}
      currentTheme={club.currentTheme}
      savedThemes={club.savedThemes ?? []}
      pastThemes={pastThemes}
      clubAccent={club.accent}
      timezone={club.schedule.timezone}
    />
  </>;
}
