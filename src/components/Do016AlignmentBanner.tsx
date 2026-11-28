import { useState } from "react";
import type { AlignmentCheckItem, AlignmentCheckResult } from "../engine/types";

export interface Do016AlignmentBannerProps {
  alignmentCheck: AlignmentCheckResult;
  hasUnsavedEdits?: boolean;
}

function severityIcon(severity: AlignmentCheckItem["severity"]): string {
  if (severity === "pass") return "check_circle";
  if (severity === "error") return "error";
  return "warning";
}

function severityIconClass(severity: AlignmentCheckItem["severity"]): string {
  if (severity === "pass") return "text-success";
  if (severity === "error") return "text-error";
  return "text-warning";
}

/** Concise, non-blocking inline DO 016, s. 2026 Alignment Check banner for DLL and DLP workspaces. */
export function Do016AlignmentBanner({
  alignmentCheck,
  hasUnsavedEdits = false,
}: Do016AlignmentBannerProps) {
  const [showDetails, setShowDetails] = useState(false);

  const errorItems = alignmentCheck.items.filter((i) => i.severity === "error");
  const warningItems = alignmentCheck.items.filter(
    (i) => i.severity === "warning",
  );
  const passItems = alignmentCheck.items.filter((i) => i.severity === "pass");
  const issueCount = errorItems.length + warningItems.length;

  const toneClass = !alignmentCheck.structuralValid
    ? "border-error/40 bg-error-container/35 text-on-error-container"
    : alignmentCheck.passed
      ? "border-success/40 bg-success-container/30 text-on-success-container"
      : "border-warning/40 bg-warning-container/40 text-on-warning-container";

  const headerIcon = !alignmentCheck.structuralValid
    ? "error"
    : alignmentCheck.passed
      ? "verified"
      : "warning";

  const headerIconClass = !alignmentCheck.structuralValid
    ? "text-error"
    : alignmentCheck.passed
      ? "text-success"
      : "text-warning";

  const headline = !alignmentCheck.structuralValid
    ? `DO 016 Alignment Check: ${errorItems.length} structural issue${errorItems.length === 1 ? "" : "s"}${warningItems.length > 0 ? ` and ${warningItems.length} warning${warningItems.length === 1 ? "" : "s"}` : ""}`
    : alignmentCheck.passed
      ? `DO 016 Alignment Check: All ${passItems.length} checks passed`
      : `DO 016 Alignment Check: ${warningItems.length} warning${warningItems.length === 1 ? "" : "s"} to review (${passItems.length} passed)`;

  const visibleItems =
    issueCount === 0
      ? showDetails
        ? passItems
        : []
      : showDetails
        ? [...errorItems, ...warningItems, ...passItems]
        : [...errorItems, ...warningItems];

  return (
    <section
      aria-label="DO 016 Alignment Check"
      className={`rounded-md border px-gutter-md py-gutter-sm flex flex-col gap-gutter-sm ${toneClass}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-gutter-sm">
        <div className="flex flex-wrap items-center gap-gutter-xs">
          <span
            className={`material-symbols-outlined text-title-md shrink-0 ${headerIconClass}`}
            aria-hidden="true"
          >
            {headerIcon}
          </span>
          <span className="font-label text-label-md">{headline}</span>
          {alignmentCheck.autoRepaired && (
            <span className="px-gutter-sm py-0.5 rounded-full bg-surface-container-lowest/80 border border-outline-variant font-label text-label-sm text-on-surface">
              Auto-repaired once
            </span>
          )}
          {hasUnsavedEdits && (
            <span className="font-body text-body-sm opacity-85">
              · Save edits to refresh
            </span>
          )}
        </div>

        {(issueCount === 0 || passItems.length > 0) && (
          <button
            type="button"
            aria-expanded={showDetails}
            onClick={() => setShowDetails((prev) => !prev)}
            className="inline-flex items-center gap-1 px-gutter-sm py-0.5 rounded bg-surface-container-lowest/75 hover:bg-surface-container-lowest border border-outline-variant/70 font-label text-label-sm text-on-surface focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change"
          >
            <span>
              {issueCount === 0
                ? showDetails
                  ? "Hide checks"
                  : "Show checks"
                : showDetails
                  ? "Hide passed checks"
                  : `Show ${passItems.length} passed`}
            </span>
            <span
              className="material-symbols-outlined text-body-md"
              aria-hidden="true"
            >
              {showDetails ? "expand_less" : "expand_more"}
            </span>
          </button>
        )}
      </div>

      {visibleItems.length > 0 && (
        <ul className="flex flex-col gap-gutter-xs border-t border-outline-variant/40 pt-gutter-xs">
          {visibleItems.map((item, idx) => (
            <li
              key={`${item.code}-${item.sessionNumber ?? "all"}-${idx}`}
              className="flex items-start gap-gutter-xs font-body text-body-sm text-on-surface"
            >
              <span
                className={`material-symbols-outlined text-body-md shrink-0 mt-0.5 ${severityIconClass(item.severity)}`}
                aria-hidden="true"
              >
                {severityIcon(item.severity)}
              </span>
              <span>
                <strong className="font-label">{item.label}:</strong>{" "}
                {item.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
