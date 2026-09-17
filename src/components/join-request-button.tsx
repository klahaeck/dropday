"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { LoaderCircle, Send, Undo2 } from "lucide-react";

export function JoinRequestButton({
  clubId,
  initialRequest,
  initialBlocked = false,
}: {
  clubId: string;
  initialRequest?: { id: string; message?: string } | null;
  initialBlocked?: boolean;
}) {
  const [pendingRequest, setPendingRequest] = useState(initialRequest ?? null);
  const [message, setMessage] = useState(initialRequest?.message ?? "");
  const [blocked, setBlocked] = useState(initialBlocked);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/join-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clubId,
          ...(message.trim() ? { message: message.trim() } : {}),
        }),
      });
      const result = await response.json() as {
        request?: { id: string; message?: string };
        error?: string;
      };
      if (response.status === 402) {
        setBlocked(true);
        return;
      }
      if (!response.ok || !result.request) {
        throw new Error(result.error ?? "Could not send your request.");
      }
      setPendingRequest(result.request);
      setMessage(result.request.message ?? "");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not send your request.");
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    if (!pendingRequest) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/join-requests/${encodeURIComponent(pendingRequest.id)}`,
        { method: "DELETE" },
      );
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not withdraw your request.");
      setPendingRequest(null);
      setMessage("");
      setBlocked(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not withdraw your request.");
    } finally {
      setBusy(false);
    }
  }

  if (blocked) {
    return <div aria-live="polite">
      <p className="form-error"><strong>Membership limit reached.</strong> Leave a club before joining another.</p>
      <div className="form-actions">
        <Link className="button button-ghost button-small" href="/app/clubs#manage-memberships">
          Manage memberships
        </Link>
      </div>
    </div>;
  }

  if (pendingRequest) {
    return <div aria-live="polite">
      <p className="form-note">Your request is waiting for a club manager.</p>
      {pendingRequest.message && <p>“{pendingRequest.message}”</p>}
      <div className="form-actions">
        <button
          className="button button-ghost button-small"
          type="button"
          disabled={busy}
          onClick={() => void withdraw()}
        >
          {busy ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : <Undo2 size={15} aria-hidden="true" />}
          {busy ? "Withdrawing…" : "Withdraw request"}
        </button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>;
  }

  const messageFieldId = `join-request-message-${clubId}`;

  return <form onSubmit={submit}>
    <div className="field field-full">
      <label htmlFor={messageFieldId}>
        Message <span className="optional-label">Optional</span>
      </label>
      <textarea
        id={messageFieldId}
        value={message}
        maxLength={500}
        rows={4}
        placeholder="Tell the club what you would bring to the rotation."
        onChange={(event) => setMessage(event.target.value)}
      />
      <small className="field-counter">{message.length}/500</small>
    </div>
    <div className="form-actions">
      <button className="button button-dark button-small" type="submit" disabled={busy}>
        {busy ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
        {busy ? "Sending…" : "Request to join"}
      </button>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </form>;
}
