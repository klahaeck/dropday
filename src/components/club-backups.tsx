"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Clock3,
  Disc3,
  LoaderCircle,
  PackagePlus,
  RotateCcw,
  Trash2,
} from "lucide-react";

interface BackupOption {
  id: string;
  title: string;
  sourceDraftId?: string;
  status: "available" | "used" | "retired";
  createdLabel: string;
  usedLabel?: string;
}

export function ClubBackups({
  clubSlug,
  playlists,
  backups,
  overdueDrop,
}: {
  clubSlug: string;
  playlists: Array<{ id: string; title: string }>;
  backups: BackupOption[];
  overdueDrop?: {
    assigneeName: string;
    scheduledLabel: string;
  };
}) {
  const [backupItems, setBackupItems] = useState(backups);
  const [recoveryComplete, setRecoveryComplete] = useState(false);
  const availableBackups = useMemo(
    () => backupItems.filter((backup) => backup.status === "available"),
    [backupItems],
  );
  const inactiveBackups = useMemo(
    () => backupItems.filter((backup) => backup.status !== "available"),
    [backupItems],
  );
  const activeOverdueDrop = recoveryComplete ? undefined : overdueDrop;
  const availableDrafts = playlists.filter((playlist) =>
    !availableBackups.some((backup) => backup.sourceDraftId === playlist.id)
  );
  const [draftId, setDraftId] = useState(availableDrafts[0]?.id ?? "");
  const [backupId, setBackupId] = useState(availableBackups[0]?.id ?? "");
  const [queueEffect, setQueueEffect] = useState<"consumeTurn" | "preserveTurn">("preserveTurn");
  const [pendingAction, setPendingAction] = useState<string>();
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string }>();
  const router = useRouter();
  const selectedDraftId = availableDrafts.some((playlist) => playlist.id === draftId)
    ? draftId
    : availableDrafts[0]?.id ?? "";
  const selectedBackupId = availableBackups.some((backup) => backup.id === backupId)
    ? backupId
    : availableBackups[0]?.id ?? "";

  async function addBackup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDraftId) return;
    setPendingAction("add");
    setMessage(undefined);
    try {
      const response = await fetch(`/api/clubs/${encodeURIComponent(clubSlug)}/backups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: selectedDraftId }),
      });
      const result = (await response.json()) as {
        error?: string;
        backup?: {
          id: string;
          playlist: { title: string; sourceDraftId?: string };
          status: "available";
        };
      };
      if (!response.ok) throw new Error(result.error ?? "Could not add this backup.");
      if (result.backup) {
        setBackupItems((items) => [{
          id: result.backup!.id,
          title: result.backup!.playlist.title,
          sourceDraftId: result.backup!.playlist.sourceDraftId,
          status: result.backup!.status,
          createdLabel: "just now",
        }, ...items]);
      }
      setMessage({ kind: "success", text: "Backup added to the club crate." });
      router.refresh();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not add this backup.",
      });
    } finally {
      setPendingAction(undefined);
    }
  }

  async function retireBackup(id: string) {
    setPendingAction(`retire:${id}`);
    setMessage(undefined);
    try {
      const response = await fetch(
        `/api/clubs/${encodeURIComponent(clubSlug)}/backups/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not retire this backup.");
      setBackupItems((items) => items.map((backup) =>
        backup.id === id ? { ...backup, status: "retired" } : backup
      ));
      setMessage({ kind: "success", text: "Backup removed from the available crate." });
      if (selectedBackupId === id) {
        setBackupId(availableBackups.find((backup) => backup.id !== id)?.id ?? "");
      }
      router.refresh();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not retire this backup.",
      });
    } finally {
      setPendingAction(undefined);
    }
  }

  async function publishBackup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedBackupId || !activeOverdueDrop) return;
    setPendingAction("recover");
    setMessage(undefined);
    try {
      const response = await fetch(
        `/api/clubs/${encodeURIComponent(clubSlug)}/recover-drop`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ backupId: selectedBackupId, queueEffect }),
        },
      );
      const result = (await response.json()) as { error?: string; warning?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not publish this backup.");
      setBackupItems((items) => items.map((backup) =>
        backup.id === selectedBackupId
          ? { ...backup, status: "used", usedLabel: "just now" }
          : backup
      ));
      setRecoveryComplete(true);
      setMessage({
        kind: "success",
        text: result.warning ?? "Backup published and the rotation is moving again.",
      });
      router.refresh();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not publish this backup.",
      });
    } finally {
      setPendingAction(undefined);
    }
  }

  return <div className="club-backup-layout">
    <section className="panel club-backup-crate">
      <div className="club-backup-heading">
        <div><span className="section-kicker">Prepared for a miss</span><h2>Backup crate</h2></div>
        <span className="tiny-label">{availableBackups.length} available</span>
      </div>
      <p>Preload playlists from your library. A backup remains private until an admin uses it for an overdue drop.</p>
      {playlists.length ? <form className="club-backup-add-form" onSubmit={addBackup}>
        <div className="field">
          <label htmlFor="backup-draft">Prepared playlist</label>
          <select
            id="backup-draft"
            value={selectedDraftId}
            disabled={pendingAction === "add" || availableDrafts.length === 0}
            onChange={(event) => setDraftId(event.target.value)}
          >
            {availableDrafts.length
              ? availableDrafts.map((playlist) =>
                  <option value={playlist.id} key={playlist.id}>{playlist.title}</option>
                )
              : <option value="">Every prepared playlist is already loaded</option>}
          </select>
        </div>
        <button
          className="button button-dark"
          type="submit"
          disabled={!selectedDraftId || pendingAction === "add" || availableDrafts.length === 0}
        >
          {pendingAction === "add"
            ? <><LoaderCircle size={15} className="spin" /> Adding…</>
            : <><PackagePlus size={15} /> Add backup</>}
        </button>
      </form> : <p className="form-note">Prepare a playlist in your library first, then return here to add it to the club crate.</p>}

      <div className="club-backup-list">
        {availableBackups.length ? availableBackups.map((backup) =>
          <article className="club-backup-item" key={backup.id}>
            <span className="club-backup-icon"><Disc3 size={18} /></span>
            <div><strong>{backup.title}</strong><small>Loaded {backup.createdLabel}</small></div>
            <button
              className="button button-ghost button-small"
              type="button"
              disabled={Boolean(pendingAction)}
              onClick={() => retireBackup(backup.id)}
              aria-label={`Remove ${backup.title} from the backup crate`}
            >
              {pendingAction === `retire:${backup.id}`
                ? <LoaderCircle size={14} className="spin" />
                : <Trash2 size={14} />}
              Remove
            </button>
          </article>
        ) : <div className="club-backup-empty"><Disc3 size={24} /><p>No backup playlists are loaded yet.</p></div>}
      </div>
    </section>

    <section className={`panel club-drop-recovery${activeOverdueDrop ? " club-drop-recovery-active" : ""}`}>
      <div className="club-backup-heading">
        <div><span className="section-kicker">Recovery</span><h2>Overdue drop</h2></div>
        {activeOverdueDrop
          ? <span className="pill pill-orange"><Clock3 size={12} /> Action needed</span>
          : <span className="pill pill-green"><Check size={12} /> Queue moving</span>}
      </div>
      {activeOverdueDrop ? <>
        <p><strong>{activeOverdueDrop.assigneeName}</strong> missed the drop scheduled for {activeOverdueDrop.scheduledLabel}. The assignee can still publish from their library, or an admin can use a backup below.</p>
        {availableBackups.length ? <form className="club-recovery-form" onSubmit={publishBackup}>
          <div className="field">
            <label htmlFor="recovery-backup">Backup playlist</label>
            <select
              id="recovery-backup"
              value={selectedBackupId}
              disabled={pendingAction === "recover"}
              onChange={(event) => setBackupId(event.target.value)}
            >
              {availableBackups.map((backup) =>
                <option value={backup.id} key={backup.id}>{backup.title}</option>
              )}
            </select>
          </div>
          <fieldset className="club-recovery-effects">
            <legend>What happens to the missed turn?</legend>
            <label className={queueEffect === "preserveTurn" ? "club-recovery-effect-selected" : ""}>
              <input
                type="radio"
                name="queueEffect"
                value="preserveTurn"
                checked={queueEffect === "preserveTurn"}
                onChange={() => setQueueEffect("preserveTurn")}
              />
              <span><strong>Keep their next turn</strong><small>The missed member stays at the front of the active queue.</small></span>
            </label>
            <label className={queueEffect === "consumeTurn" ? "club-recovery-effect-selected" : ""}>
              <input
                type="radio"
                name="queueEffect"
                value="consumeTurn"
                checked={queueEffect === "consumeTurn"}
                onChange={() => setQueueEffect("consumeTurn")}
              />
              <span><strong>Count this as their turn</strong><small>The missed member moves to the end after the backup publishes.</small></span>
            </label>
          </fieldset>
          <button
            className="button button-dark"
            type="submit"
            disabled={!selectedBackupId || pendingAction === "recover"}
          >
            {pendingAction === "recover"
              ? <><LoaderCircle size={15} className="spin" /> Publishing…</>
              : <><RotateCcw size={15} /> Publish backup now</>}
          </button>
        </form> : <p className="form-note form-error">Add a backup playlist before resolving this overdue drop.</p>}
      </> : <p>There is no overdue drop. Backups stay private and available until the club needs one.</p>}
    </section>

    {inactiveBackups.length > 0 && <section className="panel club-backup-history">
      <div className="club-backup-heading"><div><span className="section-kicker">History</span><h2>Past backups</h2></div></div>
      <div className="club-backup-list">
        {inactiveBackups.map((backup) => <article className="club-backup-item" key={backup.id}>
          <span className="club-backup-icon"><Disc3 size={18} /></span>
          <div><strong>{backup.title}</strong><small>{backup.status === "used" ? `Used ${backup.usedLabel ?? ""}` : "Removed from the crate"}</small></div>
          <span className="tiny-label">{backup.status}</span>
        </article>)}
      </div>
    </section>}

    {message && <p
      className={message.kind === "error" ? "form-error club-backup-message" : "form-note club-backup-message"}
      role={message.kind === "error" ? "alert" : "status"}
    >
      {message.text}
    </p>}
  </div>;
}
