import {
  Bell,
  Compass,
  LayoutDashboard,
  Library,
  UsersRound,
} from "lucide-react";

export const appNavigationItems = [
  ["Dashboard", "/app", LayoutDashboard],
  ["My clubs", "/app/clubs", UsersRound],
  ["Discover", "/app/discover", Compass],
  ["Playlist library", "/app/library", Library],
  ["Notifications", "/app/notifications", Bell],
] as const;

export function NotificationBadge({ count }: { count: number }) {
  if (count === 0) return null;

  return (
    <span
      className="notification-badge"
      aria-label={`${count} unread notifications`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
