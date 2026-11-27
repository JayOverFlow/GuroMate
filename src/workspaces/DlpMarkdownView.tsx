import { useMemo, type ReactNode } from "react";
import {
  CopyMarkdownButton,
  LessonRichText,
  renderInlineTokens,
} from "../components/LessonRichText";
import { renderDlpMarkdown } from "../engine/dlp";
import type { DailyLessonPlan } from "../engine/types";
import {
  formatOrphanedDlpLabel,
  type DlpDerivationLineage,
} from "../utils/lessonLibraryQuery";
import { serializeHashRoute } from "../utils/workspaceRouting";
import {
  buildDlpReadingSections,
  formatDlpSourceLabel,
  type DlpReadingSection,
} from "./dlpReadingHelpers";

export interface DlpMarkdownViewProps {
  dlp: DailyLessonPlan;
  sourceDllTitle?: string;
  lineage?: DlpDerivationLineage | null;
  onOpenParentDll?: (dllId: string) => void;
  toolbarActions?: ReactNode;
}

function IntentionsListColumn({
  title,
  items,
}: {
  title: string;
  items: readonly string[];
}) {
  const cleaned = items.map((item) => item.trim()).filter(Boolean);
  return (
    <div className="flex flex-col gap-gutter-xs rounded bg-surface-container-low/60 border border-outline-variant/70 p-gutter-md min-w-0">
      <h3 className="font-label text-label-md uppercase tracking-wide text-primary">
        {title}
      </h3>
      {cleaned.length === 0 ? (
        <p className="font-body text-body-sm italic text-on-surface-variant">
          —
        </p>
      ) : cleaned.length === 1 ? (
        <p className="font-body text-body-sm text-on-surface leading-relaxed">
          {renderInlineTokens(cleaned[0]!)}
        </p>
      ) : (
        <ul className="list-disc pl-4 flex flex-col gap-1 font-body text-body-sm text-on-surface marker:text-primary">
          {cleaned.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInlineTokens(item)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PairedActivitySectionCard({
  section,
}: {
  section: DlpReadingSection;
}) {
  return (
    <section
      aria-label={section.heading}
      className="bg-surface-container-lowest border border-outline-variant rounded-md overflow-hidden"
    >
      {/* Section Header */}
      <header className="bg-surface-container-low border-b border-outline-variant px-gutter-lg py-gutter-md flex flex-wrap items-center justify-between gap-gutter-sm">
        <h3 className="font-title text-title-lg text-primary">
          {section.heading}
        </h3>
      </header>

      {/* Desktop Column Header Strip */}
      <div
        aria-hidden="true"
        className="hidden lg:grid lg:grid-cols-2 border-b border-outline-variant bg-surface-container/60 divide-x divide-outline-variant"
      >
        <div className="px-gutter-lg py-gutter-xs font-label text-label-md uppercase tracking-wide text-primary">
          Teacher&apos;s Activity
        </div>
        <div className="px-gutter-lg py-gutter-xs font-label text-label-md uppercase tracking-wide text-tertiary">
          Student&apos;s Activity
        </div>
      </div>

      {/* Paired Teacher's Activity | Student's Activity Rows */}
      <div className="divide-y divide-outline-variant">
        {section.rows.map((row) => (
          <article key={row.key} aria-label={row.label}>
            <div className="bg-surface-container-low/50 border-b border-outline-variant/70 px-gutter-lg py-gutter-xs">
              <h4 className="font-label text-label-md uppercase tracking-wide text-on-surface">
                {row.label}
              </h4>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-outline-variant">
              <div className="p-gutter-lg flex flex-col gap-gutter-xs min-w-0">
                <h5 className="lg:sr-only font-label text-label-md uppercase tracking-wide text-primary">
                  Teacher&apos;s Activity
                </h5>
                <LessonRichText
                  text={row.pair.teacherActivity}
                  emptyPlaceholder={row.emptyPlaceholder}
                />
              </div>

              <div className="p-gutter-lg flex flex-col gap-gutter-xs min-w-0">
                <h5 className="lg:sr-only font-label text-label-md uppercase tracking-wide text-tertiary">
                  Student&apos;s Activity
                </h5>
                <LessonRichText
                  text={row.pair.studentActivity}
                  emptyPlaceholder={row.emptyPlaceholder}
                />
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function DlpMarkdownView({
  dlp,
  sourceDllTitle,
  lineage,
  onOpenParentDll,
  toolbarActions,
}: DlpMarkdownViewProps) {
  const canonicalMarkdown = useMemo(() => renderDlpMarkdown(dlp), [dlp]);
  const sections = useMemo(() => buildDlpReadingSections(dlp), [dlp]);
  const fallbackSourceLabel =
    lineage === undefined ? formatDlpSourceLabel(dlp, sourceDllTitle) : null;

  return (
    <div className="w-full flex flex-col gap-gutter-lg">
      {/* Compact Multi-Column Header & Intentions Band */}
      <section
        aria-label="Header and Intentions"
        className="bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-lg flex flex-col gap-gutter-md"
      >
        <div className="flex flex-wrap items-start justify-between gap-gutter-md pb-gutter-sm border-b border-outline-variant">
          <div className="flex flex-col gap-gutter-xs min-w-0">
            <h2 className="font-headline text-headline-md text-on-surface">
              {dlp.lessonTitle || "Daily Lesson Plan"}
            </h2>
            <div className="flex flex-wrap items-center gap-gutter-xs">
              {dlp.learningAreas && (
                <span className="px-gutter-sm py-0.5 rounded-full bg-tertiary-container text-on-tertiary-container font-label text-label-sm">
                  {dlp.learningAreas}
                </span>
              )}
              {dlp.gradeAndSection && (
                <span className="px-gutter-sm py-0.5 rounded-full bg-surface-variant text-on-surface-variant font-label text-label-sm">
                  {dlp.gradeAndSection}
                </span>
              )}
              <span className="px-gutter-sm py-0.5 rounded-full bg-surface-container text-on-surface-variant font-mono text-label-sm tabular-nums">
                1 Session
              </span>
              {lineage?.status === "linked" ? (
                <a
                  href={serializeHashRoute({
                    workspace: "dll",
                    lessonId: lineage.parentDllId,
                    viewMode: "edit",
                  })}
                  onClick={(event) => {
                    if (
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey ||
                      event.button !== 0 ||
                      !onOpenParentDll
                    ) {
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
              ) : lineage?.status === "orphaned" ? (
                <span className="inline-flex items-center gap-1 px-gutter-sm py-0.5 rounded-full bg-warning-container text-on-warning-container font-label text-label-sm">
                  <span
                    className="material-symbols-outlined text-body-sm"
                    aria-hidden="true"
                  >
                    link_off
                  </span>
                  <span>{formatOrphanedDlpLabel(lineage.sessionNumber)}</span>
                </span>
              ) : fallbackSourceLabel ? (
                <span className="px-gutter-sm py-0.5 rounded-full bg-success-container text-on-success-container font-label text-label-sm">
                  {fallbackSourceLabel}
                </span>
              ) : null}
            </div>
            <p className="font-body text-body-sm text-on-surface-variant">
              <strong className="font-semibold text-on-surface">
                References:
              </strong>{" "}
              {dlp.references.trim() ? renderInlineTokens(dlp.references) : "—"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-gutter-xs shrink-0">
            <CopyMarkdownButton markdown={canonicalMarkdown} />
            {toolbarActions}
          </div>
        </div>

        {/* Row 1: Learning Competencies, Content Standards, Performance Standards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter-md">
          <IntentionsListColumn
            title="Learning Competencies"
            items={dlp.intentions.learningCompetencies}
          />
          <IntentionsListColumn
            title="Content Standards"
            items={dlp.intentions.contentStandards}
          />
          <IntentionsListColumn
            title="Performance Standards"
            items={dlp.intentions.performanceStandards}
          />
        </div>

        {/* Row 2: Learning Objectives (2/3) + Learner Context (1/3) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter-md">
          <div className="md:col-span-2 flex flex-col gap-gutter-xs rounded bg-surface-container-low/60 border border-outline-variant/70 p-gutter-md min-w-0">
            <h3 className="font-label text-label-md uppercase tracking-wide text-primary">
              Learning Objectives
            </h3>
            <LessonRichText text={dlp.intentions.learningObjectives} />
          </div>

          <div className="md:col-span-1 flex flex-col gap-gutter-xs rounded bg-surface-container-low/60 border border-outline-variant/70 p-gutter-md min-w-0">
            <h3 className="font-label text-label-md uppercase tracking-wide text-primary">
              Learner Context
            </h3>
            <LessonRichText
              text={dlp.intentions.learnerContext}
              emptyPlaceholder="Left blank for manual completion"
              className="text-body-sm"
            />
          </div>
        </div>
      </section>

      {/* Paired ILAW Reading Sections (II. Learning Experience, III. Assessing Learning, IV. Ways Forward) */}
      <div className="flex flex-col gap-gutter-lg">
        {sections.map((section) => (
          <PairedActivitySectionCard key={section.id} section={section} />
        ))}
      </div>
    </div>
  );
}
