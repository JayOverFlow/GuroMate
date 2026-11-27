import { useEffect, useRef, useState } from "react";

export interface CopyMarkdownButtonProps {
  markdown: string;
  label?: string;
}

export function CopyMarkdownButton({
  markdown,
  label = "Copy Markdown",
}: CopyMarkdownButtonProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    try {
      await navigator.clipboard.writeText(markdown);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
    timerRef.current = window.setTimeout(() => {
      setCopyState("idle");
      timerRef.current = null;
    }, 2000);
  };

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      aria-live="polite"
      className="inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-xs rounded bg-surface-container-lowest text-on-surface border border-outline-variant font-label text-label-md hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change"
    >
      <span
        className="material-symbols-outlined text-title-md"
        aria-hidden="true"
      >
        {copyState === "copied"
          ? "check"
          : copyState === "error"
            ? "error"
            : "content_copy"}
      </span>
      <span>
        {copyState === "copied"
          ? "Copied!"
          : copyState === "error"
            ? "Copy Failed"
            : label}
      </span>
    </button>
  );
}

export interface FocusModeToggleButtonProps {
  active: boolean;
  onToggle: () => void;
}

export function FocusModeToggleButton({
  active,
  onToggle,
}: FocusModeToggleButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={
        active
          ? "Exit Full-Width reading mode (Esc)"
          : "Enter Full-Width reading mode"
      }
      onClick={onToggle}
      className={
        active
          ? "inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-xs rounded bg-primary text-on-primary border border-primary font-label text-label-md hover:bg-primary-container focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change"
          : "inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-xs rounded bg-surface-container-lowest text-on-surface border border-outline-variant font-label text-label-md hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change"
      }
    >
      <span
        className="material-symbols-outlined text-title-md"
        aria-hidden="true"
      >
        {active ? "fullscreen_exit" : "fullscreen"}
      </span>
      <span>{active ? "Exit Full-Width" : "Full-Width"}</span>
    </button>
  );
}
