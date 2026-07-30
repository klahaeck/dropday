import { NotificationCenter } from "@/components/notification-center";
import { requireViewer } from "@/lib/auth";
import { listNotifications } from "@/lib/repository";

export default async function NotificationsPage() {
  const { profile } = await requireViewer();
  const notifications = await listNotifications(profile.id);
  const notificationStateKey = notifications
    .map((notification) => `${notification.id}:${notification.readAt ?? ""}`)
    .join(",");
  return <NotificationCenter key={notificationStateKey} initialNotifications={notifications} />;
}
