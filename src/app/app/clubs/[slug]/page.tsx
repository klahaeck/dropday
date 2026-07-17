import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { CalendarClock, LockKeyhole, Settings, Users } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { ChatPanel } from "@/components/chat-panel";
import { ClubDescription } from "@/components/club-description";
import { JoinRequestButton } from "@/components/interactive-forms";
import { Pill } from "@/components/pill";
import { PlaylistCard } from "@/components/playlist-card";
import { ThemePanel } from "@/components/theme-panel";
import { requireViewer } from "@/lib/auth";
import { integrations } from "@/lib/env";
import { formatDateTime, formatDateTimeParts, scheduleLabel } from "@/lib/format";
import { nextOccurrences } from "@/lib/scheduling";
import {
  getClubBySlug,
  getClubDrops,
  getClubMemberships,
  getUsersByIds,
  listMessages,
} from "@/lib/repository";

export default async function ClubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { profile, features } = await requireViewer();
  const club = await getClubBySlug(slug);
  if (!club) notFound();
  const memberships = await getClubMemberships(club.id);
  const viewerMembership = memberships.find((item) => item.userId === profile.id);
  const isMember = Boolean(viewerMembership);

  if (!isMember) return <>
    <section className={`club-hero${club.imageUrl ? " club-hero-has-image" : ""}`} style={{ "--club-accent": club.accent, background: club.accent } as React.CSSProperties}>{club.imageUrl && <Image src={club.imageUrl} alt="" fill sizes="100vw" className="club-hero-artwork" unoptimized />}<div className="club-hero-content"><Pill tone={club.visibility === "private" ? "dark" : "green"}>{club.visibility === "private" ? <LockKeyhole size={12} /> : null}{club.visibility}</Pill><h1>{club.name}</h1><ClubDescription html={club.descriptionHtml} fallback={club.description} className="club-hero-description" /><div className="club-hero-meta"><span><Users size={17} /> {club.memberCount} members</span><span><CalendarClock size={17} /> {scheduleLabel(club.schedule.rrule, club.schedule.localTime)}</span></div></div></section>
    <div className="dashboard-grid" style={{ marginTop: 18 }}><ThemePanel theme={club.currentTheme} showVersion={false} /><section className="panel"><span className="section-kicker">Members only beyond this point</span><h2>Ask to join the rotation.</h2><p>Playlists, the complete queue, and both chat rooms become visible when an admin approves you.</p><JoinRequestButton clubId={club.id} /></section></div>
  </>;

  const [drops, messages] = await Promise.all([getClubDrops(club.id), listMessages("club", club.id)]);
  const users = await getUsersByIds([...new Set([
    ...club.rotationMemberIds,
    ...drops.map((drop) => drop.replacement?.replacementPublisherId ?? drop.assignedUserId),
  ])]);
  const activeDrop = drops.find((drop) => drop.status === "scheduled" || drop.status === "overdue");
  const pastDrops = drops.filter((drop) => drop.status === "published" && drop.playlist);
  const projections = nextOccurrences(club.schedule, new Date(), Math.max(club.rotationMemberIds.length, 1));
  const hasClubRole = viewerMembership?.role === "owner" || viewerMembership?.role === "admin";
  const canManage = hasClubRole && features.clubAdminTools;
  const activeDropDateTime = activeDrop?.status === "scheduled"
    ? formatDateTimeParts(activeDrop.scheduledFor, club.schedule.timezone)
    : null;

  return <>
    <section className={`club-hero${club.imageUrl ? " club-hero-has-image" : ""}`} style={{ "--club-accent": club.accent, background: club.accent } as React.CSSProperties}>{club.imageUrl && <Image src={club.imageUrl} alt="" fill sizes="100vw" className="club-hero-artwork" unoptimized />}<div className="club-hero-content"><div className="eyebrow-row" style={{ justifyContent: "flex-start" }}><Pill tone={club.visibility === "private" ? "dark" : "green"}>{club.visibility === "private" ? <LockKeyhole size={12} /> : null}{club.visibility}</Pill>{club.custody.status !== "active" && <Pill tone="orange">System custody · {club.custody.status}</Pill>}</div><h1>{club.name}</h1><ClubDescription html={club.descriptionHtml} fallback={club.description} className="club-hero-description" /><div className="club-hero-meta"><span><Users size={17} /> {club.memberCount} members</span><span><CalendarClock size={17} /> {scheduleLabel(club.schedule.rrule, club.schedule.localTime)}</span>{canManage && <Link className="button button-small button-cream" href={`/app/clubs/${club.slug}/settings`}><Settings size={14} /> Manage</Link>}</div></div></section>
    <div className="club-layout" id="overview"><div>
      <section className="dashboard-grid">
        <ThemePanel theme={club.currentTheme} />
        <div className="panel"><span className="section-kicker">Next drop</span><h2 style={{ fontSize: 30 }}>{activeDrop?.status === "overdue" ? "Waiting on a playlist" : activeDropDateTime ? <>{activeDropDateTime.date}<br />{activeDropDateTime.time}</> : "Queue paused"}</h2><p>{activeDrop?.playlist ? `${activeDrop.playlist.title} is ready.` : "The assignee can attach a prepared playlist from their library."}</p>{activeDrop?.playlist && <Link href={`/app/clubs/${club.slug}/drops/${activeDrop.id}`} className="button button-dark button-small">Preview drop</Link>}</div>
      </section>
      <div className="section-title-row" id="queue"><h2>Rotation</h2><span className="tiny-label">Reordering never changes a published drop</span></div>
      <section className="panel queue-list">{club.rotationMemberIds.map((userId, index) => { const user = users.find((item) => item.id === userId); return <div className="member-row" key={userId}><span className="member-position">0{index + 1}</span><Avatar user={user} /><div><strong>{user?.displayName ?? "Dropday member"}</strong><small>{index === 0 ? "At the top of the queue" : `${index} turn${index > 1 ? "s" : ""} away`}</small></div><span className="member-date">{projections[index] ? formatDateTime(projections[index].toISOString(), club.schedule.timezone) : "TBD"}</span></div>; })}</section>
      <div className="section-title-row" id="past-drops"><h2>Past drops</h2><span className="tiny-label">{pastDrops.length} in the archive</span></div>
      {pastDrops.length ? <div className="playlist-grid">{pastDrops.map((drop) => { const authorId = drop.replacement?.replacementPublisherId ?? drop.assignedUserId; const author = users.find((user) => user.id === authorId); return <PlaylistCard key={drop.id} playlist={drop.playlist!} href={`/app/clubs/${club.slug}/drops/${drop.id}`} kicker={formatDateTime(drop.publishedAt!, club.schedule.timezone)} droppedBy={author?.displayName ?? "Dropday member"} />; })}</div> : <div className="empty-state"><h2>The first drop is still ahead.</h2><p>This club’s archive begins when the first playlist publishes.</p></div>}
    </div><aside id="club-chat"><ChatPanel threadType="club" threadId={club.id} initialMessages={messages} currentUser={{ id: profile.id, displayName: profile.displayName, initials: profile.initials }} realtimeEnabled={integrations.ably} /></aside></div>
  </>;
}
