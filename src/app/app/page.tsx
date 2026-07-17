import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Bell, CalendarDays, Plus, UsersRound } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { ClubCard } from "@/components/club-card";
import { Pill } from "@/components/pill";
import { PlaylistDescription } from "@/components/playlist-description";
import { ThemeDescription } from "@/components/theme-description";
import { requireViewer } from "@/lib/auth";
import { getMembershipEntitlement, getOwnershipEntitlement } from "@/lib/entitlements";
import { formatDateTime } from "@/lib/format";
import {
  countActiveMemberships,
  countOwnedClubs,
  getClubDrops,
  getUserProfile,
  listClubsForUser,
  listNotifications,
} from "@/lib/repository";

export default async function DashboardPage() {
  const { profile, features } = await requireViewer();
  const [clubs, notifications, membershipCount, ownedCount] = await Promise.all([
    listClubsForUser(profile.id),
    listNotifications(profile.id),
    countActiveMemberships(profile.id),
    countOwnedClubs(profile.id),
  ]);
  const drops = (await Promise.all(clubs.map((club) => getClubDrops(club.id)))).flat();
  const assignment = drops.find((drop) => drop.assignedUserId === profile.id && drop.status === "scheduled") ?? drops.find((drop) => drop.status === "scheduled");
  const assignmentClub = clubs.find((club) => club.id === assignment?.clubId) ?? clubs[0];
  const membership = getMembershipEntitlement(profile.plan, membershipCount, features.unlimitedMemberships);
  const ownership = getOwnershipEntitlement(profile.plan, ownedCount);
  const assignedUser = assignment ? await getUserProfile(assignment.assignedUserId) : null;
  const assignmentTheme = assignmentClub?.currentTheme;

  return <>
    <header className="page-header"><div><span className="section-kicker">Thursday, July 16</span><h1>Good afternoon, {profile.displayName.split(" ")[0]}.</h1><p>Your listening week is quiet for another minute. Here is what is coming.</p></div><div className="page-actions"><Link href="/app/library" className="button button-ghost">Prepare a drop</Link><Link href="/app/clubs/new" className="button button-dark"><Plus size={16} /> New club</Link></div></header>

    <div className="stats-grid">
      <div className="stat-card stat-card-accent"><strong>{clubs.length}</strong><span>Active memberships</span></div>
      <div className="stat-card"><strong>{membership.joinLimit === null ? "∞" : membership.joinLimit}</strong><span>Membership allowance</span></div>
      <div className="stat-card"><strong>{ownership.ownedClubLimit === null ? "∞" : ownership.ownedClubLimit}</strong><span>Club ownership limit</span></div>
      <div className="stat-card"><strong>{notifications.filter((item) => !item.readAt).length}</strong><span>Unread notices</span></div>
    </div>

    {assignment && assignmentClub && <div className="section-title-row"><h2>Your listening week</h2><Link href={`/app/clubs/${assignmentClub.slug}`}>Open club <ArrowRight size={13} /></Link></div>}
    {assignment && assignmentClub && <section className="dashboard-grid">
      <div className="panel next-drop">
        <div className="next-drop-art" />
        <div className="next-drop-copy"><div className="eyebrow-row"><Pill tone="orange"><CalendarDays size={12} /> Next drop</Pill><span className="tiny-label">{formatDateTime(assignment.scheduledFor, assignmentClub.schedule.timezone)}</span></div><h2>{assignment.playlist?.title ?? assignmentTheme?.name ?? "Freeform drop"}</h2>{assignment.playlist ? <PlaylistDescription html={assignment.playlist.descriptionHtml} fallback={assignment.playlist.description} /> : assignmentTheme ? <ThemeDescription html={assignmentTheme.guidanceHtml} fallback={assignmentTheme.guidance ?? ""} /> : <p>No shared theme this round. Choose the direction that feels right.</p>}<div className="countdown"><span><strong>04</strong><small>days</small></span><span><strong>18</strong><small>hours</small></span><span><strong>32</strong><small>minutes</small></span></div><div style={{ display: "flex", alignItems: "center", gap: 10 }}><Avatar user={assignedUser ?? undefined} /><strong>{assignment.assignedUserId === profile.id ? "You are dropping" : `${assignedUser?.displayName ?? "A member"} is dropping`}</strong></div></div>
      </div>
      {assignmentTheme ? <aside className={`theme-card${assignmentTheme.imageUrl ? " theme-card-has-image" : ""}`}>{assignmentTheme.imageUrl && <Image src={assignmentTheme.imageUrl} alt="" fill sizes="(max-width: 800px) 100vw, 33vw" unoptimized />}<span className="pill pill-green">Current theme</span><h2>{assignmentTheme.name}</h2><ThemeDescription html={assignmentTheme.guidanceHtml} fallback={assignmentTheme.guidance ?? ""} /><div className="theme-card-foot"><span>{assignmentClub.name}</span><span>Theme #{assignmentTheme.version}</span></div></aside> : <aside className="theme-card"><span className="pill pill-orange">Freeform club</span><h2>No theme</h2><p>Each member chooses their own direction for the drop.</p><div className="theme-card-foot"><span>{assignmentClub.name}</span><span>Freeform</span></div></aside>}
    </section>}

    <div className="section-title-row"><h2>Your clubs</h2><Link href="/app/clubs">View all</Link></div>
    <div className="club-grid">{clubs.slice(0, 3).map((club) => <ClubCard key={club.id} club={club} membershipLabel={club.custody.activeOwnerId === profile.id ? "owner" : "member"} />)}</div>

    <div className="section-title-row"><h2>Activity</h2><Link href="/app/notifications">All notifications</Link></div>
    <div className="notification-list">{notifications.slice(0, 3).map((item) => <Link href={item.href ?? "/app/notifications"} className={`notification-item ${item.readAt ? "" : "notification-unread"}`} key={item.id}><span className="notification-icon">{item.kind === "membership" ? <UsersRound size={18} /> : <Bell size={18} />}</span><div><h3>{item.title}</h3><p>{item.body}</p></div><time>{new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(-1, "day")}</time></Link>)}</div>
  </>;
}
