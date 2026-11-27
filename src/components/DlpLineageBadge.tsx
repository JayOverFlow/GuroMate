import {
  formatOrphanedDlpLabel,
  type DlpDerivationLineage,
} from "../utils/lessonLibraryQuery";
import {
  isPlainLeftClick,
  serializeHashRoute,
} from "../utils/workspaceRouting";

export interface DlpLineageBadgeProps {
  lineage: DlpDerivationLineage | null | undefined;
  onOpenParentDll?: (dllId: string) => void;
}

export function DlpLineageBadge({
  lineage,
  onOpenParentDll,
}: DlpLineageBadgeProps) {
  if (!lineage) return null;

  if (lineage.status === "linked") {
    return (
      <a
        href={serializeHashRoute({
          workspace: "dll",
          lessonId: lineage.parentDllId,
          viewMode: "edit",
        })}
        onClick={(event) => {
          if (!isPlainLeftClick(event) || !onOpenParentDll) {
            return;
          }
          event.preventDefault();
          onOpenParentDll(lineage.parentDllId);
        }}
        className="inline-flex items-center gap-1 px-gutter-sm py-0.5 rounded-full bg-success-container text-on-success-container font-label text-label-sm hover:underline focus-visible:outline-2 focus-visible:outline-primary"
      >
        <span
          className="material-symbols-outlined text-body-sm"
          aria-hidden="true"
        >
          link
        </span>
        <span>
          Derived from {lineage.parentDllTitle}
          {lineage.sessionNumber !== undefined
            ? ` · Session ${lineage.sessionNumber}`
            : ""}
        </span>
      </a>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-gutter-sm py-0.5 rounded-full bg-warning-container text-on-warning-container font-label text-label-sm">
      <span
        className="material-symbols-outlined text-body-sm"
        aria-hidden="true"
      >
        link_off
      </span>
      <span>{formatOrphanedDlpLabel(lineage.sessionNumber)}</span>
    </span>
  );
}
