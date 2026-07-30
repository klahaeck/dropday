import Link from "next/link";
import { Plus } from "lucide-react";
import { ClubCard } from "@/components/club-card";
import { requireViewer } from "@/lib/auth";
import {
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
  return <><header className="page-header"><div><span className="section-kicker">Your rooms</span><h1>My clubs</h1><p>Every rotation you belong to, whether you host it or simply arrive with good headphones.</p></div><Link href="/app/clubs/new" className="button button-dark"><Plus size={16} /> New club</Link></header><div className="club-grid">{clubs.map((club) => <ClubCard club={club} membershipLabel={membershipsByClubId.get(club.id)?.role === "owner" ? "owner" : "member"} key={club.id} />)}</div></>;
}
