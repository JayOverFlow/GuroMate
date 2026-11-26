import { useEffect, useId, useRef } from "react";
import type { ConfirmDialogState } from "../utils/confirmAction";

interface ConfirmDialogProps {
  state: ConfirmDialogState;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}

function isOutsideDialogBounds(
  dialog: HTMLDialogElement,
  event: PointerEvent,
): boolean {
  const rect = dialog.getBoundingClientRect();
  return (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  );
}

export function ConfirmDialog({
  state,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef(state.status);
  const onCancelRef = useRef(onCancel);
  const titleId = useId();
  const bodyId = useId();

  statusRef.current = state.status;
  onCancelRef.current = onCancel;

  const isOpen = state.status !== "idle";
  const isBusy = state.status === "busy";
  const prompt = state.prompt;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
      cancelButtonRef.current?.focus();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleCancel = (event: Event) => {
      // Safari ignores closedby="none", so guard Escape dismissal while busy.
      if (statusRef.current === "busy") {
        event.preventDefault();
      }
    };

    const handleClose = () => {
      dialog.returnValue = "";
      if (statusRef.current === "open") {
        onCancelRef.current();
      }
    };

    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("close", handleClose);

    const supportsClosedBy =
      typeof HTMLDialogElement !== "undefined" &&
      "closedBy" in HTMLDialogElement.prototype;

    if (supportsClosedBy) {
      return () => {
        dialog.removeEventListener("cancel", handleCancel);
        dialog.removeEventListener("close", handleClose);
      };
    }

    let pointerDownOutside = false;

    const handlePointerDown = (event: PointerEvent) => {
      pointerDownOutside =
        statusRef.current === "open" &&
        event.target === dialog &&
        isOutsideDialogBounds(dialog, event);
    };

    const handlePointerUp = (event: PointerEvent) => {
      const shouldClose =
        pointerDownOutside &&
        statusRef.current === "open" &&
        event.target === dialog &&
        isOutsideDialogBounds(dialog, event);
      pointerDownOutside = false;
      if (shouldClose) {
        dialog.close();
      }
    };

    const handlePointerCancel = () => {
      pointerDownOutside = false;
    };

    dialog.addEventListener("pointerdown", handlePointerDown);
    dialog.addEventListener("pointerup", handlePointerUp);
    dialog.addEventListener("pointercancel", handlePointerCancel);

    return () => {
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("pointerdown", handlePointerDown);
      dialog.removeEventListener("pointerup", handlePointerUp);
      dialog.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, []);

  const closedByProps = {
    closedby: isBusy ? "none" : "any",
  } as Record<string, string>;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      {...closedByProps}
      className="confirm-dialog m-auto w-[min(28rem,calc(100vw-2rem))] max-w-none rounded-md border border-outline-variant bg-surface-container-lowest p-0 text-on-surface shadow-xl"
    >
      <div className="flex flex-col gap-gutter-md p-gutter-lg">
        <div className="flex flex-col gap-gutter-xs">
          <h1
            id={titleId}
            className="font-title text-title-lg text-on-surface text-balance"
          >
            {prompt?.title ?? ""}
          </h1>
          <p
            id={bodyId}
            className="font-body text-body-md text-on-surface-variant text-pretty"
          >
            {prompt?.body ?? ""}
          </p>
        </div>

        {state.status === "open" && state.error && (
          <div
            role="alert"
            className="rounded border border-error bg-error-container p-gutter-sm flex items-start gap-gutter-xs font-body text-body-sm text-on-error-container"
          >
            <span
              className="material-symbols-outlined text-body-md mt-[2px] shrink-0"
              aria-hidden="true"
            >
              error
            </span>
            <span>{state.error}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-gutter-sm pt-gutter-xs">
          <button
            ref={cancelButtonRef}
            type="button"
            autoFocus
            disabled={isBusy}
            onClick={onCancel}
            className="inline-flex items-center justify-center px-gutter-md py-gutter-sm rounded bg-surface-container-lowest border border-outline-variant font-label text-label-lg text-on-surface hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => void onConfirm()}
            className="inline-flex items-center justify-center px-gutter-md py-gutter-sm rounded bg-error text-on-error font-label text-label-lg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error transition-colors duration-state-change disabled:opacity-60"
          >
            {isBusy
              ? (prompt?.busyLabel ?? "Deleting...")
              : (prompt?.confirmLabel ?? "Confirm")}
          </button>
        </div>
      </div>
    </dialog>
  );
}
