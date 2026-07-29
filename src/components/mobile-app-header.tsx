"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Compass, Menu, Plus, Settings, X } from "lucide-react";
import { appNavigationItems, NotificationBadge } from "@/components/app-navigation-items";
import { Avatar } from "@/components/avatar";
import { Brand } from "@/components/brand";
import { ClerkUserMenu } from "@/components/clerk-ui";
import type { UserProfile } from "@/types/domain";

export function MobileAppHeader({
  user,
  isDemo,
  unreadCount,
  clerkEnabled,
}: {
  user: UserProfile;
  isDemo: boolean;
  unreadCount: number;
  clerkEnabled: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLElement>(null);

  const closeMenu = useCallback((restoreFocus = false) => {
    setIsOpen(false);
    if (restoreFocus) {
      requestAnimationFrame(() => menuButtonRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    const handleHistoryNavigation = () => setIsOpen(false);
    window.addEventListener("popstate", handleHistoryNavigation);
    return () => window.removeEventListener("popstate", handleHistoryNavigation);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const wideViewport = window.matchMedia("(min-width: 801px)");
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleViewportChange = (event: MediaQueryListEvent) => {
      if (event.matches) closeMenu();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
        return;
      }

      if (event.key !== "Tab" || !menuPanelRef.current) return;

      const focusable = Array.from(
        menuPanelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable[0];
      const last = focusable.at(-1);

      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    wideViewport.addEventListener("change", handleViewportChange);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      wideViewport.removeEventListener("change", handleViewportChange);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeMenu, isOpen]);

  return (
    <>
      <header className="mobile-app-header">
        <Brand href="/app" compact />
        <nav className="mobile-nav" aria-label="Mobile shortcuts">
          <Link href="/app/discover" aria-label="Discover">
            <Compass size={17} />
          </Link>
          <Link href="/app/notifications" aria-label={`Notifications, ${unreadCount} unread`}>
            <Bell size={17} />
            <NotificationBadge count={unreadCount} />
          </Link>
          <button
            ref={menuButtonRef}
            type="button"
            aria-label="Open menu"
            aria-expanded={isOpen}
            aria-controls={menuId}
            onClick={() => setIsOpen(true)}
          >
            <Menu size={17} />
          </button>
        </nav>
      </header>

      {isOpen && (
        <div className="mobile-menu-layer">
          <button
            type="button"
            className="mobile-menu-backdrop"
            aria-label="Close menu"
            onClick={() => closeMenu(true)}
          />
          <aside
            ref={menuPanelRef}
            id={menuId}
            className="mobile-menu-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Application menu"
          >
            <div className="mobile-menu-heading">
              <Brand href="/app" onClick={() => closeMenu()} />
              <button
                ref={closeButtonRef}
                type="button"
                className="mobile-menu-close"
                aria-label="Close menu"
                onClick={() => closeMenu(true)}
              >
                <X size={19} />
              </button>
            </div>
            <nav className="app-navigation mobile-menu-navigation" aria-label="Application">
              {appNavigationItems.map(([label, href, Icon]) => (
                <Link href={href} key={href} onClick={() => closeMenu()}>
                  <Icon size={18} />
                  <span>{label}</span>
                  {href === "/app/notifications" && <NotificationBadge count={unreadCount} />}
                </Link>
              ))}
            </nav>
            <Link className="button button-dark button-full" href="/app/clubs/new" onClick={() => closeMenu()}>
              <Plus size={16} /> New club
            </Link>
            <div className="sidebar-spacer" />
            {isDemo && (
              <div className="demo-note">
                <span className="status-dot" />
                <span className="demo-note-copy">
                  Demo mode<br />
                  <small>Add service keys to go live.</small>
                </span>
              </div>
            )}
            <Link href="/app/settings" className="sidebar-settings" onClick={() => closeMenu()}>
              <Settings size={17} /> Settings
            </Link>
            <div className="sidebar-user">
              <div className="sidebar-user-avatar">
                {clerkEnabled ? <ClerkUserMenu enabled /> : <Avatar user={user} />}
              </div>
              <div className="sidebar-user-details">
                <strong>{user.displayName}</strong>
                <span>{user.plan === "free" ? "Free member" : `${user.plan} plan`}</span>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
