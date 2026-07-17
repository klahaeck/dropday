import { CreateClubForm } from "@/components/interactive-forms";
import { requireViewer } from "@/lib/auth";
import { getOwnershipEntitlement } from "@/lib/entitlements";
import { countOwnedClubs } from "@/lib/repository";

export default async function NewClubPage() {
  const { profile, features } = await requireViewer();
  const owned = await countOwnedClubs(profile.id);
  const entitlement = getOwnershipEntitlement(profile.plan, owned);
  const canHost = features.ownOneClub || features.ownFiveClubs || features.ownUnlimitedClubs;
  const hasHostingTools = features.customSchedules && features.clubThemes && features.clubAdminTools;
  return <><header className="page-header"><div><span className="section-kicker">Start a new ritual</span><h1>Create a club</h1><p>Name the room, choose the rhythm, and give the first queue a reason to dig.</p></div></header><CreateClubForm canOwn={entitlement.canOwnAnotherClub && canHost && hasHostingTools} ownerId={profile.id} /></>;
}
