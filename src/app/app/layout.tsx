import type { ReactNode } from "react";
import { AppNav } from "@/components/app-nav";
import { BrowserNotificationRegistration } from "@/components/browser-notifications";
import { MobileAppHeader } from "@/components/mobile-app-header";
import { SkinProfileSync } from "@/components/skin-provider";
import { ThemeProfileSync } from "@/components/theme-provider";
import { requireViewer } from "@/lib/auth";
import { env, integrations } from "@/lib/env";
import { countUnreadNotifications } from "@/lib/repository";

export default async function ApplicationLayout({ children }: { children: ReactNode }) {
  const viewer = await requireViewer();
  const unreadCount = await countUnreadNotifications(viewer.profile.id);
  return (
    <div className="app-shell">
      <ThemeProfileSync preference={viewer.profile.themePreference} enabled={!viewer.isDemo} />
      <SkinProfileSync preference={viewer.profile.skinPreference} enabled={!viewer.isDemo} />
      <BrowserNotificationRegistration
        configured={!viewer.isDemo && integrations.mongo && integrations.browserPush && Boolean(env.vapidPublicKey)}
      />
      <AppNav user={viewer.profile} isDemo={viewer.isDemo} unreadCount={unreadCount} />
      <MobileAppHeader
        user={viewer.profile}
        isDemo={viewer.isDemo}
        unreadCount={unreadCount}
        clerkEnabled={integrations.clerk}
      />
      <main className="app-main"><div className="app-main-inner">{children}</div></main>
    </div>
  );
}
