import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { AppNav } from "@/components/app-nav";
import { BrowserNotificationRegistration } from "@/components/browser-notifications";
import { MobileAppHeader } from "@/components/mobile-app-header";
import { SkinProfileSync } from "@/components/skin-provider";
import { TemporaryNameNotice } from "@/components/temporary-name-notice";
import { ThemeProfileSync } from "@/components/theme-provider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { requireViewer } from "@/lib/auth";
import { env, integrations } from "@/lib/env";
import { countUnreadNotifications } from "@/lib/repository";
import { privateRouteMetadata } from "@/lib/metadata";
import { SIDEBAR_COOKIE_NAME } from "@/lib/sidebar";

export const metadata: Metadata = privateRouteMetadata;

export default async function ApplicationLayout({ children }: { children: ReactNode }) {
  const viewer = await requireViewer();
  const unreadCount = await countUnreadNotifications(viewer.profile.id);
  const sidebarCookie = (await cookies()).get(SIDEBAR_COOKIE_NAME)?.value;
  const defaultSidebarOpen = sidebarCookie !== "false";

  return (
    <SidebarProvider className="app-shell" defaultOpen={defaultSidebarOpen}>
      <ThemeProfileSync preference={viewer.profile.themePreference} enabled={!viewer.isDemo} />
      <SkinProfileSync preference={viewer.profile.skinPreference} enabled={!viewer.isDemo} />
      <BrowserNotificationRegistration
        configured={!viewer.isDemo && integrations.mongo && integrations.browserPush && Boolean(env.vapidPublicKey)}
      />
      <AppNav
        user={viewer.profile}
        isDemo={viewer.isDemo}
        isSuperAdmin={viewer.isSuperAdmin}
        unreadCount={unreadCount}
      />
      <MobileAppHeader
        user={viewer.profile}
        isDemo={viewer.isDemo}
        unreadCount={unreadCount}
        clerkEnabled={integrations.clerk}
        isSuperAdmin={viewer.isSuperAdmin}
      />
      <main className="app-main">
        <div className="app-main-inner">
          {!viewer.isDemo && integrations.clerk && viewer.profile.generatedNameKey && (
            <TemporaryNameNotice />
          )}
          {children}
        </div>
      </main>
    </SidebarProvider>
  );
}
