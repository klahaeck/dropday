import type { ReactNode } from "react";
import { AppNav } from "@/components/app-nav";
import { MobileAppHeader } from "@/components/mobile-app-header";
import { ThemeProfileSync } from "@/components/theme-provider";
import { requireViewer } from "@/lib/auth";
import { integrations } from "@/lib/env";
import { countUnreadNotifications } from "@/lib/repository";

export default async function ApplicationLayout({ children }: { children: ReactNode }) {
  const viewer = await requireViewer();
  const unreadCount = await countUnreadNotifications(viewer.profile.id);
  return (
    <div className="app-shell">
      <ThemeProfileSync preference={viewer.profile.themePreference} enabled={!viewer.isDemo} />
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
