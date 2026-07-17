"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle, X } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Pill } from "@/components/pill";
import type { UserProfile } from "@/types/domain";

export interface ClubAccessRequestItem {
  id: string;
  message?: string;
  requestedAt: string;
  user: Pick<UserProfile, "displayName" | "initials" | "imageUrl">;
}

export function ClubAccessRequests({ initialRequests }: { initialRequests: ClubAccessRequestItem[] }) {
  const [requests, setRequests] = useState(initialRequests);
  const [busyAction, setBusyAction] = useState<{ requestId: string; decision: "approve" | "decline" }>();
  const [error, setError] = useState<string>();
  const router = useRouter();

  async function decide(requestId: string, decision: "approve" | "decline") {
    setBusyAction({ requestId, decision });
    setError(undefined);
    try {
      const response = await fetch(`/api/join-requests/${encodeURIComponent(requestId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not update this request.");
      setRequests((current) => current.filter((request) => request.id !== requestId));
      router.refresh();
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : "Could not update this request.");
    } finally {
      setBusyAction(undefined);
    }
  }

  return <section className="panel access-requests" aria-labelledby="access-requests-heading">
    <div className="access-requests-header">
      <div>
        <span className="section-kicker">Club administration</span>
        <h2 id="access-requests-heading">Access requests</h2>
      </div>
      <Pill tone={requests.length ? "orange" : "green"}>
        {requests.length ? `${requests.length} pending` : "All clear"}
      </Pill>
    </div>
    {requests.length ? <div className="access-request-list">
      {requests.map((request) => {
        const busy = busyAction?.requestId === request.id;
        return <article className="access-request-row" key={request.id}>
          <Avatar user={request.user} />
          <div className="access-request-copy">
            <strong>{request.user.displayName}</strong>
            <small>Requested {request.requestedAt}</small>
            {request.message && <p>“{request.message}”</p>}
          </div>
          <div className="access-request-actions">
            <button
              className="button button-dark button-small"
              type="button"
              onClick={() => decide(request.id, "approve")}
              disabled={Boolean(busyAction)}
              aria-label={`Approve ${request.user.displayName}`}
            >
              {busy && busyAction.decision === "approve" ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />} Approve
            </button>
            <button
              className="button button-ghost button-small"
              type="button"
              onClick={() => decide(request.id, "decline")}
              disabled={Boolean(busyAction)}
              aria-label={`Decline ${request.user.displayName}`}
            >
              {busy && busyAction.decision === "decline" ? <LoaderCircle size={14} className="spin" /> : <X size={14} />} Decline
            </button>
          </div>
        </article>;
      })}
    </div> : <p className="access-requests-empty">No one is waiting to join. New requests will appear here.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
