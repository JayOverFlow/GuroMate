import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import {
  dedupeOrdered,
  formatComponentLabel,
  parseLearningAreaComponents,
} from "../engine/lessonHelpers";
import type {
  DailyLessonLog,
  DailyLessonPlan,
  TleComponent,
} from "../engine/types";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import {
  buildDeleteDllPrompt,
  buildDeleteDlpPrompt,
} from "../utils/confirmAction";
import {
  buildDeletedLessonNotice,
  type LessonKind,
  type LessonViewMode,
} from "../utils/workspaceRouting";
import { readErrorMessage } from "./lessonViewHelpers";

export interface LessonLibraryNotice {
  tone: "info" | "success" | "error";
  text: string;
}

export interface LessonLibraryWorkspaceProps {
  notice?: LessonLibraryNotice | null;
  onDismissNotice?: () => void;
  onNewDll: () => void;
  onNewDlp: () => void;
  onOpenDll: (dllId: string, viewMode?: LessonViewMode) => void;
  onOpenDlp: (dlpId: string, viewMode?: LessonViewMode) => void;
}

interface LibraryCardEntry {
  kind: LessonKind;
  id: string;
  lessonTitle: string;
  gradeAndSection: string;
  learningAreas: string;
  components: TleComponent[];
  updatedAt: string;
  createdAt: string;
}

const UPDATED_AT_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatUpdatedAt(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return isoTimestamp;
  }
  return UPDATED_AT_FORMATTER.format(date);
}

function getDllComponents(dll: DailyLessonLog): TleComponent[] {
  const fromSessions = dll.sessions.flatMap((session) => session.components);
  const fromAreas = parseLearningAreaComponents(dll.learningAreas);
  return dedupeOrdered([...fromSessions, ...fromAreas]);
}

function toTimestamp(iso: string): number {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? 0 : time;
}

export function LessonLibraryWorkspace({
  notice,
  onDismissNotice,
  onNewDll,
  onNewDlp,
  onOpenDll,
  onOpenDlp,
}: LessonLibraryWorkspaceProps) {
  const headingId = useId();
  const confirmDialog = useConfirmDialog();

  const [dlls, setDlls] = useState<DailyLessonLog[]>([]);
  const [dlps, setDlps] = useState<DailyLessonPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [localStatus, setLocalStatus] = useState<LessonLibraryNotice | null>(
    null,
  );

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    try {
      const [dllRes, dlpRes] = await Promise.all([
        fetch("/api/dlls"),
        fetch("/api/dlps"),
      ]);
      if (!dllRes.ok) throw new Error(await readErrorMessage(dllRes));
      if (!dlpRes.ok) throw new Error(await readErrorMessage(dlpRes));

      const [loadedDlls, loadedDlps] = (await Promise.all([
        dllRes.json(),
        dlpRes.json(),
      ])) as [DailyLessonLog[], DailyLessonPlan[]];

      setDlls(loadedDlls);
      setDlps(loadedDlps);
    } catch (err) {
      setLocalStatus({
        tone: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  const entries = useMemo<LibraryCardEntry[]>(() => {
    const dllEntries: LibraryCardEntry[] = dlls.map((dll) => ({
      kind: "dll",
      id: dll.id,
      lessonTitle: dll.lessonTitle,
      gradeAndSection: dll.gradeAndSection,
      learningAreas: dll.learningAreas,
      components: getDllComponents(dll),
      updatedAt: dll.updatedAt,
      createdAt: dll.createdAt,
    }));

    const dlpEntries: LibraryCardEntry[] = dlps.map((dlp) => ({
      kind: "dlp",
      id: dlp.id,
      lessonTitle: dlp.lessonTitle,
      gradeAndSection: dlp.gradeAndSection,
      learningAreas: dlp.learningAreas,
      components: parseLearningAreaComponents(dlp.learningAreas),
      updatedAt: dlp.updatedAt,
      createdAt: dlp.createdAt,
    }));

    return [...dllEntries, ...dlpEntries].sort(
      (a, b) => toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt),
    );
  }, [dlls, dlps]);

  const activeBanner = localStatus ?? notice ?? null;

  function dismissBanner() {
    if (localStatus) {
      setLocalStatus(null);
    } else {
      onDismissNotice?.();
    }
  }

  function requestDeleteEntry(entry: LibraryCardEntry) {
    const prompt =
      entry.kind === "dll"
        ? buildDeleteDllPrompt(entry.lessonTitle)
        : buildDeleteDlpPrompt(entry.lessonTitle);

    confirmDialog.requestConfirm(prompt, async () => {
      onDismissNotice?.();
      setLocalStatus(null);
      const endpoint =
        entry.kind === "dll"
          ? `/api/dlls/${encodeURIComponent(entry.id)}`
          : `/api/dlps/${encodeURIComponent(entry.id)}`;
      const res = await fetch(endpoint, { method: "DELETE" });
      if (!res.ok) throw new Error(await readErrorMessage(res));

      if (entry.kind === "dll") {
        setDlls((prev) => prev.filter((item) => item.id !== entry.id));
      } else {
        setDlps((prev) => prev.filter((item) => item.id !== entry.id));
      }

      setLocalStatus({
        tone: "success",
        text: buildDeletedLessonNotice(entry.kind, entry.lessonTitle),
      });
    });
  }

  function openEntry(entry: LibraryCardEntry, viewMode: LessonViewMode) {
    if (entry.kind === "dll") {
      onOpenDll(entry.id, viewMode);
    } else {
      onOpenDlp(entry.id, viewMode);
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-gutter-lg"
    >
      {/* Page Title & Primary Creation Actions */}
      <div className="flex flex-wrap items-end justify-between gap-gutter-md">
        <div className="flex flex-col gap-gutter-xs">
          <h1
            id={headingId}
            tabIndex={-1}
            className="font-headline text-headline-lg text-on-surface text-balance"
          >
            Lesson Library
          </h1>
          <p className="font-body text-body-md text-on-surface-variant">
            Browse, edit, read, export, and manage your saved Daily Lesson Logs
            (DLLs) and Daily Lesson Plans (DLPs).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-gutter-sm">
          <button
            type="button"
            onClick={onNewDll}
            className="inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-sm rounded bg-primary text-on-primary font-label text-label-lg hover:bg-primary-container focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change"
          >
            <span
              className="material-symbols-outlined text-title-md"
              aria-hidden="true"
            >
              add
            </span>
            <span>New DLL</span>
          </button>

          <button
            type="button"
            onClick={onNewDlp}
            className="inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-sm rounded bg-surface-container-lowest text-primary border border-primary font-label text-label-lg hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change"
          >
            <span
              className="material-symbols-outlined text-title-md"
              aria-hidden="true"
            >
              add
            </span>
            <span>New DLP</span>
          </button>
        </div>
      </div>

      {/* Status / Redirect Notice Banner */}
      {activeBanner && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-md border p-gutter-md flex items-center justify-between gap-gutter-md font-body text-body-md ${
            activeBanner.tone === "error"
              ? "border-error bg-error-container text-on-error-container"
              : activeBanner.tone === "info"
                ? "border-warning bg-warning-container/60 text-on-warning-container"
                : "border-success bg-success-container/60 text-on-success-container"
          }`}
        >
          <div className="flex items-center gap-gutter-sm min-w-0">
            <span
              className="material-symbols-outlined text-title-lg shrink-0"
              aria-hidden="true"
            >
              {activeBanner.tone === "error"
                ? "error"
                : activeBanner.tone === "info"
                  ? "info"
                  : "check_circle"}
            </span>
            <span>{activeBanner.text}</span>
          </div>

          <button
            type="button"
            aria-label="Dismiss notice"
            onClick={dismissBanner}
            className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-surface-container-lowest/40 focus-visible:outline-2 focus-visible:outline-primary shrink-0"
          >
            <span
              className="material-symbols-outlined text-title-md"
              aria-hidden="true"
            >
              close
            </span>
          </button>
        </div>
      )}

      {/* Library Content */}
      {loading ? (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-lg font-body text-body-md text-on-surface-variant">
          Loading saved Daily Lesson Logs and Daily Lesson Plans...
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-xl flex flex-col items-start gap-gutter-md">
          <div className="flex flex-col gap-gutter-xs">
            <h2 className="font-title text-title-lg text-on-surface">
              Your Lesson Library is empty
            </h2>
            <p className="font-body text-body-md text-on-surface-variant">
              Create your first 5-Session Daily Lesson Log (DLL) or
              single-session Daily Lesson Plan (DLP) to get started.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-gutter-sm">
            <button
              type="button"
              onClick={onNewDll}
              className="inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-sm rounded bg-primary text-on-primary font-label text-label-lg hover:bg-primary-container focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change"
            >
              <span
                className="material-symbols-outlined text-title-md"
                aria-hidden="true"
              >
                view_week
              </span>
              <span>New 5-Session DLL</span>
            </button>
            <button
              type="button"
              onClick={onNewDlp}
              className="inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-sm rounded bg-surface-container-lowest text-primary border border-primary font-label text-label-lg hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change"
            >
              <span
                className="material-symbols-outlined text-title-md"
                aria-hidden="true"
              >
                splitscreen
              </span>
              <span>New Single-Session DLP</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-gutter-md">
          {entries.map((entry) => {
            const docxHref =
              entry.kind === "dll"
                ? `/api/dlls/${encodeURIComponent(entry.id)}/docx`
                : `/api/dlps/${encodeURIComponent(entry.id)}/docx`;

            return (
              <article
                key={`${entry.kind}-${entry.id}`}
                className="bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-lg flex flex-col gap-gutter-md hover:border-outline transition-colors duration-state-change"
              >
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-gutter-md">
                  {/* Metadata */}
                  <div className="flex flex-col gap-gutter-sm min-w-0">
                    <div className="flex flex-wrap items-center gap-gutter-xs">
                      <span
                        className={`px-gutter-sm py-0.5 rounded-full font-label text-label-sm ${
                          entry.kind === "dll"
                            ? "bg-primary/10 text-primary border border-primary/20"
                            : "bg-surface-variant text-on-surface-variant border border-outline-variant"
                        }`}
                      >
                        {entry.kind === "dll"
                          ? "DLL · 5 Sessions"
                          : "DLP · 1 Session"}
                      </span>

                      {entry.components.length > 0 ? (
                        entry.components.map((component) => (
                          <span
                            key={component}
                            className="px-gutter-sm py-0.5 rounded-full bg-tertiary-container text-on-tertiary-container font-label text-label-sm"
                          >
                            {formatComponentLabel(component)}
                          </span>
                        ))
                      ) : entry.learningAreas.trim() ? (
                        <span className="px-gutter-sm py-0.5 rounded-full bg-tertiary-container text-on-tertiary-container font-label text-label-sm">
                          {entry.learningAreas}
                        </span>
                      ) : null}
                    </div>

                    <h2 className="font-title text-title-lg text-on-surface text-balance">
                      {entry.lessonTitle}
                    </h2>

                    <div className="flex flex-wrap items-center gap-x-gutter-md gap-y-gutter-xs font-body text-body-sm text-on-surface-variant">
                      <span className="inline-flex items-center gap-gutter-xs">
                        <span
                          className="material-symbols-outlined text-body-md"
                          aria-hidden="true"
                        >
                          groups
                        </span>
                        <span>{entry.gradeAndSection}</span>
                      </span>

                      <span className="inline-flex items-center gap-gutter-xs">
                        <span
                          className="material-symbols-outlined text-body-md"
                          aria-hidden="true"
                        >
                          schedule
                        </span>
                        <span>
                          Updated{" "}
                          <time
                            dateTime={entry.updatedAt}
                            className="font-mono text-body-sm tabular-nums"
                          >
                            {formatUpdatedAt(entry.updatedAt)}
                          </time>
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Per-Card Actions */}
                  <div className="flex flex-wrap items-center gap-gutter-xs shrink-0">
                    <button
                      type="button"
                      onClick={() => openEntry(entry, "edit")}
                      className="inline-flex items-center justify-center gap-gutter-xs px-gutter-sm py-gutter-xs rounded bg-primary text-on-primary font-label text-label-md hover:bg-primary-container focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change"
                    >
                      <span
                        className="material-symbols-outlined text-body-md"
                        aria-hidden="true"
                      >
                        edit
                      </span>
                      <span>Edit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openEntry(entry, "markdown")}
                      className="inline-flex items-center justify-center gap-gutter-xs px-gutter-sm py-gutter-xs rounded bg-surface-container-lowest text-on-surface border border-outline-variant font-label text-label-md hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change"
                    >
                      <span
                        className="material-symbols-outlined text-body-md"
                        aria-hidden="true"
                      >
                        article
                      </span>
                      <span>Read</span>
                    </button>

                    <a
                      href={docxHref}
                      download
                      className="inline-flex items-center justify-center gap-gutter-xs px-gutter-sm py-gutter-xs rounded bg-surface-container-lowest text-primary border border-primary font-label text-label-md hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change"
                    >
                      <span
                        className="material-symbols-outlined text-body-md"
                        aria-hidden="true"
                      >
                        download
                      </span>
                      <span>Export ILAW .docx</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => requestDeleteEntry(entry)}
                      className="inline-flex items-center justify-center gap-gutter-xs px-gutter-sm py-gutter-xs rounded bg-surface-container-lowest text-error border border-outline-variant font-label text-label-md hover:bg-error-container/30 focus-visible:outline-2 focus-visible:outline-error transition-colors duration-state-change"
                    >
                      <span
                        className="material-symbols-outlined text-body-md"
                        aria-hidden="true"
                      >
                        delete
                      </span>
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        state={confirmDialog.state}
        onConfirm={() => void confirmDialog.confirm()}
        onCancel={confirmDialog.cancel}
      />
    </section>
  );
}
