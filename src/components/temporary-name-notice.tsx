"use client";

import { useEffect, useRef } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { UserRoundPen } from "lucide-react";
import { useRouter } from "next/navigation";

export function TemporaryNameNotice() {
  const clerk = useClerk();
  const router = useRouter();
  const { isLoaded, user } = useUser();
  const refreshRequested = useRef(false);
  const hasCompleteName = Boolean(user?.firstName?.trim() && user?.lastName?.trim());

  useEffect(() => {
    if (!isLoaded || !hasCompleteName || refreshRequested.current) return;
    refreshRequested.current = true;
    router.refresh();
  }, [hasCompleteName, isLoaded, router]);

  if (isLoaded && hasCompleteName) return null;

  return (
    <section className="temporary-name-notice" role="status" aria-labelledby="temporary-name-notice-title">
      <span className="temporary-name-notice-icon" aria-hidden="true">
        <UserRoundPen size={20} />
      </span>
      <div>
        <h2 id="temporary-name-notice-title">Set your name</h2>
        <p>
          Dropday is using a temporary display name. Add your first and last name in Clerk&apos;s
          Update profile section.
        </p>
      </div>
      <button
        type="button"
        className="button button-dark button-small"
        disabled={!isLoaded}
        onClick={() => clerk.openUserProfile({ __experimental_startPath: "/account" })}
      >
        Update profile
      </button>
    </section>
  );
}
