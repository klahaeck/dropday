import { notFound, redirect } from "next/navigation";
import { NewClubThemeForm } from "@/components/interactive-forms";
import { requireViewer } from "@/lib/auth";
import { nextClubThemeVersion } from "@/lib/club-theme-history";
import { getClubBySlug, getClubMemberships } from "@/lib/repository";

export default async function NewClubThemePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { profile, features } = await requireViewer();
  const club = await getClubBySlug(slug);
  if (!club) notFound();

  const memberships = await getClubMemberships(club.id);
  const viewerMembership = memberships.find((item) => item.userId === profile.id);
  if (!viewerMembership || viewerMembership.role === "member") notFound();
  if (!features.clubAdminTools || !features.clubThemes) redirect("/pricing");

  const cancelHref = `/app/clubs/${club.slug}/settings`;
  return <>
    <header className="page-header"><div><span className="section-kicker">{club.name}</span><h1>New theme</h1><p>Save a prompt for later, or make it the club’s current theme immediately.</p></div></header>
    <NewClubThemeForm clubSlug={club.slug} ownerId={profile.id} nextVersion={nextClubThemeVersion(club)} cancelHref={cancelHref} />
  </>;
}
