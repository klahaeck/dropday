"use client";

import { useEffect, useRef } from "react";
import { useNavigationBlocker } from "@/components/navigation-blocker";

export function useUnsavedChanges(enabled: boolean) {
  const blockerId = useRef(Symbol("unsaved-changes"));
  const { register, unregister } = useNavigationBlocker();

  useEffect(() => {
    const id = blockerId.current;
    if (enabled) register(id);
    else unregister(id);
    return () => unregister(id);
  }, [enabled, register, unregister]);

  useEffect(() => {
    if (!enabled) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = true;
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [enabled]);
}
