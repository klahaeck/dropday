"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle } from "lucide-react";
import { Avatar } from "@/components/avatar";
import {
  COMPLIMENTARY_PLANS,
  type ComplimentaryPlanKey,
} from "@/lib/entitlements";

export interface SuperAdminUserRow {
  id: string;
  displayName: string;
  initials: string;
  imageUrl?: string;
  primaryEmail?: string;
  complimentaryPlan: ComplimentaryPlanKey | null;
  isSuperAdmin: boolean;
  lastActiveAt: string | null;
}

function ComplimentaryPlanForm({ user }: { user: SuperAdminUserRow }) {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<ComplimentaryPlanKey | "">(
    user.complimentaryPlan ?? "",
  );
  const [savedPlan, setSavedPlan] = useState<ComplimentaryPlanKey | "">(
    user.complimentaryPlan ?? "",
  );
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");

  async function save() {
    setState("saving");
    setError("");
    try {
      const response = await fetch(
        `/api/super-admin/users/${encodeURIComponent(user.id)}/complimentary-plan`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ complimentaryPlan: selectedPlan || null }),
        },
      );
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not update this complimentary plan.");
      }
      setSavedPlan(selectedPlan);
      setState("saved");
      router.refresh();
      window.setTimeout(() => setState("idle"), 1800);
    } catch (saveError) {
      setState("idle");
      setError(saveError instanceof Error ? saveError.message : "Could not update this complimentary plan.");
    }
  }

  return (
    <div className="super-admin-plan-control">
      <div className="super-admin-plan-form">
        <label className="sr-only" htmlFor={`complimentary-plan-${user.id}`}>
          Complimentary plan for {user.displayName}
        </label>
        <select
          id={`complimentary-plan-${user.id}`}
          value={selectedPlan}
          onChange={(event) => {
            setSelectedPlan(event.target.value as ComplimentaryPlanKey | "");
            setState("idle");
            setError("");
          }}
          disabled={state === "saving"}
        >
          <option value="">No complimentary plan</option>
          {COMPLIMENTARY_PLANS.map((plan) => (
            <option value={plan.key} key={plan.key}>{plan.label}</option>
          ))}
        </select>
        <button
          type="button"
          className="button button-dark button-small"
          onClick={save}
          disabled={state === "saving" || selectedPlan === savedPlan}
        >
          {state === "saving"
            ? <><LoaderCircle className="spin" size={14} /> Saving</>
            : state === "saved"
              ? <><Check size={14} /> Saved</>
              : "Save"}
        </button>
      </div>
      {error && <span className="super-admin-plan-error" role="alert">{error}</span>}
    </div>
  );
}

export function SuperAdminUsers({ users }: { users: SuperAdminUserRow[] }) {
  if (!users.length) {
    return (
      <div className="super-admin-empty">
        <h2>No users found</h2>
        <p>Try a name, email address, username, or Clerk user ID.</p>
      </div>
    );
  }

  return (
    <div className="super-admin-table-scroll">
      <table className="super-admin-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Last active</th>
            <th>Access</th>
            <th>Complimentary plan</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>
                <div className="super-admin-user">
                  <Avatar user={user} />
                  <div>
                    <strong>{user.displayName}</strong>
                    <span>{user.primaryEmail ?? user.id}</span>
                    {user.primaryEmail && <small>{user.id}</small>}
                  </div>
                </div>
              </td>
              <td>
                {user.lastActiveAt
                  ? <time dateTime={user.lastActiveAt}>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(user.lastActiveAt))}</time>
                  : <span className="super-admin-muted">Never</span>}
              </td>
              <td>
                {user.isSuperAdmin
                  ? <span className="pill pill-orange">Super admin</span>
                  : <span className="super-admin-muted">Member</span>}
              </td>
              <td><ComplimentaryPlanForm user={user} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
