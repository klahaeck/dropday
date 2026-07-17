import Link from "next/link";
import { Settings } from "lucide-react";
import { Brand } from "@/components/brand";
import { Avatar } from "@/components/avatar";
import { appNavigationItems, NotificationBadge } from "@/components/app-navigation-items";
import { ClerkUserMenu } from "@/components/clerk-ui";
import { integrations } from "@/lib/env";
import type { UserProfile } from "@/types/domain";

export function AppNav({ user, isDemo, unreadCount }: { user: UserProfile; isDemo: boolean; unreadCount: number }) {
  return (
    <aside className="app-sidebar">
      <Brand href="/app" />
      <nav className="app-navigation" aria-label="Application">
        {appNavigationItems.map(([label, href, Icon]) => (
          <Link href={href} key={href}><Icon size={18} /><span>{label}</span>{href === "/app/notifications" && <NotificationBadge count={unreadCount} />}</Link>
        ))}
      </nav>
      <div className="sidebar-spacer" />
      {isDemo && <div className="demo-note"><span className="status-dot" /> Demo mode<br /><small>Add service keys to go live.</small></div>}
      <Link href="/app/settings" className="sidebar-settings"><Settings size={17} /> Settings</Link>
      <div className="sidebar-user">
        {integrations.clerk ? <ClerkUserMenu enabled /> : <Avatar user={user} />}
        <div><strong>{user.displayName}</strong><span>{user.plan === "free" ? "Free member" : `${user.plan} plan`}</span></div>
      </div>
    </aside>
  );
}
