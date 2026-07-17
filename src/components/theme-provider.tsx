"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  isThemePreference,
  resolveThemePreference,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
} from "@/lib/theme";
import type { ReactNode } from "react";
import type { ThemePreference } from "@/types/domain";

interface SetThemeOptions {
  save?: boolean;
}

interface ThemeContextValue {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference, options?: SetThemeOptions) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const THEME_CHANGE_EVENT = "dropday-theme-change";

function subscribeToThemePreference(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
  };
}

function getThemePreferenceSnapshot(): ThemePreference {
  const storedPreference = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemePreference(storedPreference) ? storedPreference : "system";
}

function subscribeToSystemTheme(onStoreChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function getSystemThemeSnapshot() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useSyncExternalStore<ThemePreference>(
    subscribeToThemePreference,
    getThemePreferenceSnapshot,
    () => "system",
  );
  const systemPrefersDark = useSyncExternalStore(
    subscribeToSystemTheme,
    getSystemThemeSnapshot,
    () => false,
  );

  const resolvedTheme = resolveThemePreference(preference, systemPrefersDark);

  useEffect(() => {
    const root = document.documentElement;
    if (preference === "system") root.removeAttribute("data-theme");
    else root.dataset.theme = preference;
    root.style.colorScheme = resolvedTheme;
  }, [preference, resolvedTheme]);

  const setPreference = useCallback((nextPreference: ThemePreference, options?: SetThemeOptions) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));

    if (options?.save === false) return;
    void fetch("/api/preferences/theme", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ themePreference: nextPreference }),
    }).catch(() => undefined);
  }, []);

  const value = useMemo(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}

export function ThemeProfileSync({ preference, enabled }: { preference: ThemePreference; enabled: boolean }) {
  const { setPreference } = useTheme();

  useEffect(() => {
    if (enabled) setPreference(preference, { save: false });
  }, [enabled, preference, setPreference]);

  return null;
}

const options = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
] as const;

export function ThemeSelector() {
  const { preference, setPreference } = useTheme();

  return (
    <div className="theme-selector" role="group" aria-label="Color theme">
      {options.map(({ value, label, Icon }) => (
        <button
          className="theme-option"
          type="button"
          aria-pressed={preference === value}
          onClick={() => setPreference(value)}
          key={value}
        >
          <Icon size={17} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
