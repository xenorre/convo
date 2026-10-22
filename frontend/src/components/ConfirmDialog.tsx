import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { rowDangerButton, rowSecondaryButton } from "./friends/styles";

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busyLabel?: string;
  isBusy?: boolean;
  // Keeps the confirm button disabled this long after opening, so a click
  // meant for an earlier dialog in the same spot can't land on it.
  confirmDelayMs?: number;
  onConfirm: () => void;
  onCancel: () => void;
}

// A modal question with a destructive answer. Focus starts on Cancel, stays
// inside while it is open and goes back to where it was when it closes.
// Rendered into <body> so no transformed or clipped parent can trap it.
function ConfirmDialog({
  title,
  children,
  confirmLabel,
  busyLabel,
  isBusy = false,
  confirmDelayMs = 0,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [isArmed, setIsArmed] = useState(confirmDelayMs === 0);
  const dialog = useRef<HTMLDivElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancelButton.current?.focus();
    return () => {
      // The opener may be gone by now (e.g. a menu item); then the caller decides.
      if (previous?.isConnected && previous !== document.body) previous.focus();
    };
  }, []);

  useEffect(() => {
    if (isArmed) return;
    const timer = window.setTimeout(() => setIsArmed(true), confirmDelayMs);
    return () => window.clearTimeout(timer);
  }, [isArmed, confirmDelayMs]);

  const onKeyDown = (event: KeyboardEvent) => {
    // Escape answers this dialog only, never closes the conversation behind it.
    if (event.key === "Escape") {
      event.stopPropagation();
      if (!isBusy) onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const buttons = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    if (!buttons.length) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !isBusy) onCancel();
      }}
    >
      <div
        ref={dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={onKeyDown}
        className="w-full max-w-sm rounded-2xl border border-slate-700/60 bg-slate-900 p-5 shadow-xl shadow-slate-950/40"
      >
        <h2 id={titleId} className="text-base font-semibold text-slate-100">
          {title}
        </h2>
        <div id={descriptionId} className="mt-2 space-y-2 text-sm leading-relaxed text-slate-300">
          {children}
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button ref={cancelButton} type="button" className={rowSecondaryButton} disabled={isBusy} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={rowDangerButton} disabled={isBusy || !isArmed} onClick={onConfirm}>
            {isBusy && busyLabel ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default ConfirmDialog;
