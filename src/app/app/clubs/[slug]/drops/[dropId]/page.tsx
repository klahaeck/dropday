import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarClock, ExternalLink, UserRound } from "lucide-react";
import { ChatPanel } from "@/components/chat-panel";
import { Pill } from "@/components/pill";
import { PlaylistDescription } from "@/components/playlist-description";
import { requireViewer } from "@/lib/auth";
import { integrations } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { getPlaylistVersions } from "@/lib/playlist-providers";
import {
  getClubBySlug,
  getClubMemberships,
  getDropById,
  getUsersByIds,
  listMessages,
} from "@/lib/repository";

export default async function DropDetailPage({ params }: { params: Promise<{ slug: string; dropId: string }> }) {
  const { slug, dropId } = await params;
  const { profile } = await requireViewer();
  const [club, drop] = await Promise.all([getClubBySlug(slug), getDropById(dropId)]);
  if (!club || !drop || drop.clubId !== club.id) notFound();
  const memberships = await getClubMemberships(club.id);
  if (!memberships.some((membership) => membership.userId === profile.id)) notFound();
  const [users, messages] = await Promise.all([
    getUsersByIds(memberships.map((membership) => membership.userId)),
    listMessages("drop", drop.id),
  ]);
  const author = users.find((user) => user.id === drop.assignedUserId);
  const chatMembers = users.map(({ id, displayName, initials, imageUrl }) => ({ id, displayName, initials, imageUrl }));

  if (!drop.playlist) return <><Link href={`/app/clubs/${slug}`} className="button button-ghost button-small"><ArrowLeft size={14} /> Back to club</Link><div className="empty-state" style={{ marginTop: 30 }}><CalendarClock size={32} /><h2>This playlist has not dropped yet.</h2><p>The detail room opens as soon as the assigned member attaches a prepared playlist.</p></div></>;

  const versions = getPlaylistVersions(drop.playlist);
  return <><div className="page-actions" style={{ marginBottom: 20 }}><Link href={`/app/clubs/${slug}`} className="button button-ghost button-small"><ArrowLeft size={14} /> {club.name}</Link>{versions.map((version) => <a key={version.provider} href={version.canonicalUrl} target="_blank" rel="noreferrer" className="button button-dark button-small">Open in {version.provider === "spotify" ? "Spotify" : "Apple Music"} <ExternalLink size={14} /></a>)}</div><div className="drop-detail-grid"><article className="drop-story"><div className="eyebrow-row"><div className="playlist-provider-pills">{versions.map((version) => <Pill key={version.provider} tone={version.provider === "spotify" ? "green" : "neutral"}>{version.provider === "spotify" ? "Spotify" : "Apple Music"}</Pill>)}</div><span className="tiny-label">{drop.status}</span></div><h1>{drop.playlist.title}</h1><PlaylistDescription html={drop.playlist.descriptionHtml} fallback={drop.playlist.description} className="description" /><div className="embed-shell"><iframe title={`${drop.playlist.title} playlist`} src={drop.playlist.embedUrl} allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write" loading="lazy" /></div><div className="drop-meta-grid"><div><span>Theme</span><strong>{drop.playlist.theme?.name ?? "Freeform"}</strong></div><div><span>Selected by</span><strong><UserRound size={14} /> {author?.displayName ?? "Dropday member"}</strong></div><div><span>Dropped</span><strong>{formatDateTime(drop.publishedAt ?? drop.scheduledFor, club.schedule.timezone)}</strong></div></div></article><ChatPanel threadType="drop" threadId={drop.id} initialMessages={messages} currentUser={{ id: profile.id, displayName: profile.displayName, initials: profile.initials }} mentionableUsers={chatMembers} realtimeEnabled={integrations.ably} /></div></>;
}
