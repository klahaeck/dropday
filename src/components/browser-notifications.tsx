"use client";

import { useEffect, useState } from "react";

type NotificationState =
  | "checking"
  | "disabled"
  | "enabled"
  | "denied"
  | "unsupported"
  | "unconfigured"
  | "working"
  | "error";

function supportsBrowserNotifications(): boolean {
  return typeof window !== "undefined"
    && "Notification" in window
    && "serviceWorker" in navigator
    && "PushManager" in window;
}

function applicationServerKey(publicKey: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - publicKey.length % 4) % 4);
  const base64 = (publicKey + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bytes = window.atob(base64);
  const key = new Uint8Array(new ArrayBuffer(bytes.length));
  for (let index = 0; index < bytes.length; index += 1) key[index] = bytes.charCodeAt(index);
  return key;
}

async function registerWorker(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register("/push-notifications-sw.js", { scope: "/" });
}

async function saveSubscription(subscription: PushSubscription): Promise<void> {
  const response = await fetch("/api/notifications/push-subscription", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!response.ok) throw new Error("Could not save browser notification subscription");
}

async function removeSubscription(subscription: PushSubscription): Promise<void> {
  const response = await fetch("/api/notifications/push-subscription", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  if (!response.ok) throw new Error("Could not remove browser notification subscription");
}

export function BrowserNotificationRegistration({
  configured,
}: {
  configured: boolean;
}) {
  useEffect(() => {
    if (!configured || !supportsBrowserNotifications() || Notification.permission !== "granted") return;
    let cancelled = false;
    void (async () => {
      const registration = await registerWorker();
      const subscription = await registration.pushManager.getSubscription();
      if (!cancelled && subscription) await saveSubscription(subscription);
    })().catch((error) => {
      console.error("Could not sync browser notification subscription", error);
    });
    return () => {
      cancelled = true;
    };
  }, [configured]);

  return null;
}

export function BrowserNotificationPreferences({
  configured,
  publicKey,
}: {
  configured: boolean;
  publicKey?: string;
}) {
  const [state, setState] = useState<NotificationState>(
    configured && publicKey ? "checking" : "unconfigured",
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!configured || !publicKey) return;
      if (!supportsBrowserNotifications()) {
        if (!cancelled) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      const registration = await registerWorker();
      const subscription = await registration.pushManager.getSubscription();
      if (!cancelled) setState(subscription ? "enabled" : "disabled");
    })().catch(() => {
      if (!cancelled) setState("error");
    });
    return () => {
      cancelled = true;
    };
  }, [configured, publicKey]);

  async function enable() {
    if (!publicKey) return;
    setState("working");
    setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "disabled");
        return;
      }
      const registration = await registerWorker();
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(publicKey),
      });
      try {
        await saveSubscription(subscription);
      } catch (error) {
        if (!existing) await subscription.unsubscribe();
        throw error;
      }
      setState("enabled");
      setMessage("Browser notifications are on for this device.");
    } catch {
      setState("error");
      setMessage("Browser notifications could not be enabled. Please try again.");
    }
  }

  async function disable() {
    setState("working");
    setMessage("");
    try {
      const registration = await registerWorker();
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await removeSubscription(subscription);
        await subscription.unsubscribe();
      }
      setState("disabled");
      setMessage("Browser notifications are off for this device.");
    } catch {
      setState("error");
      setMessage("Browser notifications could not be turned off. Please try again.");
    }
  }

  const unavailableMessage = state === "unconfigured"
    ? "Browser notifications become available after production delivery is configured."
    : state === "unsupported"
      ? "This browser does not support web push notifications."
      : state === "denied"
        ? "Notifications are blocked in this browser’s site settings."
        : state === "error"
          ? message || "Browser notifications are currently unavailable."
          : "";

  return (
    <div className="browser-notification-preferences">
      {state === "enabled" ? (
        <button
          className="button button-ghost button-small"
          type="button"
          onClick={disable}
        >
          Turn off on this device
        </button>
      ) : (
        <button
          className="button button-dark button-small"
          type="button"
          disabled={state === "checking" || state === "working" || Boolean(unavailableMessage)}
          onClick={enable}
        >
          {state === "checking" || state === "working" ? "Checking…" : "Turn on on this device"}
        </button>
      )}
      {(message || unavailableMessage) && (
        <small
          className={state === "error" || state === "denied" ? "browser-notification-error" : ""}
          role={state === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {unavailableMessage || message}
        </small>
      )}
    </div>
  );
}
