"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";
import { LoaderCircle, X } from "lucide-react";

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  pending = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogId = useId();
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  const pendingRef = useRef(pending);

  useEffect(() => {
    onCancelRef.current = onCancel;
    pendingRef.current = pending;
  }, [onCancel, pending]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (pendingRef.current) return;
        event.preventDefault();
        onCancelRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      requestAnimationFrame(() => previousFocus?.focus());
    };
  }, [open]);

  if (!open) return null;

  return <div className="playlist-selector-layer confirmation-dialog-layer">
    <button
      className="playlist-selector-backdrop"
      type="button"
      aria-label="Cancel confirmation"
      disabled={pending}
      onClick={onCancel}
    />
    <section
      ref={dialogRef}
      id={dialogId}
      className="playlist-selector-dialog confirmation-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div className="playlist-selector-heading">
        <div><span className="section-kicker">Review action</span><h2 id={titleId}>{title}</h2></div>
        <button
          className="playlist-selector-close"
          type="button"
          aria-label="Cancel confirmation"
          disabled={pending}
          onClick={onCancel}
        ><X size={19} /></button>
      </div>
      <div id={descriptionId}>{description}</div>
      <div className="playlist-selector-footer">
        <button
          ref={cancelRef}
          className="button button-ghost"
          type="button"
          disabled={pending}
          onClick={onCancel}
        >Cancel</button>
        <button
          className="button button-dark"
          type="button"
          disabled={pending}
          onClick={onConfirm}
        >
          {pending && <LoaderCircle size={15} className="spin" aria-hidden="true" />}
          {pending ? "Working…" : confirmLabel}
        </button>
      </div>
    </section>
  </div>;
}
