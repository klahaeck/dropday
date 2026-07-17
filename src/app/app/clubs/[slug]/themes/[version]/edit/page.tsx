import { notFound, redirect } from "next/navigation";
import { EditClubThemeForm } from "@/components/interactive-forms";
import { requireViewer } from "@/lib/auth";
import { listPastClubThemes } from "@/lib/club-theme-history";
import { getClubBySlug, getClubDrops, getClubMemberships } from "@/lib/repository";

export default async function EditClubThemePage({
  params,
}: {
  params: Promise<{ slug: string; version: string }>;
}) {
  const { slug, version: versionParam } = await params;
  const version = Number(versionParam);
  if (!Number.isInteger(version) || version < 1) notFound();

  const { profile, features } = await requireViewer();
  const club = await getClubBySlug(slug);
  if (!club) notFound();

  const [memberships, drops] = await Promise.all([getClubMemberships(club.id), getClubDrops(club.id)]);
  const viewerMembership = memberships.find((item) => item.userId === profile.id);
  if (!viewerMembership || viewerMembership.role === "member") notFound();
  if (!features.clubAdminTools || !features.clubThemes) redirect("/pricing");

  const theme = club.currentTheme?.version === version
    ? club.currentTheme
    : club.savedThemes?.find((candidate) => candidate.version === version)
      ?? listPastClubThemes(club, drops).find((candidate) => candidate.version === version);
  if (!theme) notFound();

  const cancelHref = `/app/clubs/${club.slug}/settings`;
  return <>
    <header className="page-header"><div><span className="section-kicker">{club.name} · Theme #{theme.version}</span><h1>Edit theme</h1><p>Update this theme’s prompt or artwork without creating a new theme version.</p></div></header>
    <EditClubThemeForm clubSlug={club.slug} ownerId={profile.id} theme={theme} cancelHref={cancelHref} />
  </>;
}
