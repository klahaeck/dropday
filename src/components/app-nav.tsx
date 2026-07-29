import Link from "next/link";
import { Settings } from "lucide-react";
import { Brand } from "@/components/brand";
import { Avatar } from "@/components/avatar";
import { appNavigationItems, NotificationBadge } from "@/components/app-navigation-items";
import { ClerkUserMenu } from "@/components/clerk-ui";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { integrations } from "@/lib/env";
import type { UserProfile } from "@/types/domain";

export function AppNav({ user, isDemo, unreadCount }: { user: UserProfile; isDemo: boolean; unreadCount: number }) {
  return (
    <Sidebar>
      <SidebarHeader>
        <Brand href="/app" />
        <SidebarTrigger />
      </SidebarHeader>
      <SidebarContent>
        <nav className="app-navigation" aria-label="Application">
          <SidebarMenu>
            {appNavigationItems.map(([label, href, Icon]) => (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton asChild tooltip={label}>
                  <Link href={href}>
                    <Icon size={18} />
                    <span className="sidebar-menu-label">{label}</span>
                    {href === "/app/notifications" && (
                      <SidebarMenuBadge>
                        <NotificationBadge count={unreadCount} />
                      </SidebarMenuBadge>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </nav>
        <div className="sidebar-spacer" />
        {isDemo && (
          <div className="demo-note" title="Demo mode — Add service keys to go live.">
            <span className="status-dot" />
            <span className="demo-note-copy">
              Demo mode<br />
              <small>Add service keys to go live.</small>
            </span>
          </div>
        )}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Settings">
              <Link href="/app/settings" className="sidebar-settings">
                <Settings size={17} />
                <span className="sidebar-menu-label">Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="sidebar-user">
          <div className="sidebar-user-avatar">
            {integrations.clerk ? <ClerkUserMenu enabled /> : <Avatar user={user} />}
          </div>
          <div className="sidebar-user-details">
            <strong>{user.displayName}</strong>
            <span>{user.plan === "free" ? "Free member" : `${user.plan} plan`}</span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
