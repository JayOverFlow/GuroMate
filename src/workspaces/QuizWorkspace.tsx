import { useId } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FieldError, fieldBorderClass } from "../components/FieldError";
import {
  QUIZ_SECTION_META,
  ROMAN_PARTS,
  renderQuizMarkdown,
} from "../engine/quiz";
import {
  QUIZ_QUESTION_TYPES,
  type SessionNumber,
} from "../engine/types";
import {
  useQuizWorkspace,
  type QuizLaunchTarget,
} from "../hooks/useQuizWorkspace";
import { buildDescribedBy } from "../utils/formValidation";
import { CurriculumCompetencyPicker } from "./CurriculumCompetencyPicker";
import { renderMarkdownBlocks } from "./lessonViewHelpers";

export type { QuizLaunchTarget };

interface QuizWorkspaceProps {
  initialLaunchTarget?: QuizLaunchTarget | null;
  onConsumeLaunchTarget?: () => void;
}

const INPUT_BASE_CLASS =
  "w-full px-gutter-md py-gutter-sm rounded bg-surface-container-lowest border text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary";

const INPUT_CLASS = `${INPUT_BASE_CLASS} border-outline-variant focus:border-primary`;

export function QuizWorkspace({
  initialLaunchTarget,
  onConsumeLaunchTarget,
}: QuizWorkspaceProps) {
  const headingId = useId();
  const baseId = useId();

  const {
    quizzes,
    dlls,
    dlps,
    curriculum,
    sections,
    loading,
    status,
    selectedQuizId,
    setSelectedQuizId,
    draftQuiz,
    setDraftQuiz,
    viewMode,
    setViewMode,
    saving,
    syncing,
    downloading,
    sourceKind,
    selectSourceKind,
    selectedDllId,
    setSelectedDllId,
    selectedSessionNumber,
    setSelectedSessionNumber,
    selectedDlpId,
    setSelectedDlpId,
    title,
    setTitle,
    gradeAndSection,
    handleGradeAndSectionChange,
    promptNotes,
    setPromptNotes,
    itemCountDrafts,
    invalidCountTypes,
    selectedCompetencyIds,
    pickedCompetencyId,
    setPickedCompetencyId,
    generating,
    competencyMap,
    activeSourceSessions,
    selectedSourceSession,
    formRef,
    fieldErrors,
    validateField,
    addCompetency,
    requestRemoveCompetency,
    updateCount,
    handleGenerate,
    updateSectionDirections,
    updateItemField,
    updateChoice,
    handleSaveEdits,
    handleSyncToLesson,
    handleDownloadDocx,
    requestDeleteQuiz,
    confirmDialog,
  } = useQuizWorkspace(initialLaunchTarget, onConsumeLaunchTarget);

  const gradeSectionErrId = `${baseId}-grade-section-err`;
  const gradeSectionInvalid = Boolean(fieldErrors.gradeAndSection);
  const competenciesErrId = `${baseId}-competencies-err`;
  const competenciesInvalid = Boolean(fieldErrors.selectedCompetencyIds);
  const itemCountsErrId = `${baseId}-item-counts-err`;

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
            {draftQuiz ? draftQuiz.title : "Printable Formative Quiz Maker"}
          </h1>
          <p className="font-body text-body-md text-on-surface-variant">
            Generate printable formative Quizzes from a DLL Session, DLP, or
            Learning Competencies, sync into lessons, and export .docx with a
            page-separated Answer Key.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-gutter-sm">
          {quizzes.length > 0 && (
            <select
              id={`${baseId}-saved-quiz`}
              aria-label="Saved Quizzes"
              value={selectedQuizId}
              onChange={(e) => setSelectedQuizId(e.target.value)}
              className="max-w-xs px-gutter-md py-gutter-sm rounded bg-surface-container-lowest border border-outline-variant text-body-md text-on-surface focus:border-primary focus-visible:outline-2 focus-visible:outline-primary"
            >
              <option value="">Create a new Formative Quiz...</option>
              {quizzes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} — {item.learningAreas} ({item.gradeAndSection})
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => setSelectedQuizId("")}
            className="inline-flex items-center justify-center gap-gutter-sm px-gutter-md py-gutter-sm rounded bg-surface-container-lowest text-on-surface border border-outline-variant font-label text-label-lg hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change"
          >
            <span
              className="material-symbols-outlined text-title-md"
              aria-hidden="true"
            >
              add
            </span>
            <span>New Quiz</span>
          </button>

          {draftQuiz && (
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

              <button
                type="button"
                disabled={downloading}
                onClick={() => void handleDownloadDocx()}
                className="inline-flex items-center justify-center gap-gutter-sm px-gutter-md py-gutter-sm rounded bg-surface-container-lowest text-primary border border-primary font-label text-label-lg hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change disabled:opacity-60"
              >
                <span
                  className="material-symbols-outlined text-title-md"
                  aria-hidden="true"
                >
                  print
                </span>
                <span>
                  {downloading ? "Preparing DOCX..." : "Download DOCX"}
                </span>
              </button>
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
          Loading Quizzes, Lessons, and Curriculum Catalog...
        </div>
      ) : !draftQuiz ? (
        /* New Quiz Builder Form */
        <form
          ref={formRef}
          noValidate
          onSubmit={(e) => void handleGenerate(e)}
          className="flex flex-col gap-gutter-lg"
        >
          <fieldset className="bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-lg flex flex-col gap-gutter-md">
            <legend className="font-title text-title-lg text-on-surface px-1">
              1. Quiz Source
            </legend>

            <div
              role="tablist"
              aria-label="Quiz Source"
              className="inline-flex flex-wrap items-center gap-gutter-xs p-gutter-xs rounded bg-surface-container border border-outline-variant self-start"
            >
              <button
                type="button"
                role="tab"
                aria-selected={sourceKind === "standalone"}
                onClick={() => selectSourceKind("standalone")}
                className={`px-gutter-md py-gutter-xs rounded-sm font-label text-label-lg transition-colors duration-state-change ${
                  sourceKind === "standalone"
                    ? "bg-surface-container-lowest text-primary border border-outline-variant"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                Learning Competencies
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sourceKind === "dll"}
                onClick={() => selectSourceKind("dll")}
                className={`px-gutter-md py-gutter-xs rounded-sm font-label text-label-lg transition-colors duration-state-change ${
                  sourceKind === "dll"
                    ? "bg-surface-container-lowest text-primary border border-outline-variant"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                From DLL Session
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sourceKind === "dlp"}
                onClick={() => selectSourceKind("dlp")}
                className={`px-gutter-md py-gutter-xs rounded-sm font-label text-label-lg transition-colors duration-state-change ${
                  sourceKind === "dlp"
                    ? "bg-surface-container-lowest text-primary border border-outline-variant"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                From DLP
              </button>
            </div>

            {sourceKind === "dll" ? (
              dlls.length === 0 ? (
                <p className="font-body text-body-sm text-on-surface-variant">
                  No saved DLLs yet. Create one in{" "}
                  <a href="#dll" className="text-primary underline">
                    DLL Builder
                  </a>
                  .
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter-md">
                  <div className="flex flex-col gap-gutter-xs">
                    <label
                      htmlFor={`${baseId}-src-dll`}
                      className="font-label text-label-md text-on-surface"
                    >
                      Saved DLL
                    </label>
                    <select
                      id={`${baseId}-src-dll`}
                      value={selectedDllId}
                      onChange={(e) => setSelectedDllId(e.target.value)}
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
                      htmlFor={`${baseId}-src-session`}
                      className="font-label text-label-md text-on-surface"
                    >
                      Active Session
                    </label>
                    <select
                      id={`${baseId}-src-session`}
                      value={selectedSessionNumber}
                      onChange={(e) =>
                        setSelectedSessionNumber(
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
              )
            ) : sourceKind === "dlp" ? (
              dlps.length === 0 ? (
                <p className="font-body text-body-sm text-on-surface-variant">
                  No saved DLPs yet. Create one in{" "}
                  <a href="#dlp" className="text-primary underline">
                    DLP Builder
                  </a>
                  .
                </p>
              ) : (
                <div className="flex flex-col gap-gutter-xs">
                  <label
                    htmlFor={`${baseId}-src-dlp`}
                    className="font-label text-label-md text-on-surface"
                  >
                    Saved DLP
                  </label>
                  <select
                    id={`${baseId}-src-dlp`}
                    value={selectedDlpId}
                    onChange={(e) => setSelectedDlpId(e.target.value)}
                    className={INPUT_CLASS}
                  >
                    {dlps.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.lessonTitle} — {item.learningAreas} (
                        {item.gradeAndSection})
                      </option>
                    ))}
                  </select>
                </div>
              )
            ) : (
              <div className="flex flex-col gap-gutter-md">
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
                    onClick={addCompetency}
                    className="px-gutter-md py-gutter-xs rounded bg-surface-container-low border border-outline-variant font-label text-label-md text-primary hover:bg-surface-container disabled:opacity-50"
                  >
                    + Add Learning Competency
                  </button>
                </div>

                <div className="flex flex-col gap-gutter-xs">
                  <div
                    data-field="selectedCompetencyIds"
                    tabIndex={-1}
                    aria-invalid={competenciesInvalid}
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
                                onClick={() => requestRemoveCompetency(cid)}
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
              </div>
            )}
          </fieldset>

          <fieldset className="bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-lg flex flex-col gap-gutter-md">
            <legend className="font-title text-title-lg text-on-surface px-1">
              2. Question Types, Item Counts &amp; Prompt Notes
            </legend>

            <div className="flex flex-col gap-gutter-xs">
              <label
                htmlFor={`${baseId}-title`}
                className="font-label text-label-md text-on-surface"
              >
                Quiz Title (optional)
              </label>
              <input
                id={`${baseId}-title`}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Leave blank for AI-generated title"
                className={INPUT_CLASS}
              />
            </div>

            <div className="flex flex-col gap-gutter-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-gutter-md">
                {QUIZ_QUESTION_TYPES.map((type) => {
                  const isCountInvalid = invalidCountTypes.has(type);
                  return (
                    <label
                      key={type}
                      htmlFor={`${baseId}-count-${type}`}
                      className="p-gutter-sm rounded bg-surface-container-low border border-outline-variant flex items-center justify-between gap-gutter-sm"
                    >
                      <span className="font-label text-label-md text-on-surface">
                        {QUIZ_SECTION_META[type].title}
                      </span>
                      <input
                        id={`${baseId}-count-${type}`}
                        data-field={`count-${type}`}
                        type="number"
                        min={0}
                        max={50}
                        step={1}
                        aria-invalid={isCountInvalid}
                        aria-describedby={buildDescribedBy(
                          null,
                          itemCountsErrId,
                          isCountInvalid,
                        )}
                        value={itemCountDrafts[type]}
                        onChange={(e) => updateCount(type, e.target.value)}
                        onBlur={() => validateField("itemCounts")}
                        className={`w-16 px-gutter-xs py-gutter-xs rounded-sm bg-surface-container-lowest border font-mono text-mono-md text-on-surface tabular-nums text-center focus-visible:outline-2 focus-visible:outline-primary ${fieldBorderClass(isCountInvalid)}`}
                      />
                    </label>
                  );
                })}
              </div>
              <FieldError
                id={itemCountsErrId}
                message={fieldErrors.itemCounts}
              />
            </div>

            <div className="flex flex-col gap-gutter-xs">
              <label
                htmlFor={`${baseId}-prompt-notes`}
                className="font-label text-label-md text-on-surface"
              >
                Prompt Notes (optional)
              </label>
              <textarea
                id={`${baseId}-prompt-notes`}
                rows={2}
                value={promptNotes}
                onChange={(e) => setPromptNotes(e.target.value)}
                placeholder="e.g. Focus on tool safety, Grade 7 reading level..."
                className={INPUT_CLASS}
              />
            </div>
          </fieldset>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={
                generating ||
                (sourceKind === "dll" &&
                  (!selectedDllId || !selectedSourceSession)) ||
                (sourceKind === "dlp" && !selectedDlpId)
              }
              className="inline-flex items-center justify-center gap-gutter-sm px-gutter-lg py-gutter-sm rounded bg-primary text-on-primary font-label text-label-lg hover:bg-primary-container focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change disabled:opacity-60"
            >
              <span
                className="material-symbols-outlined text-title-md"
                aria-hidden="true"
              >
                auto_awesome
              </span>
              <span>{generating ? "Generating Quiz..." : "Generate Quiz"}</span>
            </button>
          </div>
        </form>
      ) : (
        /* Editing / Previewing Saved Quiz */
        <div className="flex flex-col gap-gutter-lg">
          {/* Metadata Pills & Sync/Delete */}
          <div className="flex flex-wrap items-center justify-between gap-gutter-sm">
            <div className="flex flex-wrap items-center gap-gutter-xs">
              <span className="px-gutter-sm py-0.5 rounded-full bg-tertiary-container text-on-tertiary-container font-label text-label-sm">
                {draftQuiz.learningAreas}
              </span>
              <span className="px-gutter-sm py-0.5 rounded-full bg-surface-variant text-on-surface-variant font-label text-label-sm">
                {draftQuiz.gradeAndSection}
              </span>
              {draftQuiz.source.kind === "dll" && (
                <span className="px-gutter-sm py-0.5 rounded-full bg-success-container text-on-success-container font-label text-label-sm">
                  Linked to DLL Session {draftQuiz.source.sessionNumber}
                </span>
              )}
              {draftQuiz.source.kind === "dlp" && (
                <span className="px-gutter-sm py-0.5 rounded-full bg-success-container text-on-success-container font-label text-label-sm">
                  Linked to DLP
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-gutter-sm">
              {draftQuiz.source.kind !== "standalone" && (
                <button
                  type="button"
                  disabled={syncing}
                  onClick={() => void handleSyncToLesson()}
                  className="inline-flex items-center gap-gutter-xs px-gutter-sm py-gutter-xs rounded border border-outline-variant bg-surface-container-lowest font-label text-label-md text-on-surface hover:bg-surface-container-low disabled:opacity-60"
                >
                  <span
                    className="material-symbols-outlined text-title-md text-primary"
                    aria-hidden="true"
                  >
                    sync
                  </span>
                  <span>
                    {syncing
                      ? "Syncing..."
                      : "Sync to Lesson Formative Assessment"}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={requestDeleteQuiz}
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
                aria-label="Quiz View Mode"
                className="inline-flex items-center gap-gutter-xs p-gutter-xs rounded bg-surface-container border border-outline-variant"
              >
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
                    edit_document
                  </span>
                  <span>Worksheet &amp; Inline Editor</span>
                </button>
              </div>

              <span className="font-mono text-mono-md text-on-surface-variant">
                Answer Key exports on a page-separated final page
              </span>
            </div>

            {viewMode === "markdown" ? (
              <article className="bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-xl flex flex-col gap-gutter-sm max-w-prose">
                {renderMarkdownBlocks(renderQuizMarkdown(draftQuiz))}
              </article>
            ) : (
              <div className="flex flex-col gap-gutter-lg">
                {/* Quiz Header Card */}
                <div className="bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-lg flex flex-col gap-gutter-md">
                  <h2 className="font-title text-title-lg text-primary">
                    Quiz Header
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter-md">
                    <div className="flex flex-col gap-gutter-xs">
                      <label
                        htmlFor={`${baseId}-edit-title`}
                        className="font-label text-label-md text-on-surface"
                      >
                        Quiz Title
                      </label>
                      <input
                        id={`${baseId}-edit-title`}
                        type="text"
                        value={draftQuiz.title}
                        onChange={(e) =>
                          setDraftQuiz((prev) =>
                            prev ? { ...prev, title: e.target.value } : prev,
                          )
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
                        value={draftQuiz.learningAreas}
                        onChange={(e) =>
                          setDraftQuiz((prev) =>
                            prev
                              ? { ...prev, learningAreas: e.target.value }
                              : prev,
                          )
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
                        value={draftQuiz.gradeAndSection}
                        onChange={(e) =>
                          setDraftQuiz((prev) =>
                            prev
                              ? { ...prev, gradeAndSection: e.target.value }
                              : prev,
                          )
                        }
                        className={INPUT_CLASS}
                      />
                    </div>
                  </div>
                </div>

                {/* Sections & Items */}
                {draftQuiz.sections.map((section, sIdx) => {
                  const roman = ROMAN_PARTS[sIdx] ?? String(sIdx + 1);
                  return (
                    <section
                      key={section.type}
                      aria-label={`Part ${roman}. ${section.title}`}
                      className="bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-lg flex flex-col gap-gutter-md"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-gutter-sm pb-gutter-sm border-b border-outline-variant">
                        <h2 className="font-title text-title-lg text-primary">
                          Part {roman}. {section.title} ({section.items.length}{" "}
                          {section.items.length === 1 ? "item" : "items"})
                        </h2>
                      </div>

                      <div className="flex flex-col gap-gutter-xs">
                        <label
                          htmlFor={`${baseId}-dir-${sIdx}`}
                          className="font-label text-label-md text-on-surface"
                        >
                          Directions
                        </label>
                        <input
                          id={`${baseId}-dir-${sIdx}`}
                          type="text"
                          value={section.directions}
                          onChange={(e) =>
                            updateSectionDirections(sIdx, e.target.value)
                          }
                          className={INPUT_CLASS}
                        />
                      </div>

                      <div className="flex flex-col gap-gutter-md">
                        {section.items.map((item, iIdx) => (
                          <div
                            key={item.id}
                            className="p-gutter-md rounded-md bg-surface-container-low border border-outline-variant flex flex-col gap-gutter-sm"
                          >
                            <div className="flex flex-col gap-gutter-xs">
                              <label
                                htmlFor={`${baseId}-q-${sIdx}-${iIdx}`}
                                className="font-label text-label-md text-on-surface"
                              >
                                Item {iIdx + 1} Question
                              </label>
                              <textarea
                                id={`${baseId}-q-${sIdx}-${iIdx}`}
                                rows={2}
                                value={item.prompt}
                                onChange={(e) =>
                                  updateItemField(
                                    sIdx,
                                    iIdx,
                                    "prompt",
                                    e.target.value,
                                  )
                                }
                                className={INPUT_CLASS}
                              />
                            </div>

                            {section.type === "multipleChoice" &&
                              item.choices && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter-sm">
                                  {item.choices.map((choice, cIdx) => (
                                    <div
                                      key={cIdx}
                                      className="flex flex-col gap-gutter-xs"
                                    >
                                      <label
                                        htmlFor={`${baseId}-c-${sIdx}-${iIdx}-${cIdx}`}
                                        className="font-label text-label-sm text-on-surface-variant"
                                      >
                                        Choice {String.fromCharCode(65 + cIdx)}
                                      </label>
                                      <input
                                        id={`${baseId}-c-${sIdx}-${iIdx}-${cIdx}`}
                                        type="text"
                                        value={choice}
                                        onChange={(e) =>
                                          updateChoice(
                                            sIdx,
                                            iIdx,
                                            cIdx,
                                            e.target.value,
                                          )
                                        }
                                        className={INPUT_CLASS}
                                      />
                                    </div>
                                  ))}
                                </div>
                              )}

                            <div className="flex flex-col gap-gutter-xs">
                              <label
                                htmlFor={`${baseId}-a-${sIdx}-${iIdx}`}
                                className="font-label text-label-md text-on-surface"
                              >
                                Answer Key
                              </label>
                              <input
                                id={`${baseId}-a-${sIdx}-${iIdx}`}
                                type="text"
                                value={item.answer}
                                onChange={(e) =>
                                  updateItemField(
                                    sIdx,
                                    iIdx,
                                    "answer",
                                    e.target.value,
                                  )
                                }
                                className={INPUT_CLASS}
                              />
                            </div>

                            {section.type === "essayRubric" && (
                              <div className="flex flex-col gap-gutter-xs">
                                <label
                                  htmlFor={`${baseId}-r-${sIdx}-${iIdx}`}
                                  className="font-label text-label-md text-on-surface"
                                >
                                  Rubric
                                </label>
                                <textarea
                                  id={`${baseId}-r-${sIdx}-${iIdx}`}
                                  rows={2}
                                  value={item.rubric ?? ""}
                                  onChange={(e) =>
                                    updateItemField(
                                      sIdx,
                                      iIdx,
                                      "rubric",
                                      e.target.value,
                                    )
                                  }
                                  className={INPUT_CLASS}
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })}

                <div className="py-gutter-sm px-gutter-md rounded bg-surface-container border border-dashed border-outline-variant flex items-center justify-center gap-gutter-sm text-on-surface-variant">
                  <span
                    className="material-symbols-outlined text-title-md"
                    aria-hidden="true"
                  >
                    insert_page_break
                  </span>
                  <span className="font-mono text-mono-md">
                    Hard Page Break — Answer Key prints on final .docx page
                  </span>
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
