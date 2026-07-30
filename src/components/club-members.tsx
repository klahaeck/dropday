"use client";

import { useState } from "react";
import {
  ArrowRightLeft,
  Crown,
  LoaderCircle,
  ShieldCheck,
  ShieldMinus,
} from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Pill } from "@/components/pill";
import type { ClubRole, UserProfile } from "@/types/domain";

export type ClubMemberItem = Pick<UserProfile, "id" | "displayName" | "initials" | "imageUrl"> & {
  role: ClubRole;
  isPrimaryOwner?: boolean;
};

type Feedback = {
  kind: "saved" | "error";
  message: string;
} | undefined;

const roleRank: Record<ClubRole, number> = {
  owner: 0,
  admin: 1,
  member: 2,
};

function roleLabel(role: ClubRole) {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return "Member";
}

function compareMembers(first: ClubMemberItem, second: ClubMemberItem) {
  return roleRank[first.role] - roleRank[second.role]
    || Number(Boolean(second.isPrimaryOwner)) - Number(Boolean(first.isPrimaryOwner))
    || first.displayName.localeCompare(second.displayName);
}

export function ClubMembers({
  clubSlug,
  initialMembers,
  currentUserId,
  canManageRoles,
  canManageOwnership,
}: {
  clubSlug: string;
  initialMembers: ClubMemberItem[];
  currentUserId: string;
  canManageRoles: boolean;
  canManageOwnership: boolean;
}) {
  const [members, setMembers] = useState(() =>
    [...initialMembers].sort(compareMembers)
  );
  const [busyMemberId, setBusyMemberId] = useState<string>();
  const [feedback, setFeedback] = useState<Feedback>();
  const [canEditRoles, setCanEditRoles] = useState(canManageRoles);

  async function changeRole(
    member: ClubMemberItem,
    role: ClubRole,
    transferOwnership = false,
  ) {
    if (
      transferOwnership
      && !window.confirm(
        `Transfer primary ownership of this club to ${member.displayName}? You will become an admin.`,
      )
    ) {
      return;
    }
    setBusyMemberId(member.id);
    setFeedback(undefined);

    try {
      const response = await fetch(
        `/api/clubs/${encodeURIComponent(clubSlug)}/members/${encodeURIComponent(member.id)}/role`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role, transferOwnership }),
        },
      );
      const result = (await response.json()) as {
        role?: ClubRole;
        actorRole?: ClubRole;
        primaryOwnerId?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "Could not update this member’s role.");

      const savedRole = result.role ?? role;
      setMembers((current) => current
        .map((item) => {
          const isPrimaryOwner = result.primaryOwnerId
            ? item.id === result.primaryOwnerId
            : item.isPrimaryOwner;
          if (item.id === member.id) {
            return { ...item, role: savedRole, isPrimaryOwner };
          }
          if (item.id === currentUserId && result.actorRole) {
            return { ...item, role: result.actorRole, isPrimaryOwner };
          }
          return { ...item, isPrimaryOwner };
        })
        .sort(compareMembers));
      if (transferOwnership) setCanEditRoles(false);
      setFeedback({
        kind: "saved",
        message: transferOwnership
          ? `Ownership was transferred to ${member.displayName}. You are now a club admin.`
          : savedRole === "owner"
            ? `${member.displayName} is now a co-owner.`
            : savedRole === "admin"
              ? `${member.displayName} is now a club admin.`
              : `${member.displayName} is now a club member.`,
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not update this member’s role.",
      });
    } finally {
      setBusyMemberId(undefined);
    }
  }

  const adminCount = members.filter((member) => member.role === "admin").length;
  const ownerCount = members.filter((member) => member.role === "owner").length;

  return (
    <section className="panel club-members" aria-labelledby="club-members-heading">
      <div className="club-members-header">
        <div>
          <span className="section-kicker">People and permissions</span>
          <h2 id="club-members-heading">Members</h2>
          <p>
            {canEditRoles
              ? canManageOwnership
                ? "Owners can add co-owners, transfer ownership, and manage admin access. Co-owners share club-management authority."
                : "Manage admin access. Your current plan does not include co-ownership or ownership transfers."
              : "Owners control ownership and member roles. Admins can manage settings, access requests, themes, backups, and the queue."}
          </p>
        </div>
        <span className="tiny-label">
          {ownerCount} owner{ownerCount === 1 ? "" : "s"} · {adminCount} admin{adminCount === 1 ? "" : "s"} · {members.length} members
        </span>
      </div>
      <div className="club-member-list">
        {members.map((member) => {
          const busy = busyMemberId === member.id;
          return (
            <div className="club-member-row" key={member.id}>
              <Avatar user={member} />
              <div className="club-member-identity">
                <strong>{member.displayName}</strong>
                <small>
                  {member.role === "owner"
                    ? member.isPrimaryOwner
                      ? "Primary owner for billing and recovery"
                      : "Co-owns the club and controls member roles"
                    : member.role === "admin"
                      ? "Can manage the club"
                      : "Participates in the club"}
                </small>
              </div>
              <Pill tone={member.role === "owner" ? "dark" : member.role === "admin" ? "orange" : "neutral"}>
                {member.role === "owner" && member.isPrimaryOwner
                  ? "Primary owner"
                  : roleLabel(member.role)}
              </Pill>
              <div className="club-member-action">
                {canEditRoles && member.id !== currentUserId ? (
                  <>
                    {member.role === "owner" ? (
                      canManageOwnership && (
                        <button
                          className="button button-ghost button-small"
                          type="button"
                          disabled={Boolean(busyMemberId)}
                          onClick={() => void changeRole(member, "admin")}
                          aria-label={`Remove ${member.displayName} as a co-owner`}
                        >
                          {busy
                            ? <LoaderCircle size={14} className="spin" aria-hidden="true" />
                            : <ShieldMinus size={14} aria-hidden="true" />}
                          {busy ? "Saving…" : "Remove co-owner"}
                        </button>
                      )
                    ) : (
                      <button
                        className="button button-ghost button-small"
                        type="button"
                        disabled={Boolean(busyMemberId)}
                        onClick={() => void changeRole(
                          member,
                          member.role === "admin" ? "member" : "admin",
                        )}
                        aria-label={member.role === "admin"
                          ? `Remove ${member.displayName} as a club admin`
                          : `Make ${member.displayName} a club admin`}
                      >
                        {busy
                          ? <LoaderCircle size={14} className="spin" aria-hidden="true" />
                          : member.role === "admin"
                            ? <ShieldMinus size={14} aria-hidden="true" />
                            : <ShieldCheck size={14} aria-hidden="true" />}
                        {busy ? "Saving…" : member.role === "admin" ? "Remove admin" : "Make admin"}
                      </button>
                    )}
                    {canManageOwnership && member.role !== "owner" && (
                      <button
                        className="button button-ghost button-small"
                        type="button"
                        disabled={Boolean(busyMemberId)}
                        onClick={() => void changeRole(member, "owner")}
                        aria-label={`Make ${member.displayName} a co-owner`}
                      >
                        <Crown size={14} aria-hidden="true" />
                        Make co-owner
                      </button>
                    )}
                    {canManageOwnership && (
                      <button
                        className="button button-dark button-small"
                        type="button"
                        disabled={Boolean(busyMemberId)}
                        onClick={() => void changeRole(member, "owner", true)}
                        aria-label={`Transfer club ownership to ${member.displayName}`}
                      >
                        <ArrowRightLeft size={14} aria-hidden="true" />
                        Transfer ownership
                      </button>
                    )}
                  </>
                ) : member.role === "owner" ? (
                  <span className="club-member-owner-label">
                    {member.id === currentUserId ? "You are an owner" : "Club owner"}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <p
        className={`club-members-feedback${feedback?.kind === "error" ? " form-error" : ""}`}
        role={feedback?.kind === "error" ? "alert" : "status"}
        aria-live="polite"
      >
        {feedback?.message}
      </p>
    </section>
  );
}
