import { useId } from "react";
import { renderDllMarkdown } from "../engine/dll";
import { type SessionNumber } from "../engine/types";
import {
  INTENTIONS_LIST_FIELDS,
  SESSION_ILAW_FIELDS,
  useDllWorkspace,
  type DllLaunchTarget,
} from "../hooks/useDllWorkspace";
import { CurriculumCompetencyPicker } from "./CurriculumCompetencyPicker";
import { renderMarkdownBlocks } from "./lessonViewHelpers";

export type { DllLaunchTarget };

interface DllWorkspaceProps {
  initialLaunchTarget?: DllLaunchTarget | null;
  onConsumeLaunchTarget?: () => void;
  onDeriveDlp?: (dllId: string, sessionNumber: SessionNumber) => void;
  onCreateQuiz?: (dllId: string, sessionNumber: SessionNumber) => void;
}

const INPUT_CLASS =
  "w-full px-gutter-md py-gutter-sm rounded bg-surface-container-lowest border border-outline-variant text-body-md text-on-surface focus:border-primary focus-visible:outline-2 focus-visible:outline-primary";

export function DllWorkspace({
  initialLaunchTarget,
  onConsumeLaunchTarget,
  onDeriveDlp,
  onCreateQuiz,
}: DllWorkspaceProps) {
  const headingId = useId();
  const baseId = useId();

  const {
    dlls,
    curriculum,
    sections,
    loading,
    status,
    selectedDllId,
    setSelectedDllId,
    draftDll,
    viewMode,
    setViewMode,
    saving,
    lessonTitle,
    setLessonTitle,
    gradeAndSection,
    setGradeAndSection,
    references,
    setReferences,
    promptNotes,
    setPromptNotes,
    sessionConfigs,
    generating,
    pickedCompetencyId,
    setPickedCompetencyId,
    competencyMap,
    previewLearningAreas,
    assignCompetencyToSessions,
    removeCompetencyFromSession,
    updateSessionMode,
    updateNonInstructionalReason,
    handleGenerate,
    updateDraftHeader,
    updateDraftSessionField,
    handleSaveEdits,
    handleDeleteDll,
  } = useDllWorkspace(initialLaunchTarget, onConsumeLaunchTarget);

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-gutter-lg"
    >
      {/* Page Title & Action Row */}
      <div className="flex flex-wrap items-end justify-between gap-gutter-md">
        <div className="flex flex-col gap-gutter-xs">
          <h1
            id={headingId}
            tabIndex={-1}
            className="font-headline text-headline-lg text-on-surface text-balance"
          >
            {draftDll ? draftDll.lessonTitle : "New 5-Session DLL Builder"}
          </h1>
          <p className="font-body text-body-md text-on-surface-variant">
            Build 5-Session ILAW Daily Lesson Logs across TLE Components, edit
            cells inline, and export to{" "}
            <span className="font-mono text-mono-md">
              DLL_ILAW_template.docx
            </span>
            .
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-gutter-sm">
          {dlls.length > 0 && (
            <select
              id={`${baseId}-saved-dll`}
              aria-label="Saved Daily Lesson Logs"
              value={selectedDllId}
              onChange={(e) => setSelectedDllId(e.target.value)}
              className="max-w-xs px-gutter-md py-gutter-sm rounded bg-surface-container-lowest border border-outline-variant text-body-md text-on-surface focus:border-primary focus-visible:outline-2 focus-visible:outline-primary"
            >
              <option value="">Create a new 5-Session DLL...</option>
              {dlls.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.lessonTitle} — {item.learningAreas} (
                  {item.gradeAndSection})
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => setSelectedDllId("")}
            className="inline-flex items-center justify-center gap-gutter-sm px-gutter-md py-gutter-sm rounded bg-surface-container-lowest text-on-surface border border-outline-variant font-label text-label-lg hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change"
          >
            <span
              className="material-symbols-outlined text-title-md"
              aria-hidden="true"
            >
              add
            </span>
            <span>New DLL</span>
          </button>

          {draftDll && (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSaveEdits()}
                className="inline-flex items-center justify-center gap-gutter-sm px-gutter-md py-gutter-sm rounded bg-primary text-on-primary font-label text-label-lg hover:bg-primary-container focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change disabled:opacity-60"
              >
                <span
                  className="material-symbols-outlined text-title-md"
                  aria-hidden="true"
                >
                  save
                </span>
                <span>{saving ? "Saving..." : "Save Changes"}</span>
              </button>

              <a
                href={`/api/dlls/${encodeURIComponent(draftDll.id)}/docx`}
                download
                className="inline-flex items-center justify-center gap-gutter-sm px-gutter-md py-gutter-sm rounded bg-surface-container-lowest text-primary border border-primary font-label text-label-lg hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change"
              >
                <span
                  className="material-symbols-outlined text-title-md"
                  aria-hidden="true"
                >
                  download
                </span>
                <span>Export ILAW .docx</span>
              </a>
            </>
          )}
        </div>
      </div>

      {/* Status Banner */}
      {status && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-md border p-gutter-md flex items-center gap-gutter-sm font-body text-body-md ${
            status.tone === "error"
              ? "border-error bg-error-container text-on-error-container"
              : "border-success bg-success-container/60 text-on-success-container"
          }`}
        >
          <span
            className="material-symbols-outlined text-title-lg shrink-0"
            aria-hidden="true"
          >
            {status.tone === "error" ? "error" : "check_circle"}
          </span>
          <span>{status.text}</span>
        </div>
      )}

      {loading ? (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-lg font-body text-body-md text-on-surface-variant">
          Loading Daily Lesson Logs and Curriculum Catalog...
        </div>
      ) : !draftDll ? (
        /* Create New 5-Session DLL Form */
        <form
          onSubmit={(e) => void handleGenerate(e)}
          className="flex flex-col gap-gutter-lg"
        >
          <fieldset className="bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-lg flex flex-col gap-gutter-md">
            <legend className="font-title text-title-lg text-on-surface px-1">
              1. Header &amp; Prompt Notes
            </legend>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter-md">
              <div className="flex flex-col gap-gutter-xs">
                <label
                  htmlFor={`${baseId}-title`}
                  className="font-label text-label-md text-on-surface"
                >
                  Lesson Title (optional)
                </label>
                <input
                  id={`${baseId}-title`}
                  type="text"
                  value={lessonTitle}
                  onChange={(e) => setLessonTitle(e.target.value)}
                  placeholder="Leave blank for AI-generated title"
                  className={INPUT_CLASS}
                />
              </div>

              <div className="flex flex-col gap-gutter-xs">
                <label
                  htmlFor={`${baseId}-grade-section`}
                  className="font-label text-label-md text-on-surface"
                >
                  Grade Level and Section *
                </label>
                <input
                  id={`${baseId}-grade-section`}
                  type="text"
                  required
                  value={gradeAndSection}
                  onChange={(e) => setGradeAndSection(e.target.value)}
                  placeholder="e.g. Grade 7 - Rizal"
                  className={INPUT_CLASS}
                />
                {sections.length > 0 && (
                  <select
                    aria-label="Fill from saved Class Section"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) setGradeAndSection(e.target.value);
                    }}
                    className="w-full px-gutter-sm py-gutter-xs rounded bg-surface-container-low border border-outline-variant text-body-sm text-on-surface"
                  >
                    <option value="">Quick-fill from Class Sections...</option>
                    {sections.map((sec) => {
                      const label = `Grade ${sec.gradeLevel} - ${sec.sectionName}`;
                      return (
                        <option key={sec.id} value={label}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-gutter-xs">
              <label
                htmlFor={`${baseId}-refs`}
                className="font-label text-label-md text-on-surface"
              >
                References (optional)
              </label>
              <input
                id={`${baseId}-refs`}
                type="text"
                value={references}
                onChange={(e) => setReferences(e.target.value)}
                placeholder="DepEd MATATAG TLE CG, Grade 7 Budget of Work, toolkits..."
                className={INPUT_CLASS}
              />
            </div>

            <div className="flex flex-col gap-gutter-xs">
              <div className="flex flex-wrap items-center justify-between gap-gutter-xs">
                <label
                  htmlFor={`${baseId}-prompt-notes`}
                  className="font-label text-label-md text-on-surface"
                >
                  Optional Prompt Notes (AI Steering)
                </label>
                <span className="font-body text-body-sm text-on-surface-variant">
                  Included in AI prompt only — never written into Learner
                  Context
                </span>
              </div>
              <textarea
                id={`${baseId}-prompt-notes`}
                rows={2}
                value={promptNotes}
                onChange={(e) => setPromptNotes(e.target.value)}
                placeholder="e.g. 45-minute periods, limited tools in lab, group rotation..."
                className={INPUT_CLASS}
              />
            </div>
          </fieldset>

          <fieldset className="bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-lg flex flex-col gap-gutter-md">
            <legend className="font-title text-title-lg text-on-surface px-1">
              2. Pick Learning Competencies &amp; Map Sessions 1–5
            </legend>

            <CurriculumCompetencyPicker
              baseId={baseId}
              curriculum={curriculum}
              pickedCompetencyId={pickedCompetencyId}
              onPickCompetencyId={setPickedCompetencyId}
            />

            <div className="flex flex-wrap items-center justify-between gap-gutter-sm pt-gutter-xs border-t border-outline-variant">
              <div className="flex flex-wrap items-center gap-gutter-xs">
                <button
                  type="button"
                  disabled={!pickedCompetencyId}
                  onClick={() =>
                    assignCompetencyToSessions([1, 2], pickedCompetencyId)
                  }
                  className="px-gutter-sm py-gutter-xs rounded bg-surface-container-low border border-outline-variant font-label text-label-md text-on-surface hover:bg-surface-container disabled:opacity-50"
                >
                  Assign to Sessions 1–2
                </button>
                <button
                  type="button"
                  disabled={!pickedCompetencyId}
                  onClick={() =>
                    assignCompetencyToSessions([3, 4, 5], pickedCompetencyId)
                  }
                  className="px-gutter-sm py-gutter-xs rounded bg-surface-container-low border border-outline-variant font-label text-label-md text-on-surface hover:bg-surface-container disabled:opacity-50"
                >
                  Assign to Sessions 3–5
                </button>
                <button
                  type="button"
                  disabled={!pickedCompetencyId}
                  onClick={() =>
                    assignCompetencyToSessions(
                      [1, 2, 3, 4, 5],
                      pickedCompetencyId,
                    )
                  }
                  className="px-gutter-sm py-gutter-xs rounded bg-surface-container-low border border-outline-variant font-label text-label-md text-on-surface hover:bg-surface-container disabled:opacity-50"
                >
                  Assign to All 5 Sessions
                </button>
              </div>

              <span className="font-body text-body-sm text-on-surface-variant">
                Learning Area/s preview:{" "}
                <strong className="text-on-surface">
                  {previewLearningAreas}
                </strong>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-gutter-md items-stretch">
              {sessionConfigs.map((cfg) => (
                <article
                  key={cfg.sessionNumber}
                  className={`h-full rounded-md border p-gutter-md flex flex-col justify-between gap-gutter-sm ${
                    cfg.mode === "non-instructional"
                      ? "bg-surface-container-low border-outline-variant"
                      : "bg-surface-container-lowest border-outline-variant"
                  }`}
                >
                  <div className="flex flex-col gap-gutter-sm">
                    <div className="flex items-center justify-between gap-gutter-xs">
                      <h3 className="font-mono text-mono-md font-semibold text-on-surface">
                        Session {cfg.sessionNumber}
                      </h3>
                    </div>

                    <select
                      aria-label={`Session ${cfg.sessionNumber} mode`}
                      value={cfg.mode}
                      onChange={(e) =>
                        updateSessionMode(
                          cfg.sessionNumber,
                          e.target.value as
                            | "instructional"
                            | "non-instructional",
                        )
                      }
                      className="w-full px-gutter-sm py-gutter-xs rounded bg-surface-container-lowest border border-outline-variant text-body-sm text-on-surface"
                    >
                      <option value="instructional">Instructional</option>
                      <option value="non-instructional">
                        Non-Instructional / Holiday
                      </option>
                    </select>

                    {cfg.mode === "non-instructional" ? (
                      <div className="flex flex-col gap-gutter-xs">
                        <label
                          htmlFor={`${baseId}-ni-${cfg.sessionNumber}`}
                          className="font-label text-label-sm text-on-surface"
                        >
                          Reason
                        </label>
                        <input
                          id={`${baseId}-ni-${cfg.sessionNumber}`}
                          type="text"
                          value={cfg.nonInstructionalReason ?? ""}
                          onChange={(e) =>
                            updateNonInstructionalReason(
                              cfg.sessionNumber,
                              e.target.value,
                            )
                          }
                          placeholder="Holiday / School Event"
                          className="w-full px-gutter-sm py-gutter-xs rounded bg-surface-container-lowest border border-outline-variant text-body-sm text-on-surface"
                        />
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={!pickedCompetencyId}
                          onClick={() =>
                            assignCompetencyToSessions(
                              [cfg.sessionNumber],
                              pickedCompetencyId,
                            )
                          }
                          className="w-full px-gutter-sm py-gutter-xs rounded bg-surface-container-low border border-outline-variant font-label text-label-sm text-primary hover:bg-surface-container disabled:opacity-50"
                        >
                          + Add selected competency
                        </button>

                        {cfg.competencyIds.length === 0 ? (
                          <p className="font-body text-body-sm text-on-surface-variant">
                            No Learning Competency assigned yet.
                          </p>
                        ) : (
                          <ul className="flex flex-col gap-gutter-xs">
                            {cfg.competencyIds.map((cid) => {
                              const comp = competencyMap.get(cid);
                              return (
                                <li
                                  key={cid}
                                  className="p-gutter-xs rounded bg-surface-container-low border border-outline-variant flex flex-col gap-1"
                                >
                                  <span className="font-body text-body-sm text-on-surface">
                                    <span className="inline-block px-1.5 py-0.5 mr-1 rounded-full bg-tertiary-container text-on-tertiary-container font-label text-label-sm">
                                      {comp?.component ?? "TLE"}
                                    </span>
                                    {comp?.learningCompetency ?? cid}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeCompetencyFromSession(
                                        cfg.sessionNumber,
                                        cid,
                                      )
                                    }
                                    className="self-start font-label text-label-sm text-error hover:underline"
                                  >
                                    Remove
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </fieldset>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={generating}
              className="inline-flex items-center justify-center gap-gutter-sm px-gutter-lg py-gutter-sm rounded bg-primary text-on-primary font-label text-label-lg hover:bg-primary-container focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change disabled:opacity-60"
            >
              <span
                className="material-symbols-outlined text-title-md"
                aria-hidden="true"
              >
                auto_awesome
              </span>
              <span>
                {generating ? "Generating DLL..." : "Generate 5-Session DLL"}
              </span>
            </button>
          </div>
        </form>
      ) : (
        /* Editing / Inspecting Saved 5-Session DLL */
        <div className="flex flex-col gap-gutter-lg">
          {/* Metadata Summary & 5-Session Quick Strip */}
          <section className="flex flex-col gap-gutter-sm">
            <div className="flex flex-wrap items-center justify-between gap-gutter-sm">
              <div className="flex flex-wrap items-center gap-gutter-xs">
                <span className="px-gutter-sm py-0.5 rounded-full bg-tertiary-container text-on-tertiary-container font-label text-label-sm">
                  {draftDll.learningAreas}
                </span>
                <span className="px-gutter-sm py-0.5 rounded-full bg-surface-variant text-on-surface-variant font-label text-label-sm">
                  {draftDll.gradeAndSection}
                </span>
                <span className="px-gutter-sm py-0.5 rounded-full bg-surface-container text-on-surface-variant font-mono text-label-sm tabular-nums">
                  5 Sessions
                </span>
              </div>

              <button
                type="button"
                onClick={() => void handleDeleteDll()}
                className="inline-flex items-center gap-gutter-xs px-gutter-sm py-gutter-xs rounded bg-surface-container-lowest border border-outline-variant font-label text-label-md text-error hover:bg-error-container/30 focus-visible:outline-2 focus-visible:outline-error"
              >
                <span
                  className="material-symbols-outlined text-body-md"
                  aria-hidden="true"
                >
                  delete
                </span>
                <span>Delete DLL</span>
              </button>
            </div>

            {/* 5-Session Quick Strip */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-gutter-md items-stretch">
              {draftDll.sessions.map((session) => (
                <article
                  key={session.sessionNumber}
                  className={`h-full rounded-md border border-outline-variant p-gutter-md flex flex-col justify-between gap-gutter-sm ${
                    session.mode === "non-instructional"
                      ? "bg-surface-container-low"
                      : "bg-surface-container-lowest"
                  }`}
                >
                  <div className="flex flex-col gap-gutter-xs">
                    <div className="flex items-center justify-between gap-gutter-xs">
                      <span className="font-mono text-mono-md text-on-surface-variant tabular-nums">
                        Session {session.sessionNumber}
                      </span>
                      {session.mode === "non-instructional" ? (
                        <span className="px-gutter-sm py-0.5 rounded-full bg-warning-container text-on-warning-container font-label text-label-sm">
                          Holiday
                        </span>
                      ) : session.components.length > 0 ? (
                        <span className="px-gutter-sm py-0.5 rounded-full bg-tertiary-container text-on-tertiary-container font-label text-label-sm">
                          {session.components.join(", ")}
                        </span>
                      ) : null}
                    </div>
                    <p className="font-body text-body-sm text-on-surface line-clamp-2">
                      {session.mode === "non-instructional"
                        ? session.nonInstructionalReason || "Non-instructional"
                        : session.learningObjectives || "Instructional session"}
                    </p>
                  </div>

                  {session.mode === "instructional" &&
                    (onDeriveDlp || onCreateQuiz) && (
                      <div className="flex items-center gap-gutter-xs pt-gutter-sm border-t border-outline-variant">
                        {onDeriveDlp && (
                          <button
                            type="button"
                            onClick={() =>
                              onDeriveDlp(draftDll.id, session.sessionNumber)
                            }
                            className="text-label-sm font-label text-primary hover:underline"
                          >
                            Derive DLP
                          </button>
                        )}
                        {onDeriveDlp && onCreateQuiz && (
                          <span
                            className="text-on-surface-variant"
                            aria-hidden="true"
                          >
                            •
                          </span>
                        )}
                        {onCreateQuiz && (
                          <button
                            type="button"
                            onClick={() =>
                              onCreateQuiz(draftDll.id, session.sessionNumber)
                            }
                            className="text-label-sm font-label text-on-surface-variant hover:text-on-surface hover:underline"
                          >
                            Quiz
                          </button>
                        )}
                      </div>
                    )}
                </article>
              ))}
            </div>
          </section>

          {/* View Mode Tabs */}
          <div className="flex flex-col gap-gutter-md">
            <div className="flex flex-wrap items-center justify-between gap-gutter-md">
              <div
                role="tablist"
                aria-label="DLL View Mode"
                className="inline-flex items-center gap-gutter-xs p-gutter-xs rounded bg-surface-container border border-outline-variant"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === "edit"}
                  onClick={() => setViewMode("edit")}
                  className={`inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-xs rounded-sm font-label text-label-lg transition-colors duration-state-change ${
                    viewMode === "edit"
                      ? "bg-surface-container-lowest text-primary border border-outline-variant"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  <span
                    className="material-symbols-outlined text-title-md"
                    aria-hidden="true"
                  >
                    table_chart
                  </span>
                  <span>ILAW 5-Session Editor</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === "markdown"}
                  onClick={() => setViewMode("markdown")}
                  className={`inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-xs rounded-sm font-label text-label-lg transition-colors duration-state-change ${
                    viewMode === "markdown"
                      ? "bg-surface-container-lowest text-primary border border-outline-variant"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  <span
                    className="material-symbols-outlined text-title-md"
                    aria-hidden="true"
                  >
                    article
                  </span>
                  <span>Markdown Web View</span>
                </button>
              </div>

              <span className="font-body text-body-sm text-on-surface-variant">
                Edit any field inline before exporting to{" "}
                <span className="font-mono text-mono-md">
                  DLL_ILAW_template.docx
                </span>
              </span>
            </div>

            {viewMode === "markdown" ? (
              <article className="bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-xl flex flex-col gap-gutter-sm max-w-prose">
                {renderMarkdownBlocks(renderDllMarkdown(draftDll))}
              </article>
            ) : (
              <div className="flex flex-col gap-gutter-lg">
                {/* Header & Intentions Card */}
                <div className="bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-lg flex flex-col gap-gutter-md">
                  <div className="flex items-center justify-between pb-gutter-sm border-b border-outline-variant">
                    <h2 className="font-title text-title-lg text-primary">
                      I. Header &amp; Intentions
                    </h2>
                    <span className="font-label text-label-sm text-on-surface-variant">
                      {draftDll.learningAreas}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter-md">
                    <div className="flex flex-col gap-gutter-xs">
                      <label
                        htmlFor={`${baseId}-edit-title`}
                        className="font-label text-label-md text-on-surface"
                      >
                        Lesson Title
                      </label>
                      <input
                        id={`${baseId}-edit-title`}
                        type="text"
                        value={draftDll.lessonTitle}
                        onChange={(e) =>
                          updateDraftHeader("lessonTitle", e.target.value)
                        }
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div className="flex flex-col gap-gutter-xs">
                      <label
                        htmlFor={`${baseId}-edit-areas`}
                        className="font-label text-label-md text-on-surface"
                      >
                        Learning Area/s
                      </label>
                      <input
                        id={`${baseId}-edit-areas`}
                        type="text"
                        value={draftDll.learningAreas}
                        onChange={(e) =>
                          updateDraftHeader("learningAreas", e.target.value)
                        }
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div className="flex flex-col gap-gutter-xs">
                      <label
                        htmlFor={`${baseId}-edit-gs`}
                        className="font-label text-label-md text-on-surface"
                      >
                        Grade Level and Section
                      </label>
                      <input
                        id={`${baseId}-edit-gs`}
                        type="text"
                        value={draftDll.gradeAndSection}
                        onChange={(e) =>
                          updateDraftHeader("gradeAndSection", e.target.value)
                        }
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div className="flex flex-col gap-gutter-xs">
                      <label
                        htmlFor={`${baseId}-edit-refs`}
                        className="font-label text-label-md text-on-surface"
                      >
                        References
                      </label>
                      <input
                        id={`${baseId}-edit-refs`}
                        type="text"
                        value={draftDll.references}
                        onChange={(e) =>
                          updateDraftHeader("references", e.target.value)
                        }
                        className={INPUT_CLASS}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter-md">
                    {INTENTIONS_LIST_FIELDS.map((field) => (
                      <div key={field.key} className="flex flex-col gap-gutter-xs">
                        <label
                          htmlFor={`${baseId}-edit-${field.key}`}
                          className="font-label text-label-md text-on-surface"
                        >
                          {field.label}
                        </label>
                        <textarea
                          id={`${baseId}-edit-${field.key}`}
                          rows={3}
                          value={draftDll.intentions[field.key].join("\n")}
                          onChange={(e) =>
                            updateDraftHeader("intentions", {
                              ...draftDll.intentions,
                              [field.key]: e.target.value.split(/\r?\n/),
                            })
                          }
                          className={INPUT_CLASS}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col gap-gutter-xs">
                    <label
                      htmlFor={`${baseId}-edit-ctx`}
                      className="font-label text-label-md text-on-surface"
                    >
                      Learner Context (always left blank in .docx export)
                    </label>
                    <textarea
                      id={`${baseId}-edit-ctx`}
                      rows={2}
                      value={draftDll.intentions.learnerContext}
                      onChange={(e) =>
                        updateDraftHeader("intentions", {
                          ...draftDll.intentions,
                          learnerContext: e.target.value,
                        })
                      }
                      className={INPUT_CLASS}
                    />
                  </div>
                </div>

                {/* 5-Session ILAW Matrix Table */}
                <div
                  tabIndex={0}
                  role="region"
                  aria-label="ILAW 5-Session Matrix Editor"
                  className="bg-surface-container-lowest border border-outline-variant rounded-md overflow-x-auto focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <table className="w-full min-w-[1040px] border-collapse text-left">
                    <caption className="visually-hidden">
                      5-Session ILAW Daily Lesson Log Editor
                    </caption>
                    <thead>
                      <tr className="bg-surface-container border-b border-outline-variant">
                        <th
                          scope="col"
                          className="w-48 p-gutter-md font-title text-title-md text-on-surface border-r border-outline-variant align-top"
                        >
                          ILAW Section
                        </th>
                        {draftDll.sessions.map((session) => (
                          <th
                            key={session.sessionNumber}
                            scope="col"
                            className={`p-gutter-md font-title text-title-md border-r last:border-r-0 border-outline-variant align-top ${
                              session.mode === "non-instructional"
                                ? "bg-surface-container-low text-on-surface-variant"
                                : "text-on-surface"
                            }`}
                          >
                            Session {session.sessionNumber}{" "}
                            {session.mode === "non-instructional"
                              ? `(${session.nonInstructionalReason || "Holiday"})`
                              : session.components.length > 0
                                ? `(${session.components.join(", ")})`
                                : ""}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant">
                      {SESSION_ILAW_FIELDS.map((field) => (
                        <tr key={field.key}>
                          <th
                            scope="row"
                            className="p-gutter-md bg-surface-container-low border-r border-outline-variant align-top"
                          >
                            <div className="flex flex-col gap-0.5">
                              <span className="font-label text-label-sm text-primary">
                                {field.section}
                              </span>
                              <span className="font-label text-label-md text-on-surface">
                                {field.label}
                              </span>
                            </div>
                          </th>
                          {draftDll.sessions.map((session) => {
                            const cellId = `${baseId}-s${session.sessionNumber}-${field.key}`;
                            return (
                              <td
                                key={session.sessionNumber}
                                className={`p-gutter-sm border-r last:border-r-0 border-outline-variant align-top ${
                                  session.mode === "non-instructional"
                                    ? "bg-surface-container-low"
                                    : ""
                                }`}
                              >
                                <label
                                  htmlFor={cellId}
                                  className="visually-hidden"
                                >
                                  Session {session.sessionNumber} {field.label}
                                </label>
                                <textarea
                                  id={cellId}
                                  rows={field.rows ?? 2}
                                  value={session[field.key]}
                                  onChange={(e) =>
                                    updateDraftSessionField(
                                      session.sessionNumber,
                                      field.key,
                                      e.target.value,
                                    )
                                  }
                                  className="w-full px-gutter-sm py-gutter-xs rounded bg-surface-container-lowest border border-outline-variant font-body text-body-sm text-on-surface focus:border-primary focus-visible:outline-2 focus-visible:outline-primary"
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
