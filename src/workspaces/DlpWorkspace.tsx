import { useId } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FieldError, fieldBorderClass } from "../components/FieldError";
import type { SessionNumber } from "../engine/types";
import {
  DLP_ACTIVITY_ROWS,
  DLP_INTENTIONS_LIST_FIELDS,
  useDlpWorkspace,
  type DlpLaunchTarget,
} from "../hooks/useDlpWorkspace";
import { buildDescribedBy } from "../utils/formValidation";
import { CurriculumCompetencyPicker } from "./CurriculumCompetencyPicker";
import { DlpMarkdownView } from "./DlpMarkdownView";

export type { DlpLaunchTarget };

interface DlpWorkspaceProps {
  initialLaunchTarget?: DlpLaunchTarget | null;
  onConsumeLaunchTarget?: () => void;
  onCreateQuiz?: (dlpId: string) => void;
}

const INPUT_BASE_CLASS =
  "w-full px-gutter-md py-gutter-sm rounded bg-surface-container-lowest border text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary";

const INPUT_CLASS = `${INPUT_BASE_CLASS} border-outline-variant focus:border-primary`;

export function DlpWorkspace({
  initialLaunchTarget,
  onConsumeLaunchTarget,
  onCreateQuiz,
}: DlpWorkspaceProps) {
  const headingId = useId();
  const baseId = useId();

  const {
    dlps,
    dlls,
    curriculum,
    sections,
    loading,
    status,
    selectedDlpId,
    setSelectedDlpId,
    draftDlp,
    viewMode,
    setViewMode,
    saving,
    builderMode,
    selectBuilderMode,
    deriveDllId,
    setDeriveDllId,
    deriveSessionNumber,
    setDeriveSessionNumber,
    lessonTitle,
    setLessonTitle,
    gradeAndSection,
    handleGradeAndSectionChange,
    references,
    setReferences,
    promptNotes,
    setPromptNotes,
    selectedCompetencyIds,
    generating,
    pickedCompetencyId,
    setPickedCompetencyId,
    competencyMap,
    selectedSourceDll,
    activeSourceSessions,
    selectedSourceSession,
    formRef,
    fieldErrors,
    validateField,
    addScratchCompetency,
    requestRemoveScratchCompetency,
    handleGenerate,
    updateDraftHeader,
    updateDraftIntentions,
    updateDraftActivity,
    handleSaveEdits,
    requestDeleteDlp,
    confirmDialog,
  } = useDlpWorkspace(initialLaunchTarget, onConsumeLaunchTarget);

  const gradeSectionErrId = `${baseId}-grade-section-err`;
  const gradeSectionInvalid = Boolean(fieldErrors.gradeAndSection);
  const competenciesErrId = `${baseId}-competencies-err`;
  const competenciesInvalid = Boolean(fieldErrors.selectedCompetencyIds);

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
            {draftDlp
              ? `${draftDlp.lessonTitle} (Detailed DLP)`
              : "New Single-Session DLP Builder"}
          </h1>
          <p className="font-body text-body-md text-on-surface-variant">
            Build single-session ILAW Daily Lesson Plans from a DLL Session or
            from scratch with paired Teacher&apos;s and Student&apos;s Activity.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-gutter-sm">
          {dlps.length > 0 && (
            <select
              id={`${baseId}-saved-dlp`}
              aria-label="Saved Daily Lesson Plans"
              value={selectedDlpId}
              onChange={(e) => setSelectedDlpId(e.target.value)}
              className="max-w-xs px-gutter-md py-gutter-sm rounded bg-surface-container-lowest border border-outline-variant text-body-md text-on-surface focus:border-primary focus-visible:outline-2 focus-visible:outline-primary"
            >
              <option value="">Create a new Daily Lesson Plan...</option>
              {dlps.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.lessonTitle} — {item.learningAreas} (
                  {item.gradeAndSection})
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => setSelectedDlpId("")}
            className="inline-flex items-center justify-center gap-gutter-sm px-gutter-md py-gutter-sm rounded bg-surface-container-lowest text-on-surface border border-outline-variant font-label text-label-lg hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change"
          >
            <span
              className="material-symbols-outlined text-title-md"
              aria-hidden="true"
            >
              add
            </span>
            <span>New DLP</span>
          </button>

          {draftDlp && (
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
                href={`/api/dlps/${encodeURIComponent(draftDlp.id)}/docx`}
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
          Loading Daily Lesson Plans and Curriculum Catalog...
        </div>
      ) : !draftDlp ? (
        /* Create New DLP Form */
        <form
          ref={formRef}
          noValidate
          onSubmit={(e) => void handleGenerate(e)}
          className="flex flex-col gap-gutter-lg"
        >
          <fieldset className="bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-lg flex flex-col gap-gutter-md">
            <legend className="font-title text-title-lg text-on-surface px-1">
              1. Creation Source &amp; Metadata
            </legend>

            <div
              role="tablist"
              aria-label="DLP Creation Mode"
              className="inline-flex flex-wrap items-center gap-gutter-xs p-gutter-xs rounded bg-surface-container border border-outline-variant self-start"
            >
              <button
                type="button"
                role="tab"
                aria-selected={builderMode === "scratch"}
                onClick={() => selectBuilderMode("scratch")}
                className={`px-gutter-md py-gutter-xs rounded-sm font-label text-label-lg transition-colors duration-state-change ${
                  builderMode === "scratch"
                    ? "bg-surface-container-lowest text-primary border border-outline-variant"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                From Scratch (Curriculum Catalog)
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={builderMode === "derive"}
                onClick={() => selectBuilderMode("derive")}
                className={`px-gutter-md py-gutter-xs rounded-sm font-label text-label-lg transition-colors duration-state-change ${
                  builderMode === "derive"
                    ? "bg-surface-container-lowest text-primary border border-outline-variant"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                Derive from DLL Session
              </button>
            </div>

            {builderMode === "derive" &&
              (dlls.length === 0 ? (
                <p className="font-body text-body-sm text-on-surface-variant">
                  No saved Daily Lesson Logs yet. Create one in{" "}
                  <a href="#dll" className="text-primary underline">
                    DLL Builder
                  </a>{" "}
                  or switch to From Scratch.
                </p>
              ) : (
                <div className="flex flex-col gap-gutter-md p-gutter-md rounded bg-surface-container-low border border-outline-variant">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter-md">
                    <div className="flex flex-col gap-gutter-xs">
                      <label
                        htmlFor={`${baseId}-derive-dll`}
                        className="font-label text-label-md text-on-surface"
                      >
                        Saved DLL
                      </label>
                      <select
                        id={`${baseId}-derive-dll`}
                        value={deriveDllId}
                        onChange={(e) => setDeriveDllId(e.target.value)}
                        className={INPUT_CLASS}
                      >
                        {dlls.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.lessonTitle} ({item.gradeAndSection})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-gutter-xs">
                      <label
                        htmlFor={`${baseId}-derive-session`}
                        className="font-label text-label-md text-on-surface"
                      >
                        Active Session
                      </label>
                      <select
                        id={`${baseId}-derive-session`}
                        value={deriveSessionNumber}
                        onChange={(e) =>
                          setDeriveSessionNumber(
                            Number(e.target.value) as SessionNumber,
                          )
                        }
                        className={INPUT_CLASS}
                      >
                        {activeSourceSessions.map((s) => (
                          <option key={s.sessionNumber} value={s.sessionNumber}>
                            Session {s.sessionNumber} (
                            {s.components.join(", ") || "TLE"})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {selectedSourceSession && (
                    <div className="p-gutter-sm rounded bg-surface-container-lowest border border-outline-variant flex flex-col gap-gutter-xs font-body text-body-sm text-on-surface">
                      <div>
                        <strong className="font-label">
                          Inherited TLE Component:
                        </strong>{" "}
                        {selectedSourceSession.components.join(", ") ||
                          selectedSourceDll?.learningAreas}
                      </div>
                      <div>
                        <strong className="font-label">
                          Inherited Learning Objectives:
                        </strong>{" "}
                        {selectedSourceSession.learningObjectives || "—"}
                      </div>
                    </div>
                  )}
                </div>
              ))}

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

              {builderMode === "scratch" && (
                <div className="flex flex-col gap-gutter-xs">
                  <label
                    htmlFor={`${baseId}-grade-section`}
                    className="font-label text-label-md text-on-surface"
                  >
                    Grade Level and Section *
                  </label>
                  <input
                    id={`${baseId}-grade-section`}
                    data-field="gradeAndSection"
                    type="text"
                    required
                    aria-invalid={gradeSectionInvalid}
                    aria-describedby={buildDescribedBy(
                      null,
                      gradeSectionErrId,
                      gradeSectionInvalid,
                    )}
                    value={gradeAndSection}
                    onChange={(e) => handleGradeAndSectionChange(e.target.value)}
                    onBlur={() => validateField("gradeAndSection")}
                    placeholder="e.g. Grade 7 - Rizal"
                    className={`${INPUT_BASE_CLASS} ${fieldBorderClass(gradeSectionInvalid)}`}
                  />
                  <FieldError
                    id={gradeSectionErrId}
                    message={fieldErrors.gradeAndSection}
                  />
                  {sections.length > 0 && (
                    <select
                      aria-label="Fill from saved Class Section"
                      value=""
                      onChange={(e) => {
                        if (e.target.value)
                          handleGradeAndSectionChange(e.target.value);
                      }}
                      className="w-full px-gutter-sm py-gutter-xs rounded bg-surface-container-low border border-outline-variant text-body-sm text-on-surface"
                    >
                      <option value="">
                        Quick-fill from Class Sections...
                      </option>
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
              )}
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
                placeholder={
                  builderMode === "derive"
                    ? "Leave blank to inherit DLL references"
                    : "DepEd MATATAG TLE CG, Budget of Work, toolkits..."
                }
                className={INPUT_CLASS}
              />
            </div>

            <div className="flex flex-col gap-gutter-xs">
              <div className="flex flex-wrap items-center justify-between gap-gutter-xs">
                <label
                  htmlFor={`${baseId}-prompt-notes`}
                  className="font-label text-label-md text-on-surface"
                >
                  Prompt Notes (optional)
                </label>
                <span className="font-body text-body-sm text-on-surface-variant">
                  Included in the AI prompt only — never written into Learner
                  Context.
                </span>
              </div>
              <textarea
                id={`${baseId}-prompt-notes`}
                rows={2}
                value={promptNotes}
                onChange={(e) => setPromptNotes(e.target.value)}
                placeholder="e.g. 45-minute period, 40 learners in pairs, limited tools..."
                className={INPUT_CLASS}
              />
            </div>
          </fieldset>

          {builderMode === "scratch" && (
            <fieldset className="bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-lg flex flex-col gap-gutter-md">
              <legend
                id={`${baseId}-competencies-legend`}
                className="font-title text-title-lg text-on-surface px-1"
              >
                2. Select Learning Competencies
              </legend>

              <CurriculumCompetencyPicker
                baseId={baseId}
                curriculum={curriculum}
                pickedCompetencyId={pickedCompetencyId}
                onPickCompetencyId={setPickedCompetencyId}
              />

              <div>
                <button
                  type="button"
                  disabled={!pickedCompetencyId}
                  onClick={addScratchCompetency}
                  className="px-gutter-md py-gutter-xs rounded bg-surface-container-low border border-outline-variant font-label text-label-md text-primary hover:bg-surface-container disabled:opacity-50"
                >
                  + Add Learning Competency
                </button>
              </div>

              <div className="flex flex-col gap-gutter-xs">
                <div
                  data-field="selectedCompetencyIds"
                  tabIndex={-1}
                  role="group"
                  aria-labelledby={`${baseId}-competencies-legend`}
                  aria-describedby={buildDescribedBy(
                    null,
                    competenciesErrId,
                    competenciesInvalid,
                  )}
                  className={
                    competenciesInvalid
                      ? "rounded p-gutter-sm border border-error bg-error-container/20 focus-visible:outline-2 focus-visible:outline-primary"
                      : "focus-visible:outline-2 focus-visible:outline-primary"
                  }
                >
                  {selectedCompetencyIds.length === 0 ? (
                    <p className="font-body text-body-sm text-on-surface-variant">
                      No Learning Competency selected yet.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-gutter-xs">
                      {selectedCompetencyIds.map((cid) => {
                        const comp = competencyMap.get(cid);
                        return (
                          <li
                            key={cid}
                            className="p-gutter-sm rounded bg-surface-container-low border border-outline-variant flex items-center justify-between gap-gutter-sm"
                          >
                            <span className="font-body text-body-sm text-on-surface">
                              <span className="inline-block px-1.5 py-0.5 mr-2 rounded-full bg-tertiary-container text-on-tertiary-container font-label text-label-sm">
                                {comp?.component ?? "TLE"}
                              </span>
                              {comp?.learningCompetency ?? cid}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                requestRemoveScratchCompetency(cid)
                              }
                              className="shrink-0 font-label text-label-sm text-error hover:underline focus-visible:outline-2 focus-visible:outline-error rounded-sm"
                            >
                              Remove
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <FieldError
                  id={competenciesErrId}
                  message={fieldErrors.selectedCompetencyIds}
                />
              </div>
            </fieldset>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={
                generating ||
                (builderMode === "derive" &&
                  (!deriveDllId || !selectedSourceSession))
              }
              className="inline-flex items-center justify-center gap-gutter-sm px-gutter-lg py-gutter-sm rounded bg-primary text-on-primary font-label text-label-lg hover:bg-primary-container focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change disabled:opacity-60"
            >
              <span
                className="material-symbols-outlined text-title-md"
                aria-hidden="true"
              >
                auto_awesome
              </span>
              <span>
                {generating
                  ? "Generating DLP..."
                  : builderMode === "derive"
                    ? "Generate DLP from Session"
                    : "Generate Standalone DLP"}
              </span>
            </button>
          </div>
        </form>
      ) : (
        /* Editing Saved DLP */
        <div className="flex flex-col gap-gutter-lg">
          {/* Metadata Pills & Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-gutter-sm">
            <div className="flex flex-wrap items-center gap-gutter-xs">
              <span className="px-gutter-sm py-0.5 rounded-full bg-tertiary-container text-on-tertiary-container font-label text-label-sm">
                {draftDlp.learningAreas}
              </span>
              <span className="px-gutter-sm py-0.5 rounded-full bg-surface-variant text-on-surface-variant font-label text-label-sm">
                {draftDlp.gradeAndSection}
              </span>
              <span className="px-gutter-sm py-0.5 rounded-full bg-surface-container text-on-surface-variant font-mono text-label-sm tabular-nums">
                1 Session
              </span>
              {draftDlp.sourceDllId && (
                <span className="px-gutter-sm py-0.5 rounded-full bg-success-container text-on-success-container font-label text-label-sm">
                  Derived from Session {draftDlp.sourceSessionNumber}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-gutter-sm">
              {onCreateQuiz && (
                <button
                  type="button"
                  onClick={() => onCreateQuiz(draftDlp.id)}
                  className="inline-flex items-center gap-gutter-xs px-gutter-sm py-gutter-xs rounded border border-outline-variant bg-surface-container-lowest font-label text-label-md text-on-surface hover:bg-surface-container-low"
                >
                  <span
                    className="material-symbols-outlined text-title-md text-primary"
                    aria-hidden="true"
                  >
                    quiz
                  </span>
                  <span>Create Quiz from DLP</span>
                </button>
              )}

              <button
                type="button"
                onClick={requestDeleteDlp}
                className="inline-flex items-center gap-gutter-xs px-gutter-sm py-gutter-xs rounded border border-outline-variant bg-surface-container-lowest font-label text-label-md text-error hover:bg-error-container/30 focus-visible:outline-2 focus-visible:outline-error"
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

          {/* View Mode Tabs */}
          <div className="flex flex-col gap-gutter-md">
            <div className="flex flex-wrap items-center justify-between gap-gutter-md">
              <div
                role="tablist"
                aria-label="DLP View Mode"
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
                    splitscreen
                  </span>
                  <span>Paired ILAW Table</span>
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
                {viewMode === "markdown" ? (
                  "Full-width ILAW reading view · Copy Markdown uses exact persisted format"
                ) : (
                  <>
                    Edit any cell inline before exporting to{" "}
                    <span className="font-mono text-mono-md">
                      DLP_ILAW_template.docx
                    </span>
                  </>
                )}
              </span>
            </div>

            {viewMode === "markdown" ? (
              <DlpMarkdownView
                dlp={draftDlp}
                sourceDllTitle={
                  draftDlp.sourceDllId
                    ? dlls.find((item) => item.id === draftDlp.sourceDllId)
                        ?.lessonTitle
                    : undefined
                }
              />
            ) : (
              <div className="flex flex-col gap-gutter-lg">
                {/* Header & Intentions Card */}
                <div className="bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-lg flex flex-col gap-gutter-md">
                  <div className="flex items-center justify-between pb-gutter-sm border-b border-outline-variant">
                    <h2 className="font-title text-title-lg text-primary">
                      I. Header &amp; Intentions
                    </h2>
                    <span className="font-label text-label-sm text-on-surface-variant">
                      {draftDlp.learningAreas}
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
                        value={draftDlp.lessonTitle}
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
                        value={draftDlp.learningAreas}
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
                        value={draftDlp.gradeAndSection}
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
                        value={draftDlp.references}
                        onChange={(e) =>
                          updateDraftHeader("references", e.target.value)
                        }
                        className={INPUT_CLASS}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter-md">
                    {DLP_INTENTIONS_LIST_FIELDS.map((field) => (
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
                          value={draftDlp.intentions[field.key].join("\n")}
                          onChange={(e) =>
                            updateDraftIntentions({
                              [field.key]: e.target.value.split(/\r?\n/),
                            })
                          }
                          className={INPUT_CLASS}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter-md">
                    <div className="flex flex-col gap-gutter-xs">
                      <label
                        htmlFor={`${baseId}-edit-objectives`}
                        className="font-label text-label-md text-on-surface"
                      >
                        Learning Objectives
                      </label>
                      <textarea
                        id={`${baseId}-edit-objectives`}
                        rows={2}
                        value={draftDlp.intentions.learningObjectives}
                        onChange={(e) =>
                          updateDraftIntentions({
                            learningObjectives: e.target.value,
                          })
                        }
                        className={INPUT_CLASS}
                      />
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
                        value={draftDlp.intentions.learnerContext}
                        onChange={(e) =>
                          updateDraftIntentions({
                            learnerContext: e.target.value,
                          })
                        }
                        className={INPUT_CLASS}
                      />
                    </div>
                  </div>
                </div>

                {/* Two-Column Teacher's Activity / Student's Activity Matrix */}
                <div
                  tabIndex={0}
                  role="region"
                  aria-label="Paired ILAW DLP Matrix Editor"
                  className="bg-surface-container-lowest border border-outline-variant rounded-md overflow-x-auto focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <table className="w-full min-w-[760px] border-collapse text-left">
                    <caption className="visually-hidden">
                      Two-Column Teacher and Student Activity DLP Editor
                    </caption>
                    <thead>
                      <tr className="bg-surface-container border-b border-outline-variant">
                        <th
                          scope="col"
                          className="w-52 p-gutter-md font-title text-title-md text-on-surface border-r border-outline-variant align-top"
                        >
                          ILAW Section
                        </th>
                        <th
                          scope="col"
                          className="w-1/2 p-gutter-md font-title text-title-md text-primary border-r border-outline-variant align-top"
                        >
                          Teacher&apos;s Activity
                        </th>
                        <th
                          scope="col"
                          className="w-1/2 p-gutter-md font-title text-title-md text-tertiary align-top"
                        >
                          Student&apos;s Activity
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant">
                      {DLP_ACTIVITY_ROWS.map((row) => {
                        const teacherId = `${baseId}-${row.key}-teacher`;
                        const studentId = `${baseId}-${row.key}-student`;
                        return (
                          <tr key={row.key}>
                            <th
                              scope="row"
                              className="p-gutter-md bg-surface-container-low border-r border-outline-variant align-top"
                            >
                              <div className="flex flex-col gap-0.5">
                                <span className="font-label text-label-sm text-primary">
                                  {row.section}
                                </span>
                                <span className="font-label text-label-md text-on-surface">
                                  {row.label}
                                </span>
                              </div>
                            </th>
                            <td className="p-gutter-sm border-r border-outline-variant align-top">
                              <label
                                htmlFor={teacherId}
                                className="visually-hidden"
                              >
                                {row.label} Teacher&apos;s Activity
                              </label>
                              <textarea
                                id={teacherId}
                                rows={row.rows ?? 2}
                                value={draftDlp[row.key].teacherActivity}
                                onChange={(e) =>
                                  updateDraftActivity(
                                    row.key,
                                    "teacherActivity",
                                    e.target.value,
                                  )
                                }
                                className="w-full px-gutter-sm py-gutter-xs rounded bg-surface-container-lowest border border-outline-variant font-body text-body-sm text-on-surface focus:border-primary focus-visible:outline-2 focus-visible:outline-primary"
                              />
                            </td>
                            <td className="p-gutter-sm align-top">
                              <label
                                htmlFor={studentId}
                                className="visually-hidden"
                              >
                                {row.label} Student&apos;s Activity
                              </label>
                              <textarea
                                id={studentId}
                                rows={row.rows ?? 2}
                                value={draftDlp[row.key].studentActivity}
                                onChange={(e) =>
                                  updateDraftActivity(
                                    row.key,
                                    "studentActivity",
                                    e.target.value,
                                  )
                                }
                                className="w-full px-gutter-sm py-gutter-xs rounded bg-surface-container-lowest border border-outline-variant font-body text-body-sm text-on-surface focus:border-primary focus-visible:outline-2 focus-visible:outline-primary"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        state={confirmDialog.state}
        onConfirm={confirmDialog.confirm}
        onCancel={confirmDialog.cancel}
      />
    </section>
  );
}
