"use client";

import { useEffect, useState } from "react";
import { NotificationBadge } from "@/components/app-navigation-items";

const unreadNotificationEvent = "dropday:unread-notifications";

export function publishUnreadNotificationCount(unreadCount: number) {
  window.dispatchEvent(new CustomEvent<number>(unreadNotificationEvent, {
    detail: Math.max(0, unreadCount),
  }));
}

export function UnreadNotificationBadge({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    const updateCount = (event: Event) => {
      setCount((event as CustomEvent<number>).detail);
    };
    window.addEventListener(unreadNotificationEvent, updateCount);
    return () => window.removeEventListener(unreadNotificationEvent, updateCount);
  }, []);

  return <NotificationBadge count={count} />;
}
