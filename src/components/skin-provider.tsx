"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { Circle, Square } from "lucide-react";
import { DEFAULT_SKIN, isSkinPreference, SKIN_STORAGE_KEY, SKINS, skinDefinition } from "@/lib/skin";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { SkinPreference } from "@/types/domain";

interface SetSkinOptions {
  save?: boolean;
}

interface SkinContextValue {
  skin: SkinPreference;
  setSkin: (skin: SkinPreference, options?: SetSkinOptions) => void;
}

const SkinContext = createContext<SkinContextValue | null>(null);
const SKIN_CHANGE_EVENT = "dropday-skin-change";

function subscribeToSkinPreference(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(SKIN_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(SKIN_CHANGE_EVENT, onStoreChange);
  };
}

function getSkinPreferenceSnapshot(): SkinPreference {
  const storedPreference = window.localStorage.getItem(SKIN_STORAGE_KEY);
  return isSkinPreference(storedPreference) ? storedPreference : DEFAULT_SKIN;
}

export function SkinProvider({ children }: { children: ReactNode }) {
  const skin = useSyncExternalStore<SkinPreference>(
    subscribeToSkinPreference,
    getSkinPreferenceSnapshot,
    () => DEFAULT_SKIN,
  );

  useEffect(() => {
    document.documentElement.dataset.skin = skin;
  }, [skin]);

  const setSkin = useCallback((nextSkin: SkinPreference, options?: SetSkinOptions) => {
    window.localStorage.setItem(SKIN_STORAGE_KEY, nextSkin);
    window.dispatchEvent(new Event(SKIN_CHANGE_EVENT));

    if (options?.save === false) return;
    void fetch("/api/preferences/skin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ skinPreference: nextSkin }),
    }).catch(() => undefined);
  }, []);

  const value = useMemo(() => ({ skin, setSkin }), [skin, setSkin]);

  return <SkinContext.Provider value={value}>{children}</SkinContext.Provider>;
}

export function useSkin() {
  const context = useContext(SkinContext);
  if (!context) throw new Error("useSkin must be used inside SkinProvider");
  return context;
}

export function SkinProfileSync({ preference, enabled }: { preference: SkinPreference; enabled: boolean }) {
  const { setSkin } = useSkin();

  useEffect(() => {
    if (enabled) setSkin(preference, { save: false });
  }, [enabled, preference, setSkin]);

  return null;
}

/** One entry per skin id. Typecheck fails until a new design gets an icon. */
const skinIcons: Record<SkinPreference, LucideIcon> = {
  classic: Circle,
  brutal: Square,
};

export function SkinSelector() {
  const { skin, setSkin } = useSkin();

  return (
    <>
      <div className="theme-selector theme-selector-auto" role="group" aria-label="Interface design">
        {SKINS.map(({ id, label }) => {
          const Icon = skinIcons[id];
          return (
            <button
              className="theme-option"
              type="button"
              aria-pressed={skin === id}
              onClick={() => setSkin(id)}
              key={id}
            >
              <Icon size={17} aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
      <small className="theme-selector-hint">{skinDefinition(skin).description}</small>
    </>
  );
}
