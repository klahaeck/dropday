"use strict";

self.addEventListener("push", (event) => {
  let payload = {
    id: "dropday-notification",
    title: "Dropday",
    body: "You have a new account notification.",
    href: "/app/notifications",
  };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // Use the safe fallback when a push service sends an unreadable payload.
  }

  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: "/dropday-mark.svg",
    badge: "/dropday-mark.svg",
    tag: payload.id,
    data: { href: payload.href },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const fallbackUrl = new URL("/app/notifications", self.location.origin);
    let targetUrl = fallbackUrl;
    try {
      const candidate = new URL(event.notification.data?.href ?? fallbackUrl, self.location.origin);
      if (candidate.origin === self.location.origin) targetUrl = candidate;
    } catch {
      // Keep the account notifications page as the safe destination.
    }

    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("navigate" in client) await client.navigate(targetUrl.href);
      if ("focus" in client) return client.focus();
    }
    return self.clients.openWindow(targetUrl.href);
  })());
});
