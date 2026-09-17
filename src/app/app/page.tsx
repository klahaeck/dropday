import Link from "next/link";
import { ArrowRight, Bell, CalendarDays, Plus, UsersRound } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { AppEmptyState } from "@/components/app-empty-states";
import { ClubCard } from "@/components/club-card";
import { DashboardCountdown } from "@/components/dashboard-countdown";
import { Pill } from "@/components/pill";
import { PlaylistDescription } from "@/components/playlist-description";
import { ThemeDescription } from "@/components/theme-description";
import { requireViewer } from "@/lib/auth";
import { canViewDropContent } from "@/lib/drop-visibility";
import { getMembershipEntitlement, getOwnershipEntitlement } from "@/lib/entitlements";
import {
  formatDateTime,
  formatRelative,
  formatWeekdayDate,
  getZonedGreeting,
} from "@/lib/format";
import {
  countOwnedClubs,
  getClubDrops,
  getUserProfile,
  listActiveMembershipsForUser,
  listClubsForUser,
  listNotifications,
} from "@/lib/repository";

export default async function DashboardPage() {
  const nowIso = new Date().toISOString();
  const { profile, features } = await requireViewer();
  const [clubs, notifications, activeMemberships, ownedCount] = await Promise.all([
    listClubsForUser(profile.id),
    listNotifications(profile.id),
    listActiveMembershipsForUser(profile.id),
    countOwnedClubs(profile.id),
  ]);
  const drops = (await Promise.all(clubs.map((club) => getClubDrops(club.id)))).flat();
  const assignment = drops.find((drop) => drop.assignedUserId === profile.id && drop.status === "scheduled") ?? drops.find((drop) => drop.status === "scheduled");
  const assignmentClub = clubs.find((club) => club.id === assignment?.clubId) ?? clubs[0];
  const assignmentPlaylist = assignment && canViewDropContent(assignment, profile.id)
    ? assignment.playlist
    : undefined;
  const membership = getMembershipEntitlement(
    profile.plan,
    activeMemberships.length,
    features.unlimitedMemberships,
  );
  const ownership = getOwnershipEntitlement(profile.plan, ownedCount);
  const membershipsByClubId = new Map(
    activeMemberships.map((item) => [item.clubId, item]),
  );
  const assignedUser = assignment ? await getUserProfile(assignment.assignedUserId) : null;
  const assignmentTheme = assignmentClub?.currentTheme;
  const dashboardTimezone = assignmentClub?.schedule.timezone ?? "America/Chicago";
  const dashboardDate = formatWeekdayDate(nowIso, dashboardTimezone) ?? "Today";
  const greeting = getZonedGreeting(nowIso, dashboardTimezone) ?? "Hello";

  return <>
    <header className="page-header"><div><span className="section-kicker">{dashboardDate}</span><h1>{greeting}, {profile.displayName.split(" ")[0]}.</h1><p>Your listening week is quiet for another minute. Here is what is coming.</p></div><div className="page-actions dashboard-page-actions"><Link href="/app/library/new" className="button button-ghost">Prepare a playlist</Link><Link href="/app/clubs/new" className="button button-dark"><Plus size={16} /> New club</Link></div></header>

    <div className="stats-grid dashboard-stats-grid">
      <div className="stat-card stat-card-accent"><strong>{clubs.length}</strong><span>Active memberships</span></div>
      <div className="stat-card"><strong>{membership.joinLimit === null ? "∞" : membership.joinLimit}</strong><span>Membership allowance</span></div>
      <div className="stat-card"><strong>{ownership.ownedClubLimit === null ? "∞" : ownership.ownedClubLimit}</strong><span>Club ownership limit</span></div>
      <div className="stat-card"><strong>{notifications.filter((item) => !item.readAt).length}</strong><span>Unread notices</span></div>
    </div>

    {!clubs.length && <AppEmptyState kind="dashboard-no-clubs" />}
    {clubs.length > 0 && !assignment && <AppEmptyState kind="dashboard-no-drop" />}

    {assignment && assignmentClub && <div className="section-title-row"><h2>Your listening week</h2><Link href={`/app/clubs/${assignmentClub.slug}`}>Open club <ArrowRight size={13} /></Link></div>}
    {assignment && assignmentClub && <section className="dashboard-grid dashboard-grid-listening-week">
      <div className="panel next-drop">
        <div className="next-drop-art" />
        <div className="next-drop-copy"><div className="eyebrow-row"><Pill tone="orange"><CalendarDays size={12} /> Next drop</Pill><span className="tiny-label">{formatDateTime(assignment.scheduledFor, assignmentClub.schedule.timezone)}</span></div><h2>{assignmentPlaylist?.title ?? assignmentTheme?.name ?? "Freeform drop"}</h2>{assignmentPlaylist ? <PlaylistDescription html={assignmentPlaylist.descriptionHtml} fallback={assignmentPlaylist.description} /> : assignmentTheme ? <ThemeDescription html={assignmentTheme.guidanceHtml} fallback={assignmentTheme.guidance ?? ""} /> : <p>No shared theme this round. Choose the direction that feels right.</p>}<DashboardCountdown scheduledFor={assignment.scheduledFor} nowIso={nowIso} /><div style={{ display: "flex", alignItems: "center", gap: 10 }}><Avatar user={assignedUser ?? undefined} /><strong>{assignment.assignedUserId === profile.id ? "You are dropping" : `${assignedUser?.displayName ?? "A member"} is dropping`}</strong></div></div>
      </div>
    </section>}

    {clubs.length > 0 && <><div className="section-title-row"><h2>Your clubs</h2><Link href="/app/clubs">View all</Link></div>
    <div className="club-grid">{clubs.slice(0, 3).map((club) => <ClubCard key={club.id} club={club} membershipLabel={membershipsByClubId.get(club.id)?.role === "owner" ? "owner" : "member"} />)}</div></>}

    <div className="section-title-row"><h2>Activity</h2><Link href="/app/notifications">All notifications</Link></div>
    {notifications.length ? <div className="notification-list">{notifications.slice(0, 3).map((item) => {
      const relativeAge = formatRelative(item.createdAt, nowIso);
      return <Link href={item.href ?? "/app/notifications"} className={`notification-item ${item.readAt ? "" : "notification-unread"}`} key={item.id}><span className="notification-icon">{item.kind === "membership" ? <UsersRound size={18} /> : <Bell size={18} />}</span><div><h3>{item.title}</h3><p>{item.body}</p></div>{relativeAge && <time dateTime={item.createdAt}>{relativeAge}</time>}</Link>;
    })}</div> : <AppEmptyState kind="dashboard-no-activity" />}
  </>;
}
