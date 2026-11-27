import { useMemo, useRef, type ReactNode } from "react";
import {
  CopyMarkdownButton,
  LessonRichText,
  renderInlineTokens,
} from "../components/LessonRichText";
import { renderDllMarkdown } from "../engine/dll";
import { formatLearningAreas } from "../engine/lessonHelpers";
import type {
  DailyLessonLog,
  DllSessionPlan,
  SessionNumber,
} from "../engine/types";

export interface DllMarkdownViewProps {
  dll: DailyLessonLog;
  onDeriveDlp?: (dllId: string, sessionNumber: SessionNumber) => void;
  onCreateQuiz?: (dllId: string, sessionNumber: SessionNumber) => void;
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
    <div className="flex flex-col gap-gutter-xs rounded bg-surface-container-low/60 border border-outline-variant/70 p-gutter-md">
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

function SessionFieldBlock({
  label,
  value,
  emptyPlaceholder,
}: {
  label: string;
  value: string;
  emptyPlaceholder?: string;
}) {
  return (
    <div className="flex flex-col gap-gutter-xs">
      <h5 className="font-label text-label-md text-on-surface-variant">
        {label}
      </h5>
      <LessonRichText text={value} emptyPlaceholder={emptyPlaceholder} />
    </div>
  );
}

function InstructionalSessionCard({
  dllId,
  session,
  sectionRef,
  onDeriveDlp,
  onCreateQuiz,
}: {
  dllId: string;
  session: DllSessionPlan;
  sectionRef: (el: HTMLElement | null) => void;
  onDeriveDlp?: (dllId: string, sessionNumber: SessionNumber) => void;
  onCreateQuiz?: (dllId: string, sessionNumber: SessionNumber) => void;
}) {
  const componentLabel = formatLearningAreas(session.components);

  return (
    <article
      ref={sectionRef}
      aria-label={`Session ${session.sessionNumber}`}
      className="scroll-mt-36 bg-surface-container-lowest border border-outline-variant rounded-md overflow-hidden"
    >
      {/* Session Header */}
      <header className="bg-surface-container-low border-b border-outline-variant px-gutter-lg py-gutter-md flex flex-wrap items-center justify-between gap-gutter-sm">
        <div className="flex flex-wrap items-center gap-gutter-sm">
          <h3 className="font-title text-title-lg text-on-surface tabular-nums">
            Session {session.sessionNumber}
          </h3>
          {componentLabel && (
            <span className="px-gutter-sm py-0.5 rounded-full bg-tertiary-container text-on-tertiary-container font-label text-label-sm">
              {componentLabel}
            </span>
          )}
        </div>

        {(onDeriveDlp || onCreateQuiz) && (
          <div className="flex flex-wrap items-center gap-gutter-xs">
            {onDeriveDlp && (
              <button
                type="button"
                onClick={() => onDeriveDlp(dllId, session.sessionNumber)}
                className="inline-flex items-center gap-gutter-xs px-gutter-sm py-gutter-xs rounded bg-surface-container-lowest border border-primary/40 text-primary font-label text-label-md hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change"
              >
                <span
                  className="material-symbols-outlined text-body-md"
                  aria-hidden="true"
                >
                  description
                </span>
                <span>Derive DLP</span>
              </button>
            )}
            {onCreateQuiz && (
              <button
                type="button"
                onClick={() => onCreateQuiz(dllId, session.sessionNumber)}
                className="inline-flex items-center gap-gutter-xs px-gutter-sm py-gutter-xs rounded bg-surface-container-lowest border border-outline-variant text-on-surface font-label text-label-md hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change"
              >
                <span
                  className="material-symbols-outlined text-body-md"
                  aria-hidden="true"
                >
                  quiz
                </span>
                <span>Quiz</span>
              </button>
            )}
          </div>
        )}
      </header>

      {/* Responsive 2-Column Desktop ILAW Reading Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-outline-variant">
        {/* Left Column: I. Intentions + II. Learning Experience */}
        <div className="p-gutter-lg flex flex-col gap-gutter-lg min-w-0">
          <section className="flex flex-col gap-gutter-sm">
            <h4 className="font-label text-label-md uppercase tracking-wide text-primary border-b border-outline-variant/60 pb-gutter-xs">
              I. Intentions
            </h4>
            <SessionFieldBlock
              label="Learning Objectives"
              value={session.learningObjectives}
            />
          </section>

          <section className="flex flex-col gap-gutter-md">
            <h4 className="font-label text-label-md uppercase tracking-wide text-primary border-b border-outline-variant/60 pb-gutter-xs">
              II. Learning Experience
            </h4>
            <SessionFieldBlock label="Pre-Lesson" value={session.preLesson} />
            <SessionFieldBlock label="Lesson Flow" value={session.lessonFlow} />
            <SessionFieldBlock
              label="Learning Resources"
              value={session.learningResources}
            />
            <SessionFieldBlock
              label="Opportunities for Integration and Contextualization"
              value={session.integrationAndContextualization}
            />
          </section>
        </div>

        {/* Right Column: III. Assessing Learning + IV. Ways Forward */}
        <div className="p-gutter-lg flex flex-col gap-gutter-lg min-w-0">
          <section className="flex flex-col gap-gutter-sm">
            <h4 className="font-label text-label-md uppercase tracking-wide text-primary border-b border-outline-variant/60 pb-gutter-xs">
              III. Assessing Learning
            </h4>
            <SessionFieldBlock
              label="Formative Assessment"
              value={session.formativeAssessment}
            />
          </section>

          <section className="flex flex-col gap-gutter-md">
            <h4 className="font-label text-label-md uppercase tracking-wide text-primary border-b border-outline-variant/60 pb-gutter-xs">
              IV. Ways Forward
            </h4>
            <SessionFieldBlock
              label="Extended Learning Opportunities"
              value={session.extendedLearningOpportunities}
            />
            <SessionFieldBlock
              label="Reflections"
              value={session.reflections}
              emptyPlaceholder="Left blank for manual completion"
            />
          </section>
        </div>
      </div>
    </article>
  );
}

export function DllMarkdownView({
  dll,
  onDeriveDlp,
  onCreateQuiz,
  toolbarActions,
}: DllMarkdownViewProps) {
  const sessionRefs = useRef<Partial<Record<SessionNumber, HTMLElement | null>>>(
    {},
  );
  const canonicalMarkdown = useMemo(() => renderDllMarkdown(dll), [dll]);

  const scrollToSession = (sessionNumber: SessionNumber) => {
    sessionRefs.current[sessionNumber]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

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
              {dll.lessonTitle || "Daily Lesson Log"}
            </h2>
            <div className="flex flex-wrap items-center gap-gutter-xs">
              {dll.learningAreas && (
                <span className="px-gutter-sm py-0.5 rounded-full bg-tertiary-container text-on-tertiary-container font-label text-label-sm">
                  {dll.learningAreas}
                </span>
              )}
              {dll.gradeAndSection && (
                <span className="px-gutter-sm py-0.5 rounded-full bg-surface-variant text-on-surface-variant font-label text-label-sm">
                  {dll.gradeAndSection}
                </span>
              )}
              <span className="px-gutter-sm py-0.5 rounded-full bg-surface-container text-on-surface-variant font-mono text-label-sm tabular-nums">
                5 Sessions
              </span>
            </div>
            <p className="font-body text-body-sm text-on-surface-variant">
              <strong className="font-semibold text-on-surface">
                References:
              </strong>{" "}
              {dll.references.trim()
                ? renderInlineTokens(dll.references)
                : "—"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-gutter-xs shrink-0">
            <CopyMarkdownButton markdown={canonicalMarkdown} />
            {toolbarActions}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-gutter-md">
          <IntentionsListColumn
            title="Learning Competencies"
            items={dll.intentions.learningCompetencies}
          />
          <IntentionsListColumn
            title="Content Standards"
            items={dll.intentions.contentStandards}
          />
          <IntentionsListColumn
            title="Performance Standards"
            items={dll.intentions.performanceStandards}
          />
          <div className="flex flex-col gap-gutter-xs rounded bg-surface-container-low/60 border border-outline-variant/70 p-gutter-md">
            <h3 className="font-label text-label-md uppercase tracking-wide text-primary">
              Learner Context
            </h3>
            <LessonRichText
              text={dll.intentions.learnerContext}
              emptyPlaceholder="Left blank for manual completion"
              className="text-body-sm"
            />
          </div>
        </div>
      </section>

      {/* Sticky Session 1–5 Jump Bar (uses scrollIntoView, never mutates location.hash) */}
      <nav
        aria-label="Jump to Session"
        className="sticky top-[57px] z-10 bg-surface/95 backdrop-blur-xs border border-outline-variant rounded-md px-gutter-md py-gutter-sm flex flex-wrap items-center justify-between gap-gutter-sm"
      >
        <span className="font-label text-label-md text-on-surface-variant">
          Jump to Session:
        </span>
        <div className="flex flex-wrap items-center gap-gutter-xs">
          {dll.sessions.map((session) => {
            const isNonInstructional = session.mode === "non-instructional";
            const badge = isNonInstructional
              ? "Non-Instructional"
              : formatLearningAreas(session.components);
            return (
              <button
                key={session.sessionNumber}
                type="button"
                onClick={() => scrollToSession(session.sessionNumber)}
                className={`inline-flex items-center gap-1.5 px-gutter-sm py-gutter-xs rounded border font-label text-label-md focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change ${
                  isNonInstructional
                    ? "bg-surface-container-low border-outline-variant text-on-surface-variant hover:bg-surface-container"
                    : "bg-surface-container-lowest border-outline-variant text-on-surface hover:border-primary hover:text-primary"
                }`}
              >
                <span className="font-mono tabular-nums">
                  Session {session.sessionNumber}
                </span>
                {badge && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-label-sm ${
                      isNonInstructional
                        ? "bg-warning-container text-on-warning-container"
                        : "bg-tertiary-container text-on-tertiary-container"
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Sessions 1–5 Structured Stack */}
      <div className="flex flex-col gap-gutter-lg">
        {dll.sessions.map((session) =>
          session.mode === "non-instructional" ? (
            <article
              key={session.sessionNumber}
              ref={(el) => {
                sessionRefs.current[session.sessionNumber] = el;
              }}
              aria-label={`Session ${session.sessionNumber} Non-Instructional`}
              className="scroll-mt-36 bg-surface-container-low border border-outline-variant rounded-md px-gutter-lg py-gutter-md flex flex-wrap items-center justify-between gap-gutter-sm"
            >
              <div className="flex flex-wrap items-center gap-gutter-sm">
                <h3 className="font-title text-title-md text-on-surface tabular-nums">
                  Session {session.sessionNumber}
                </h3>
                <span className="px-gutter-sm py-0.5 rounded-full bg-warning-container text-on-warning-container font-label text-label-sm">
                  Non-Instructional
                </span>
                <span className="font-body text-body-md text-on-surface-variant">
                  {session.nonInstructionalReason?.trim() ||
                    session.learningObjectives.trim() ||
                    "Non-instructional day"}
                </span>
              </div>
            </article>
          ) : (
            <InstructionalSessionCard
              key={session.sessionNumber}
              dllId={dll.id}
              session={session}
              sectionRef={(el) => {
                sessionRefs.current[session.sessionNumber] = el;
              }}
              onDeriveDlp={onDeriveDlp}
              onCreateQuiz={onCreateQuiz}
            />
          ),
        )}
      </div>
    </div>
  );
}
