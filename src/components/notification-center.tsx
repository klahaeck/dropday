"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AtSign,
  Bell,
  CalendarClock,
  Check,
  CreditCard,
  LoaderCircle,
  Music2,
  Palette,
  UserPlus,
} from "lucide-react";
import { publishUnreadNotificationCount } from "@/components/unread-notification-badge";
import { formatRelative } from "@/lib/format";
import type { Notification } from "@/types/domain";

const icons = {
  assignment: CalendarClock,
  theme: Palette,
  membership: UserPlus,
  mention: AtSign,
  published: Music2,
  billing: CreditCard,
} as const;

export function NotificationCenter({ initialNotifications }: { initialNotifications: Notification[] }) {
  const [readIds, setReadIds] = useState(
    () => new Set(initialNotifications.filter((notification) => notification.readAt).map((notification) => notification.id)),
  );
  const [busyIds, setBusyIds] = useState(() => new Set<string>());
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState<string>();

  const unreadNotifications = initialNotifications.filter((notification) => !readIds.has(notification.id));

  async function markOneRead(notificationId: string) {
    if (readIds.has(notificationId) || busyIds.has(notificationId) || markingAll) return;

    setReadIds((current) => new Set(current).add(notificationId));
    setBusyIds((current) => new Set(current).add(notificationId));
    publishUnreadNotificationCount(unreadNotifications.length - 1);
    setError(undefined);

    try {
      const response = await fetch(`/api/notifications/${encodeURIComponent(notificationId)}`, {
        method: "PATCH",
        keepalive: true,
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? "Could not mark this notification read.");
    } catch (readError) {
      setReadIds((current) => {
        const next = new Set(current);
        next.delete(notificationId);
        return next;
      });
      publishUnreadNotificationCount(unreadNotifications.length);
      setError(readError instanceof Error ? readError.message : "Could not mark this notification read.");
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(notificationId);
        return next;
      });
    }
  }

  async function markAllRead() {
    if (!unreadNotifications.length || markingAll || busyIds.size) return;

    const previousReadIds = readIds;
    setReadIds(new Set(initialNotifications.map((notification) => notification.id)));
    setMarkingAll(true);
    publishUnreadNotificationCount(0);
    setError(undefined);

    try {
      const response = await fetch("/api/notifications", { method: "PATCH" });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? "Could not mark all notifications read.");
    } catch (readError) {
      setReadIds(previousReadIds);
      publishUnreadNotificationCount(unreadNotifications.length);
      setError(readError instanceof Error ? readError.message : "Could not mark all notifications read.");
    } finally {
      setMarkingAll(false);
    }
  }

  return <>
    <header className="page-header">
      <div>
        <span className="section-kicker">Keep the rotation moving</span>
        <h1>Notifications</h1>
        <p>Assignments, mentions, reminders, membership updates, and ownership notices live here.</p>
      </div>
      <button
        className="button button-ghost"
        type="button"
        disabled={!unreadNotifications.length || markingAll || Boolean(busyIds.size)}
        onClick={markAllRead}
      >
        {markingAll && <LoaderCircle size={15} className="spin" />}
        {markingAll ? "Marking all…" : "Mark all read"}
      </button>
    </header>
    {error && <p className="form-error notification-error" role="alert">{error}</p>}
    <div className="notification-list">
      {initialNotifications.map((notification) => {
        const Icon = icons[notification.kind as keyof typeof icons] ?? Bell;
        const isRead = readIds.has(notification.id);
        const isBusy = busyIds.has(notification.id);
        return <article
          className={`notification-item ${isRead ? "" : "notification-unread"}`}
          key={notification.id}
        >
          <Link
            href={notification.href ?? "/app/notifications"}
            className="notification-open"
            onClick={() => void markOneRead(notification.id)}
            onAuxClick={() => void markOneRead(notification.id)}
          >
            <span className="notification-icon"><Icon size={18} /></span>
            <div>
              <h3>{notification.title}</h3>
              <p>{notification.body}</p>
            </div>
          </Link>
          <div className="notification-meta">
            <time dateTime={notification.createdAt}>{formatRelative(notification.createdAt)}</time>
            {!isRead && <button
              className="button button-ghost button-small notification-read-button"
              type="button"
              disabled={isBusy || markingAll}
              onClick={() => void markOneRead(notification.id)}
              aria-label={`Mark “${notification.title}” read`}
            >
              {isBusy ? <LoaderCircle size={13} className="spin" /> : <Check size={13} />}
              {isBusy ? "Marking…" : "Mark read"}
            </button>}
          </div>
        </article>;
      })}
    </div>
  </>;
}
