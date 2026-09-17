"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

type NavigationBlockerValue = {
  isBlocked: boolean;
  register: (id: symbol) => void;
  unregister: (id: symbol) => void;
  confirmNavigation: () => boolean;
};

const NavigationBlockerContext = createContext<NavigationBlockerValue>({
  isBlocked: false,
  register: () => undefined,
  unregister: () => undefined,
  confirmNavigation: () => true,
});

const UNSAVED_CHANGES_MESSAGE = "You have unsaved changes. Leave this page and discard them?";

export function NavigationBlockerProvider({ children }: { children: ReactNode }) {
  const [blockers, setBlockers] = useState<Set<symbol>>(() => new Set());
  const isBlocked = blockers.size > 0;
  const register = useCallback((id: symbol) => {
    setBlockers((current) => current.has(id) ? current : new Set(current).add(id));
  }, []);
  const unregister = useCallback((id: symbol) => {
    setBlockers((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }, []);
  const confirmNavigation = useCallback(
    () => !isBlocked || window.confirm(UNSAVED_CHANGES_MESSAGE),
    [isBlocked],
  );

  useEffect(() => {
    if (!isBlocked) return;
    let restoringHistory = false;
    const blockUnguardedLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(target instanceof HTMLAnchorElement) || target.dataset.navigationGuarded === "true") return;
      if (target.target === "_blank" || target.hasAttribute("download")) return;
      const destination = new URL(target.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      if (destination.pathname === window.location.pathname && destination.search === window.location.search && destination.hash === window.location.hash) return;
      if (!window.confirm(UNSAVED_CHANGES_MESSAGE)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const blockHistoryNavigation = () => {
      if (restoringHistory) {
        restoringHistory = false;
        return;
      }
      if (window.confirm(UNSAVED_CHANGES_MESSAGE)) return;
      restoringHistory = true;
      window.history.go(1);
    };
    document.addEventListener("click", blockUnguardedLink, true);
    window.addEventListener("popstate", blockHistoryNavigation);
    return () => {
      document.removeEventListener("click", blockUnguardedLink, true);
      window.removeEventListener("popstate", blockHistoryNavigation);
    };
  }, [isBlocked]);

  const value = useMemo(
    () => ({ isBlocked, register, unregister, confirmNavigation }),
    [confirmNavigation, isBlocked, register, unregister],
  );
  return <NavigationBlockerContext.Provider value={value}>{children}</NavigationBlockerContext.Provider>;
}

export function useNavigationBlocker() {
  return useContext(NavigationBlockerContext);
}

export function blockLinkNavigation(
  event: Pick<ReactMouseEvent<HTMLAnchorElement>, "preventDefault">,
  confirmNavigation: () => boolean,
) {
  if (!confirmNavigation()) event.preventDefault();
}
