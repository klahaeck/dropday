import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarClock, ExternalLink, UserRound } from "lucide-react";
import { ChatPanel } from "@/components/chat-panel";
import { Pill } from "@/components/pill";
import { PlaylistDescription } from "@/components/playlist-description";
import { requireViewer } from "@/lib/auth";
import { integrations } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import {
  getClubBySlug,
  getClubMemberships,
  getDropById,
  getUserProfile,
  listMessages,
} from "@/lib/repository";

export default async function DropDetailPage({ params }: { params: Promise<{ slug: string; dropId: string }> }) {
  const { slug, dropId } = await params;
  const { profile } = await requireViewer();
  const [club, drop] = await Promise.all([getClubBySlug(slug), getDropById(dropId)]);
  if (!club || !drop || drop.clubId !== club.id) notFound();
  const memberships = await getClubMemberships(club.id);
  if (!memberships.some((membership) => membership.userId === profile.id)) notFound();
  const [author, messages] = await Promise.all([getUserProfile(drop.assignedUserId), listMessages("drop", drop.id)]);

  if (!drop.playlist) return <><Link href={`/app/clubs/${slug}`} className="button button-ghost button-small"><ArrowLeft size={14} /> Back to club</Link><div className="empty-state" style={{ marginTop: 30 }}><CalendarClock size={32} /><h2>This playlist has not dropped yet.</h2><p>The detail room opens as soon as the assigned member attaches a prepared playlist.</p></div></>;

  return <><div className="page-actions" style={{ marginBottom: 20 }}><Link href={`/app/clubs/${slug}`} className="button button-ghost button-small"><ArrowLeft size={14} /> {club.name}</Link><a href={drop.playlist.canonicalUrl} target="_blank" rel="noreferrer" className="button button-dark button-small">Open in {drop.playlist.provider === "spotify" ? "Spotify" : "Apple Music"} <ExternalLink size={14} /></a></div><div className="drop-detail-grid"><article className="drop-story"><div className="eyebrow-row"><Pill tone={drop.playlist.provider === "spotify" ? "green" : "neutral"}>{drop.playlist.provider === "spotify" ? "Spotify" : "Apple Music"}</Pill><span className="tiny-label">{drop.status}</span></div><h1>{drop.playlist.title}</h1><PlaylistDescription html={drop.playlist.descriptionHtml} fallback={drop.playlist.description} className="description" /><div className="embed-shell"><iframe title={`${drop.playlist.title} playlist`} src={drop.playlist.embedUrl} allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write" loading="lazy" /></div><div className="drop-meta-grid"><div><span>Theme</span><strong>{drop.playlist.theme.name}</strong></div><div><span>Selected by</span><strong><UserRound size={14} /> {author?.displayName ?? "Dropday member"}</strong></div><div><span>Dropped</span><strong>{formatDateTime(drop.publishedAt ?? drop.scheduledFor, club.schedule.timezone)}</strong></div></div></article><ChatPanel threadType="drop" threadId={drop.id} initialMessages={messages} currentUser={{ id: profile.id, displayName: profile.displayName, initials: profile.initials }} realtimeEnabled={integrations.ably} /></div></>;
}
