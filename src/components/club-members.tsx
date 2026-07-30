"use client";

import { useState } from "react";
import { LoaderCircle, ShieldCheck, ShieldMinus } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Pill } from "@/components/pill";
import type { ClubRole, UserProfile } from "@/types/domain";

export type ClubMemberItem = Pick<UserProfile, "id" | "displayName" | "initials" | "imageUrl"> & {
  role: ClubRole;
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

export function ClubMembers({
  clubSlug,
  initialMembers,
  canManageRoles,
}: {
  clubSlug: string;
  initialMembers: ClubMemberItem[];
  canManageRoles: boolean;
}) {
  const [members, setMembers] = useState(() => [...initialMembers].sort((first, second) =>
    roleRank[first.role] - roleRank[second.role]
    || first.displayName.localeCompare(second.displayName)
  ));
  const [busyMemberId, setBusyMemberId] = useState<string>();
  const [feedback, setFeedback] = useState<Feedback>();

  async function changeRole(member: ClubMemberItem) {
    const role = member.role === "admin" ? "member" : "admin";
    setBusyMemberId(member.id);
    setFeedback(undefined);

    try {
      const response = await fetch(
        `/api/clubs/${encodeURIComponent(clubSlug)}/members/${encodeURIComponent(member.id)}/role`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        },
      );
      const result = (await response.json()) as { role?: ClubRole; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not update this member’s role.");

      const savedRole = result.role ?? role;
      setMembers((current) => current
        .map((item) => item.id === member.id ? { ...item, role: savedRole } : item)
        .sort((first, second) =>
          roleRank[first.role] - roleRank[second.role]
          || first.displayName.localeCompare(second.displayName)
        ));
      setFeedback({
        kind: "saved",
        message: savedRole === "admin"
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

  return (
    <section className="panel club-members" aria-labelledby="club-members-heading">
      <div className="club-members-header">
        <div>
          <span className="section-kicker">People and permissions</span>
          <h2 id="club-members-heading">Members</h2>
          <p>
            {canManageRoles
              ? "Make any member an admin. Admins can manage club settings, access requests, themes, backups, and the queue."
              : "Club admins can manage settings, access requests, themes, backups, and the queue. Only the owner can change admin access."}
          </p>
        </div>
        <span className="tiny-label">
          {adminCount} admin{adminCount === 1 ? "" : "s"} · {members.length} members
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
                    ? "Owns the club and controls admin access"
                    : member.role === "admin"
                      ? "Can manage the club"
                      : "Participates in the club"}
                </small>
              </div>
              <Pill tone={member.role === "owner" ? "dark" : member.role === "admin" ? "orange" : "neutral"}>
                {roleLabel(member.role)}
              </Pill>
              <div className="club-member-action">
                {canManageRoles && member.role !== "owner" ? (
                  <button
                    className="button button-ghost button-small"
                    type="button"
                    disabled={Boolean(busyMemberId)}
                    onClick={() => void changeRole(member)}
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
                ) : member.role === "owner" ? (
                  <span className="club-member-owner-label">Club owner</span>
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
