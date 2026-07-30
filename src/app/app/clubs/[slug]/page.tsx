import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, CalendarClock, LockKeyhole, Settings, Users } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { ChatPanel } from "@/components/chat-panel";
import { ClubAccessRequests } from "@/components/club-access-requests";
import { ClubDescription } from "@/components/club-description";
import { DropAttachmentForm } from "@/components/drop-attachment-form";
import { FreeformPanel } from "@/components/freeform-panel";
import { JoinRequestButton } from "@/components/interactive-forms";
import { Pill } from "@/components/pill";
import { ThemePanel } from "@/components/theme-panel";
import { requireViewer } from "@/lib/auth";
import { getClubAccentForeground, normalizeClubAccent } from "@/lib/club-accent";
import { canViewDropContent, hasDropReachedScheduledTime } from "@/lib/drop-visibility";
import { integrations } from "@/lib/env";
import { formatDateTime, formatDateTimeParts, scheduleLabel } from "@/lib/format";
import { nextOccurrences } from "@/lib/scheduling";
import {
  getClubBySlug,
  getClubDrops,
  getClubMemberships,
  getPendingJoinRequest,
  getUsersByIds,
  listPendingJoinRequests,
  listDrafts,
  listMessages,
} from "@/lib/repository";

export default async function ClubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { profile, features } = await requireViewer();
  const club = await getClubBySlug(slug);
  if (!club) notFound();
  const accent = normalizeClubAccent(club.accent);
  const clubAccentStyle = {
    "--club-accent": accent,
    "--club-accent-ink": getClubAccentForeground(accent),
    background: accent,
  } as React.CSSProperties;
  const memberships = await getClubMemberships(club.id);
  const viewerMembership = memberships.find((item) => item.userId === profile.id);
  const isMember = Boolean(viewerMembership);
  const hasClubRole = viewerMembership?.role === "owner" || viewerMembership?.role === "admin";
  const canManage = hasClubRole && features.clubAdminTools;

  if (!isMember) {
    const pendingRequest = await getPendingJoinRequest(club.id, profile.id);
    return <>
      <section className={`club-hero${club.imageUrl ? " club-hero-has-image" : ""}`} style={clubAccentStyle}>{club.imageUrl && <Image src={club.imageUrl} alt="" fill sizes="100vw" className="club-hero-artwork" unoptimized />}<div className="club-hero-content"><Pill tone={club.visibility === "private" ? "dark" : "green"}>{club.visibility === "private" ? <LockKeyhole size={12} /> : null}{club.visibility}</Pill><h1>{club.name}</h1><ClubDescription html={club.descriptionHtml} fallback={club.description} className="club-hero-description" /><div className="club-hero-meta"><span><Users size={17} /> {club.memberCount} members</span><span><CalendarClock size={17} /> {scheduleLabel(club.schedule.rrule, club.schedule.localTime)}</span></div></div></section>
      <div className="dashboard-grid" style={{ marginTop: 18 }}>{club.currentTheme ? <ThemePanel theme={club.currentTheme} clubAccent={accent} showVersion={false} /> : <FreeformPanel />}<section className="panel"><span className="section-kicker">Members only beyond this point</span><h2>Ask to join the rotation.</h2><p>Playlists, the complete queue, and both chat rooms become visible when an admin approves you.</p><JoinRequestButton clubId={club.id} initialRequested={Boolean(pendingRequest)} /></section></div>
    </>;
  }

  const [drops, messages, pendingJoinRequests, drafts] = await Promise.all([
    getClubDrops(club.id),
    listMessages("club", club.id),
    canManage ? listPendingJoinRequests(club.id) : Promise.resolve([]),
    features.playlistLibrary ? listDrafts(profile.id) : Promise.resolve([]),
  ]);
  const users = await getUsersByIds([...new Set([
    ...memberships.map((membership) => membership.userId),
    ...club.rotationMemberIds,
    ...drops.map((drop) => drop.replacement?.replacementPublisherId ?? drop.assignedUserId),
    ...pendingJoinRequests.map((request) => request.userId),
  ])]);
  const chatMembers = users
    .filter((user) => memberships.some((membership) => membership.userId === user.id))
    .map(({ id, displayName, initials, imageUrl }) => ({ id, displayName, initials, imageUrl }));
  const activeDrop = drops.find((drop) => drop.id === club.activeDropId)
    ?? drops.find((drop) => drop.status === "scheduled" || drop.status === "overdue");
  const timestamp = new Date().toISOString();
  const canViewActiveDropContent = Boolean(
    activeDrop && canViewDropContent(activeDrop, profile.id, timestamp),
  );
  const activeDropHasReleased = Boolean(
    activeDrop && hasDropReachedScheduledTime(activeDrop, timestamp),
  );
  const pastDrops = drops.filter((drop) => drop.status === "published" && drop.playlist);
  const pausedMemberIds = new Set(memberships.filter((membership) => membership.queuePaused).map((membership) => membership.userId));
  const activeRotationMemberIds = club.rotationMemberIds.filter((userId) => !pausedMemberIds.has(userId));
  const projections = nextOccurrences(club.schedule, new Date(), Math.max(activeRotationMemberIds.length, 1));
  const activeDropDateTime = activeDrop?.status === "scheduled"
    ? formatDateTimeParts(activeDrop.scheduledFor, club.schedule.timezone)
    : null;
  const canAttachToActiveDrop = Boolean(
    activeDrop
    && activeDrop.id === club.activeDropId
    && (activeDrop.status === "scheduled" || activeDrop.status === "overdue")
    && activeDrop.assignedUserId === profile.id
    && activeDrop.scheduleVersion === club.schedule.version
    && !club.schedule.paused
    && club.custody.status !== "archived",
  );

  return <>
    <section className={`club-hero${club.imageUrl ? " club-hero-has-image" : ""}`} style={clubAccentStyle}>{club.imageUrl && <Image src={club.imageUrl} alt="" fill sizes="100vw" className="club-hero-artwork" unoptimized />}<div className="club-hero-content"><div className="eyebrow-row" style={{ justifyContent: "flex-start" }}><Pill tone={club.visibility === "private" ? "dark" : "green"}>{club.visibility === "private" ? <LockKeyhole size={12} /> : null}{club.visibility}</Pill>{club.custody.status !== "active" && <Pill tone="orange">System custody · {club.custody.status}</Pill>}</div><h1>{club.name}</h1><ClubDescription html={club.descriptionHtml} fallback={club.description} className="club-hero-description" /><div className="club-hero-meta"><span><Users size={17} /> {club.memberCount} members</span><span><CalendarClock size={17} /> {scheduleLabel(club.schedule.rrule, club.schedule.localTime)}</span>{canManage && <Link className="button button-small button-cream" href={`/app/clubs/${club.slug}/settings`}><Settings size={14} /> Manage{pendingJoinRequests.length > 0 && <span className="button-count">{pendingJoinRequests.length}</span>}</Link>}</div></div></section>
    <div className="club-layout" id="overview"><div>
      <section className="dashboard-grid">
        {club.currentTheme ? <ThemePanel theme={club.currentTheme} clubAccent={accent} /> : <FreeformPanel />}
        <div className="panel"><span className="section-kicker">Next drop</span><h2 style={{ fontSize: 30 }}>{activeDrop?.status === "overdue" ? "Waiting on a playlist" : activeDropDateTime ? <>{activeDropDateTime.date}<br />{activeDropDateTime.time}</> : "Queue paused"}</h2><p>{activeDrop?.playlist ? canViewActiveDropContent ? `${activeDrop.playlist.title} is ready.` : "The playlist is ready for the scheduled drop." : "The assignee can attach a prepared playlist from their library."}</p>
          {activeDrop?.playlist && canViewActiveDropContent && <Link href={`/app/clubs/${club.slug}/drops/${activeDrop.id}`} className="button button-ghost button-small">{activeDropHasReleased ? "View drop" : "Preview drop"}</Link>}
          {canAttachToActiveDrop && activeDrop && (drafts.length
            ? <DropAttachmentForm
              dropId={activeDrop.id}
              drops={[{
                id: activeDrop.id,
                clubName: club.name,
                scheduledLabel: activeDrop.status === "overdue"
                  ? `Overdue since ${formatDateTime(activeDrop.scheduledFor, club.schedule.timezone)}`
                  : formatDateTime(activeDrop.scheduledFor, club.schedule.timezone),
                currentPlaylistTitle: activeDrop.playlist?.title,
                currentPlaylistDraftId: activeDrop.playlist?.sourceDraftId,
              }]}
              playlists={drafts.map((draft) => ({ id: draft.id, title: draft.title }))}
            />
            : <Link href="/app/library/new" className="button button-dark button-small">Prepare a playlist</Link>)}
        </div>
      </section>
      {canManage && <ClubAccessRequests initialRequests={pendingJoinRequests.map((request) => {
        const user = users.find((item) => item.id === request.userId);
        return {
          id: request.id,
          message: request.message,
          requestedAt: formatDateTime(request.createdAt, club.schedule.timezone),
          user: {
            displayName: user?.displayName ?? "Dropday member",
            initials: user?.initials ?? "DD",
            imageUrl: user?.imageUrl,
          },
        };
      })} />}
      <div className="section-title-row" id="queue"><h2>Rotation</h2><span className="tiny-label">Reordering never changes a published drop</span></div>
      <section className="panel queue-list">{club.rotationMemberIds.map((userId, index) => { const user = users.find((item) => item.id === userId); const paused = pausedMemberIds.has(userId); const activeIndex = activeRotationMemberIds.indexOf(userId); return <div className={`member-row${paused ? " member-row-paused" : ""}`} key={userId}><span className="member-position">0{index + 1}</span><Avatar user={user} /><div><strong>{user?.displayName ?? "Dropday member"}</strong><small>{paused ? `Paused at position ${index + 1}` : activeIndex === 0 ? "At the top of the active queue" : `${activeIndex} active turn${activeIndex > 1 ? "s" : ""} away`}</small></div><span className="member-date">{paused ? "Paused" : projections[activeIndex] ? formatDateTime(projections[activeIndex].toISOString(), club.schedule.timezone) : "TBD"}</span></div>; })}</section>
      <div className="section-title-row" id="past-drops"><h2>Past drops</h2><span className="tiny-label">{pastDrops.length} in the archive</span></div>
      {pastDrops.length ? <div className="past-drops-table-scroll"><table className="past-drops-table">
        <thead><tr><th scope="col">Playlist</th><th scope="col">Dropped by</th><th scope="col">Theme</th><th scope="col">Dropped</th><th scope="col"><span className="sr-only">Open playlist</span></th></tr></thead>
        <tbody>{pastDrops.map((drop) => { const playlist = drop.playlist!; const authorId = drop.replacement?.replacementPublisherId ?? drop.assignedUserId; const author = users.find((user) => user.id === authorId); const href = `/app/clubs/${club.slug}/drops/${drop.id}`; return <tr key={drop.id}>
          <td><Link className="past-drop-playlist" href={href}><span className={`past-drop-art past-drop-art-${playlist.provider}`}>{playlist.metadata.artworkUrl ? <Image src={playlist.metadata.artworkUrl} alt="" fill sizes="52px" unoptimized /> : <span>{playlist.title.slice(0, 2).toUpperCase()}</span>}</span><span><strong>{playlist.title}</strong><small>{playlist.provider === "spotify" ? "Spotify" : "Apple Music"}</small></span></Link></td>
          <td>{author?.displayName ?? "Dropday member"}</td>
          <td>{playlist.theme?.name ?? "Freeform"}</td>
          <td><time dateTime={drop.publishedAt}>{formatDateTime(drop.publishedAt!, club.schedule.timezone)}</time></td>
          <td><Link className="past-drop-link" href={href} aria-label={`Open ${playlist.title}`}><span>View</span><ArrowUpRight size={15} /></Link></td>
        </tr>; })}</tbody>
      </table></div> : <div className="empty-state"><h2>The first drop is still ahead.</h2><p>This club’s archive begins when the first playlist publishes.</p></div>}
    </div><aside id="club-chat"><ChatPanel threadType="club" threadId={club.id} initialMessages={messages} currentUser={{ id: profile.id, displayName: profile.displayName, initials: profile.initials }} mentionableUsers={chatMembers} realtimeEnabled={integrations.ably} clubAccent={accent} /></aside></div>
  </>;
}
