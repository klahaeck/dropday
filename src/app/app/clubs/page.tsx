import Link from "next/link";
import { Plus } from "lucide-react";
import { AppEmptyState } from "@/components/app-empty-states";
import { ClubCard } from "@/components/club-card";
import { MembershipManager } from "@/components/membership-manager";
import { requireViewer } from "@/lib/auth";
import {
  getClubDrops,
  listActiveMembershipsForUser,
  listClubsForUser,
} from "@/lib/repository";

export default async function ClubsPage() {
  const { profile } = await requireViewer();
  const [clubs, memberships] = await Promise.all([
    listClubsForUser(profile.id),
    listActiveMembershipsForUser(profile.id),
  ]);
  const membershipsByClubId = new Map(
    memberships.map((membership) => [membership.clubId, membership]),
  );
  const dropsByClubId = new Map(await Promise.all(clubs.map(async (club) => [
    club.id,
    await getClubDrops(club.id),
  ] as const)));
  return <>
    <header className="page-header"><div><span className="section-kicker">Your rooms</span><h1>My clubs</h1><p>Every rotation you belong to, whether you host it or simply arrive with good headphones.</p></div><Link href="/app/clubs/new" className="button button-dark"><Plus size={16} /> New club</Link></header>
    {clubs.length ? <>
      <div className="club-grid">{clubs.map((club) => <ClubCard club={club} membershipLabel={membershipsByClubId.get(club.id)?.role === "owner" ? "owner" : "member"} key={club.id} />)}</div>
      <div style={{ marginTop: 28 }}>
        <MembershipManager initialMemberships={clubs.flatMap((club) => {
          const membership = membershipsByClubId.get(club.id);
          if (!membership) return [];
          const activeDrop = (dropsByClubId.get(club.id) ?? []).find((drop) =>
            drop.id === club.activeDropId
            && (drop.status === "scheduled" || drop.status === "overdue")
          );
          return [{
            clubId: club.id,
            clubSlug: club.slug,
            clubName: club.name,
            role: membership.role,
            isPrimaryOwner: club.custody.activeOwnerId === profile.id,
            ownsActiveTurn: activeDrop?.assignedUserId === profile.id,
            activeTurnHasPlaylist: activeDrop?.assignedUserId === profile.id && Boolean(activeDrop.playlist),
          }];
        })} />
      </div>
    </> : <AppEmptyState kind="clubs-empty" />}
  </>;
}
