"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { Pill } from "@/components/pill";
import type { ClubRole } from "@/types/domain";

export interface MembershipManagerItem {
  clubId: string;
  clubSlug: string;
  clubName: string;
  role: ClubRole;
  isPrimaryOwner: boolean;
  ownsActiveTurn: boolean;
  activeTurnHasPlaylist: boolean;
}

export function membershipLeaveDescription(item: MembershipManagerItem) {
  if (!item.ownsActiveTurn) {
    return `You will leave ${item.clubName} and be removed from its rotation.`;
  }
  return item.activeTurnHasPlaylist
    ? `You will leave ${item.clubName}. Your active drop will move to the next eligible member and its attached playlist will be removed.`
    : `You will leave ${item.clubName}. Your active drop will move to the next eligible member.`;
}

export function MembershipManager({
  initialMemberships,
}: {
  initialMemberships: MembershipManagerItem[];
}) {
  const router = useRouter();
  const [memberships, setMemberships] = useState(initialMemberships);
  const [pending, setPending] = useState<MembershipManagerItem>();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function leave(item: MembershipManagerItem) {
    setBusy(true);
    setFeedback("");
    try {
      const response = await fetch(
        `/api/clubs/${encodeURIComponent(item.clubSlug)}/membership`,
        { method: "DELETE" },
      );
      const result = await response.json() as { error?: string; reassignedMemberId?: string };
      if (!response.ok) {
        const recovery = response.status === 409
          ? " Review the club’s ownership or rotation, then try again."
          : "";
        throw new Error(`${result.error ?? "Could not leave this club."}${recovery}`);
      }
      setMemberships((current) => current.filter((membership) => membership.clubId !== item.clubId));
      setFeedback(result.reassignedMemberId
        ? `You left ${item.clubName}. Its active drop was reassigned.`
        : `You left ${item.clubName}.`);
      setPending(undefined);
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not leave this club.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel club-members" id="manage-memberships" aria-labelledby="manage-memberships-heading">
    <div className="club-members-header">
      <div>
        <span className="section-kicker">Membership management</span>
        <h2 id="manage-memberships-heading">Manage memberships</h2>
        <p>Leave rotations you no longer participate in. Primary owners must transfer ownership first.</p>
      </div>
      <span className="tiny-label">{memberships.length} active</span>
    </div>
    <div className="club-member-list">
      {memberships.map((item) => <div className="club-member-row" key={item.clubId}>
        <span className="member-position"><LogOut size={16} aria-hidden="true" /></span>
        <div className="club-member-identity">
          <strong>{item.clubName}</strong>
          <small>{item.ownsActiveTurn
            ? item.activeTurnHasPlaylist
              ? "Your active turn has an attached playlist"
              : "You currently own the active turn"
            : "No active turn consequence"}</small>
        </div>
        <Pill tone={item.role === "owner" ? "dark" : item.role === "admin" ? "orange" : "neutral"}>
          {item.isPrimaryOwner ? "Primary owner" : item.role}
        </Pill>
        <div className="club-member-action">
          {item.isPrimaryOwner
            ? <span className="club-member-owner-label">Transfer ownership before leaving</span>
            : <button
              className="button button-ghost button-small"
              type="button"
              disabled={busy}
              onClick={() => setPending(item)}
            ><LogOut size={14} aria-hidden="true" /> Leave club</button>}
        </div>
      </div>)}
      {!memberships.length && <p className="form-note">You do not have any active club memberships.</p>}
    </div>
    <p className={feedback.includes("Could not") || feedback.includes("try again") ? "form-error" : "club-members-feedback"} role="status">{feedback}</p>
    <ConfirmationDialog
      open={Boolean(pending)}
      title={pending ? `Leave ${pending.clubName}?` : "Leave club?"}
      description={<p>{pending ? membershipLeaveDescription(pending) : ""}</p>}
      confirmLabel="Leave club"
      pending={busy}
      onCancel={() => setPending(undefined)}
      onConfirm={() => {
        if (pending) void leave(pending);
      }}
    />
  </section>;
}
