import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { formatComponentLabel } from "../engine/lessonHelpers";
import type {
  DailyLessonLog,
  DailyLessonPlan,
  GuroMateSettings,
  TleComponent,
} from "../engine/types";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import {
  buildDeleteDllPrompt,
  buildDeleteDlpPrompt,
} from "../utils/confirmAction";
import {
  clearLessonLibraryFilters,
  DEFAULT_LESSON_LIBRARY_FILTERS,
  queryLessonLibrary,
  type LessonLibraryEntry,
  type LessonLibraryFilters,
  type LessonLibrarySort,
  type LessonTypeFilter,
} from "../utils/lessonLibraryQuery";
import {
  buildDeletedLessonNotice,
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
  onOpenSettings: () => void;
}

const TYPE_TABS: readonly { value: LessonTypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "dll", label: "DLLs" },
  { value: "dlp", label: "DLPs" },
];

const SORT_OPTIONS: readonly { value: LessonLibrarySort; label: string }[] = [
  { value: "updated", label: "Recently Updated" },
  { value: "created", label: "Recently Created" },
  { value: "title", label: "Title A–Z" },
];

const UPDATED_AT_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const FILTER_CONTROL_CLASS =
  "w-full px-gutter-sm py-gutter-xs rounded bg-surface-container-lowest border border-outline-variant font-body text-body-md text-on-surface focus:border-primary focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change";

function formatUpdatedAt(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return isoTimestamp;
  }
  return UPDATED_AT_FORMATTER.format(date);
}

export function LessonLibraryWorkspace({
  notice,
  onDismissNotice,
  onNewDll,
  onNewDlp,
  onOpenDll,
  onOpenDlp,
  onOpenSettings,
}: LessonLibraryWorkspaceProps) {
  const headingId = useId();
  const baseId = useId();
  const searchInputId = `${baseId}-search`;
  const componentSelectId = `${baseId}-component`;
  const gradeSectionSelectId = `${baseId}-grade-section`;
  const sortSelectId = `${baseId}-sort`;

  const confirmDialog = useConfirmDialog();

  const [dlls, setDlls] = useState<DailyLessonLog[]>([]);
  const [dlps, setDlps] = useState<DailyLessonPlan[]>([]);
  const [settings, setSettings] = useState<GuroMateSettings | null>(null);
  const [filters, setFilters] = useState<LessonLibraryFilters>(
    DEFAULT_LESSON_LIBRARY_FILTERS,
  );
  const [loading, setLoading] = useState(true);
  const [localStatus, setLocalStatus] = useState<LessonLibraryNotice | null>(
    null,
  );

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    try {
      const [dllRes, dlpRes, settingsRes] = await Promise.all([
        fetch("/api/dlls"),
        fetch("/api/dlps"),
        fetch("/api/settings").catch(() => null),
      ]);
      if (!dllRes.ok) throw new Error(await readErrorMessage(dllRes));
      if (!dlpRes.ok) throw new Error(await readErrorMessage(dlpRes));

      const [loadedDlls, loadedDlps, loadedSettings] = (await Promise.all([
        dllRes.json(),
        dlpRes.json(),
        settingsRes && settingsRes.ok ? settingsRes.json() : Promise.resolve(null),
      ])) as [DailyLessonLog[], DailyLessonPlan[], GuroMateSettings | null];

      setDlls(loadedDlls);
      setDlps(loadedDlps);
      setSettings(loadedSettings);
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

  const library = useMemo(
    () =>
      queryLessonLibrary({
        dlls,
        dlps,
        settings,
        filters,
      }),
    [dlls, dlps, settings, filters],
  );

  const hasMissingComponentOption =
    filters.component !== "" &&
    !library.componentOptions.some((opt) => opt.value === filters.component);

  const hasMissingGradeSectionOption =
    filters.gradeAndSection !== "" &&
    !library.gradeSectionOptions.includes(filters.gradeAndSection);

  const activeBanner = localStatus ?? notice ?? null;

  function dismissBanner() {
    if (localStatus) {
      setLocalStatus(null);
    } else {
      onDismissNotice?.();
    }
  }

  function handleClearFilters() {
    setFilters((prev) => clearLessonLibraryFilters(prev));
  }

  function requestDeleteEntry(entry: LessonLibraryEntry) {
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

  function openEntry(entry: LessonLibraryEntry, viewMode: LessonViewMode) {
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
            Browse, search, filter, read, export, and manage your Daily Lesson
            Logs (DLLs) and Daily Lesson Plans (DLPs).
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

      {/* Compact Summary Counts */}
      {!loading && (
        <div
          aria-label="Lesson Library summary counts"
          className="flex flex-wrap items-center gap-gutter-sm"
        >
          <div className="inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-xs rounded-md bg-surface-container-lowest border border-outline-variant">
            <span className="font-label text-label-md text-on-surface-variant">
              Total
            </span>
            <span className="font-mono text-title-md font-semibold text-on-surface tabular-nums">
              {library.counts.total}
            </span>
          </div>

          <div className="inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-xs rounded-md bg-surface-container-lowest border border-outline-variant">
            <span className="font-label text-label-md text-on-surface-variant">
              DLLs
            </span>
            <span className="font-mono text-title-md font-semibold text-primary tabular-nums">
              {library.counts.dlls}
            </span>
          </div>

          <div className="inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-xs rounded-md bg-surface-container-lowest border border-outline-variant">
            <span className="font-label text-label-md text-on-surface-variant">
              DLPs
            </span>
            <span className="font-mono text-title-md font-semibold text-on-surface tabular-nums">
              {library.counts.dlps}
            </span>
          </div>
        </div>
      )}

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
          Loading Daily Lesson Logs and Daily Lesson Plans...
        </div>
      ) : library.counts.total === 0 ? (
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

          {library.needsSetup && (
            <div className="w-full rounded-md border border-outline-variant bg-surface-container-low p-gutter-md flex flex-wrap items-center justify-between gap-gutter-md">
              <div className="flex items-start gap-gutter-sm min-w-0">
                <span
                  className="material-symbols-outlined text-title-md text-primary shrink-0 mt-0.5"
                  aria-hidden="true"
                >
                  tune
                </span>
                <p className="font-body text-body-sm text-on-surface-variant">
                  Before generating lessons, finish configuring your Teacher
                  Profile signatories and AI provider connection.
                </p>
              </div>
              <a
                href="#settings"
                onClick={(event) => {
                  event.preventDefault();
                  onOpenSettings();
                }}
                className="inline-flex items-center justify-center gap-gutter-xs px-gutter-sm py-gutter-xs rounded bg-surface-container-lowest text-primary border border-primary/40 font-label text-label-md hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change shrink-0"
              >
                <span>Profile &amp; AI Settings</span>
                <span
                  className="material-symbols-outlined text-body-md"
                  aria-hidden="true"
                >
                  arrow_forward
                </span>
              </a>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-gutter-md">
          {/* Discovery, Filter & Sort Toolbar */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-md flex flex-col gap-gutter-md">
            <div className="flex flex-wrap items-center justify-between gap-gutter-sm">
              {/* Type Filter Tabs */}
              <div
                role="group"
                aria-label="Filter by lesson type"
                className="inline-flex items-center rounded bg-surface-container-low border border-outline-variant p-0.5 gap-0.5"
              >
                {TYPE_TABS.map((tab) => {
                  const isActive = filters.type === tab.value;
                  const count =
                    tab.value === "all"
                      ? library.counts.total
                      : tab.value === "dll"
                        ? library.counts.dlls
                        : library.counts.dlps;
                  return (
                    <button
                      key={tab.value}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() =>
                        setFilters((prev) => ({ ...prev, type: tab.value }))
                      }
                      className={`inline-flex items-center gap-gutter-xs px-gutter-sm py-gutter-xs rounded font-label text-label-md transition-colors duration-state-change focus-visible:outline-2 focus-visible:outline-primary ${
                        isActive
                          ? "bg-primary text-on-primary"
                          : "text-on-surface-variant hover:bg-surface-container"
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span
                        className={`font-mono text-label-sm tabular-nums ${
                          isActive
                            ? "text-on-primary/85"
                            : "text-on-surface-variant/80"
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {library.hasActiveFilters && (
                <div className="flex items-center gap-gutter-sm">
                  <span className="font-body text-body-sm text-on-surface-variant tabular-nums">
                    Showing {library.entries.length} of {library.counts.total}
                  </span>
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="inline-flex items-center gap-gutter-xs px-gutter-sm py-gutter-xs rounded border border-outline-variant bg-surface-container-lowest text-primary font-label text-label-md hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change"
                  >
                    <span
                      className="material-symbols-outlined text-body-md"
                      aria-hidden="true"
                    >
                      filter_alt_off
                    </span>
                    <span>Clear filters</span>
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-gutter-sm items-end">
              {/* Live Keyword Search */}
              <div className="flex flex-col gap-gutter-xs md:col-span-2 lg:col-span-5">
                <label
                  htmlFor={searchInputId}
                  className="font-label text-label-sm text-on-surface-variant"
                >
                  Search Lesson Library
                </label>
                <div className="relative flex items-center">
                  <span
                    className="material-symbols-outlined text-title-md text-on-surface-variant absolute left-2.5 pointer-events-none"
                    aria-hidden="true"
                  >
                    search
                  </span>
                  <input
                    id={searchInputId}
                    type="search"
                    value={filters.query}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        query: event.target.value,
                      }))
                    }
                    placeholder="Title, Grade & Section, TLE Component / SHS Core, competencies, references..."
                    className={`${FILTER_CONTROL_CLASS} pl-9`}
                  />
                </div>
              </div>

              {/* Dynamic TLE Component / SHS Core Filter */}
              <div className="flex flex-col gap-gutter-xs lg:col-span-3">
                <label
                  htmlFor={componentSelectId}
                  className="font-label text-label-sm text-on-surface-variant"
                >
                  TLE Component / SHS Core
                </label>
                <select
                  id={componentSelectId}
                  value={filters.component}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      component: event.target.value as TleComponent | "",
                    }))
                  }
                  className={FILTER_CONTROL_CLASS}
                >
                  <option value="">All Components</option>
                  {hasMissingComponentOption && filters.component !== "" && (
                    <option value={filters.component}>
                      {formatComponentLabel(filters.component)}
                    </option>
                  )}
                  {library.componentOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Dynamic Grade & Section Filter */}
              <div className="flex flex-col gap-gutter-xs lg:col-span-2">
                <label
                  htmlFor={gradeSectionSelectId}
                  className="font-label text-label-sm text-on-surface-variant"
                >
                  Grade &amp; Section
                </label>
                <select
                  id={gradeSectionSelectId}
                  value={filters.gradeAndSection}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      gradeAndSection: event.target.value,
                    }))
                  }
                  className={FILTER_CONTROL_CLASS}
                >
                  <option value="">All Sections</option>
                  {hasMissingGradeSectionOption && (
                    <option value={filters.gradeAndSection}>
                      {filters.gradeAndSection}
                    </option>
                  )}
                  {library.gradeSectionOptions.map((section) => (
                    <option key={section} value={section}>
                      {section}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sort Selector */}
              <div className="flex flex-col gap-gutter-xs lg:col-span-2">
                <label
                  htmlFor={sortSelectId}
                  className="font-label text-label-sm text-on-surface-variant"
                >
                  Sort by
                </label>
                <select
                  id={sortSelectId}
                  value={filters.sort}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      sort: event.target.value as LessonLibrarySort,
                    }))
                  }
                  className={FILTER_CONTROL_CLASS}
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Filtered Empty State or Matching Lesson Cards */}
          {library.entries.length === 0 ? (
            <div className="bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-xl flex flex-col items-start gap-gutter-md">
              <div className="flex items-start gap-gutter-sm">
                <span
                  className="material-symbols-outlined text-headline-md text-on-surface-variant shrink-0"
                  aria-hidden="true"
                >
                  search_off
                </span>
                <div className="flex flex-col gap-gutter-xs">
                  <h2 className="font-title text-title-lg text-on-surface">
                    No lessons match your filters
                  </h2>
                  <p className="font-body text-body-md text-on-surface-variant">
                    Try adjusting your search keywords, lesson type, TLE
                    Component / SHS Core, or Grade &amp; Section filter.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClearFilters}
                className="inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-sm rounded bg-primary text-on-primary font-label text-label-lg hover:bg-primary-container focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change"
              >
                <span
                  className="material-symbols-outlined text-title-md"
                  aria-hidden="true"
                >
                  filter_alt_off
                </span>
                <span>Clear filters</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-gutter-md">
              {library.entries.map((entry) => {
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
