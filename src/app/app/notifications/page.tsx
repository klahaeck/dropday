import Link from "next/link";
import { AtSign, Bell, CalendarClock, CreditCard, Music2, Palette, UserPlus } from "lucide-react";
import { requireViewer } from "@/lib/auth";
import { formatRelative } from "@/lib/format";
import { listNotifications } from "@/lib/repository";

const icons = { assignment: CalendarClock, theme: Palette, membership: UserPlus, mention: AtSign, published: Music2, billing: CreditCard } as const;

export default async function NotificationsPage() {
  const { profile } = await requireViewer();
  const notifications = await listNotifications(profile.id);
  return <><header className="page-header"><div><span className="section-kicker">Keep the rotation moving</span><h1>Notifications</h1><p>Assignments, mentions, reminders, membership updates, and ownership notices live here.</p></div><button className="button button-ghost">Mark all read</button></header><div className="notification-list">{notifications.map((item) => { const Icon = icons[item.kind as keyof typeof icons] ?? Bell; return <Link href={item.href ?? "#"} className={`notification-item ${item.readAt ? "" : "notification-unread"}`} key={item.id}><span className="notification-icon"><Icon size={18} /></span><div><h3>{item.title}</h3><p>{item.body}</p></div><time>{formatRelative(item.createdAt)}</time></Link>; })}</div></>;
}
