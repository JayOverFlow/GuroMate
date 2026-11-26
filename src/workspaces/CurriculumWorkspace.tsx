import { useId } from "react";
import {
  BOW_TERMS,
  GRADE_LEVELS,
  QUARTERS,
  TLE_COMPONENTS,
  type CurriculumCompetency,
  type TleComponent,
} from "../engine/types";
import {
  COMPONENT_LABELS,
  COMPONENT_SHORT_LABELS,
  emptyCustomForm,
  formatGradeLabel,
  formFromItem,
  toggleArrayValue,
  useCurriculumWorkspace,
  type BowFilterMode,
} from "../hooks/useCurriculumWorkspace";

const COMPONENT_BADGE_CLASSES: Record<TleComponent, string> = {
  ICT: "bg-tertiary-container text-on-tertiary-container",
  FCS: "bg-secondary-container text-on-secondary-container",
  AFA: "bg-success-container text-on-success-container",
  IA: "bg-surface-variant text-on-surface-variant",
  SHS_CORE: "bg-primary-container text-on-primary-container",
};

function CompetencyBadges({
  item,
  showSector = false,
  showWeek = false,
}: {
  item: CurriculumCompetency;
  showSector?: boolean;
  showWeek?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-gutter-xs">
      <span
        className={`px-gutter-sm py-0.5 rounded-full font-label text-label-sm ${COMPONENT_BADGE_CLASSES[item.component]}`}
      >
        {COMPONENT_SHORT_LABELS[item.component]}
      </span>
      <span className="px-gutter-sm py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label text-label-sm">
        {formatGradeLabel(item.gradeLevels)}
      </span>
      <span className="px-gutter-sm py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label text-label-sm">
        {item.quarterLabel}
      </span>
      {showSector && item.sector && (
        <span className="px-gutter-sm py-0.5 rounded-full bg-surface-variant text-on-surface-variant font-label text-label-sm">
          {item.sector}
        </span>
      )}
      {showWeek && item.budgetOfWork?.weekRange && (
        <span className="px-gutter-sm py-0.5 rounded-full bg-surface-container-low border border-outline-variant font-mono text-label-sm text-on-surface-variant tabular-nums">
          Wk {item.budgetOfWork.weekRange}
        </span>
      )}
      {item.source === "custom" && (
        <span className="px-gutter-sm py-0.5 rounded-full bg-warning-container text-on-warning-container font-label text-label-sm">
          Custom
        </span>
      )}
    </div>
  );
}

const INPUT_CLASS =
  "w-full px-gutter-md py-gutter-sm rounded bg-surface-container-lowest border border-outline-variant text-body-md text-on-surface focus:border-primary focus-visible:outline-2 focus-visible:outline-primary";

interface CurriculumWorkspaceProps {
  onUseInDll?: (competencyId: string) => void;
  onUseInDlp?: (competencyId: string) => void;
  onUseInQuiz?: (competencyId: string) => void;
}

export function CurriculumWorkspace({
  onUseInDll,
  onUseInDlp,
  onUseInQuiz,
}: CurriculumWorkspaceProps = {}) {
  const headingId = useId();
  const baseId = useId();

  const {
    allCatalog,
    items,
    loading,
    status,
    gradeLevel,
    quarterOrTerm,
    setQuarterOrTerm,
    component,
    sector,
    setSector,
    hasBow,
    setHasBow,
    query,
    setQuery,
    availableSectors,
    allSectors,
    selectedId,
    setSelectedId,
    selectedItem,
    notesDraft,
    setNotesDraft,
    savingNotes,
    showForm,
    setShowForm,
    formState,
    setFormState,
    savingCustom,
    handleGradeChange,
    handleComponentChange,
    handleSaveNotes,
    handleSaveCustom,
    handleDeleteCustom,
  } = useCurriculumWorkspace();

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
            Grades 7–12 MATATAG Curriculum Catalog
          </h1>
          <p className="font-body text-body-md text-on-surface-variant">
            Browse DepEd standards across ICT, AFA, FCS, IA, and SHS Core,
            enriched with Grades 7–12 Budgets of Work and custom competencies (
            <code className="font-mono text-mono-md">
              ./data/curriculum-custom.json
            </code>
            ).
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setFormState(emptyCustomForm());
            setShowForm((prev) => !prev);
          }}
          className="inline-flex items-center justify-center gap-gutter-sm px-gutter-md py-gutter-sm rounded bg-primary text-on-primary font-label text-label-lg hover:bg-primary-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors duration-state-change"
        >
          <span
            className="material-symbols-outlined text-title-md"
            aria-hidden="true"
          >
            {showForm ? "close" : "add_circle"}
          </span>
          <span>
            {showForm ? "Close Custom Form" : "Add Custom Competency"}
          </span>
        </button>
      </div>

      {/* Status Banner */}
      <div
        role="status"
        aria-live="polite"
        hidden={!status}
        className={`rounded-md border p-gutter-md flex items-center gap-gutter-sm font-body text-body-md ${
          status?.tone === "error"
            ? "border-error bg-error-container text-on-error-container"
            : "border-success bg-success-container/60 text-on-success-container"
        }`}
      >
        <span
          className="material-symbols-outlined text-title-lg shrink-0"
          aria-hidden="true"
        >
          {status?.tone === "error" ? "error" : "check_circle"}
        </span>
        <span>{status?.text ?? ""}</span>
      </div>

      {/* Add / Edit Custom Competency Form */}
      {showForm && (
        <form
          onSubmit={(e) => void handleSaveCustom(e)}
          className="bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-lg flex flex-col gap-gutter-md"
        >
          <h2 className="font-title text-title-lg text-on-surface">
            {formState.id
              ? "Edit Custom Learning Competency"
              : "New Custom Learning Competency"}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter-md">
            <fieldset className="flex flex-col gap-gutter-xs">
              <legend className="font-label text-label-md text-on-surface mb-1">
                Grade Level(s)
              </legend>
              <div className="flex flex-wrap gap-gutter-sm">
                {GRADE_LEVELS.map((g) => (
                  <label
                    key={g}
                    className={`inline-flex items-center gap-gutter-xs px-gutter-sm py-gutter-xs rounded border cursor-pointer font-label text-label-md ${
                      formState.gradeLevels.includes(g)
                        ? "bg-surface-container-low border-primary text-primary"
                        : "bg-surface-container-lowest border-outline-variant text-on-surface"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={formState.gradeLevels.includes(g)}
                      onChange={() =>
                        setFormState((prev) => ({
                          ...prev,
                          gradeLevels: toggleArrayValue(prev.gradeLevels, g),
                        }))
                      }
                      className="accent-primary"
                    />
                    <span>G{g}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="flex flex-col gap-gutter-xs">
              <legend className="font-label text-label-md text-on-surface mb-1">
                Quarter(s)
              </legend>
              <div className="flex flex-wrap gap-gutter-sm">
                {QUARTERS.map((q) => (
                  <label
                    key={q}
                    className={`inline-flex items-center gap-gutter-xs px-gutter-sm py-gutter-xs rounded border cursor-pointer font-label text-label-md ${
                      formState.quarters.includes(q)
                        ? "bg-surface-container-low border-primary text-primary"
                        : "bg-surface-container-lowest border-outline-variant text-on-surface"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={formState.quarters.includes(q)}
                      onChange={() =>
                        setFormState((prev) => ({
                          ...prev,
                          quarters: toggleArrayValue(prev.quarters, q),
                        }))
                      }
                      className="accent-primary"
                    />
                    <span>Q{q}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col gap-gutter-xs">
              <label
                htmlFor={`${baseId}-custom-component`}
                className="font-label text-label-md text-on-surface"
              >
                Component
              </label>
              <select
                id={`${baseId}-custom-component`}
                value={formState.component}
                onChange={(e) =>
                  setFormState((prev) => ({
                    ...prev,
                    component: e.target.value as TleComponent,
                  }))
                }
                className={INPUT_CLASS}
              >
                {TLE_COMPONENTS.map((value) => (
                  <option key={value} value={value}>
                    {COMPONENT_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-gutter-xs">
              <label
                htmlFor={`${baseId}-custom-sector`}
                className="font-label text-label-md text-on-surface"
              >
                Sector (optional)
              </label>
              <input
                id={`${baseId}-custom-sector`}
                type="text"
                list={`${baseId}-sector-options`}
                value={formState.sector}
                onChange={(e) =>
                  setFormState((prev) => ({ ...prev, sector: e.target.value }))
                }
                placeholder="e.g. COMPUTER PROGRAMMING or General Mathematics"
                className={INPUT_CLASS}
              />
              <datalist id={`${baseId}-sector-options`}>
                {allSectors.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="flex flex-col gap-gutter-xs">
            <label
              htmlFor={`${baseId}-custom-topic`}
              className="font-label text-label-md text-on-surface"
            >
              Content Topic *
            </label>
            <input
              id={`${baseId}-custom-topic`}
              type="text"
              required
              value={formState.contentTopic}
              onChange={(e) =>
                setFormState((prev) => ({
                  ...prev,
                  contentTopic: e.target.value,
                }))
              }
              className={INPUT_CLASS}
            />
          </div>

          <div className="flex flex-col gap-gutter-xs">
            <label
              htmlFor={`${baseId}-custom-subtopics`}
              className="font-label text-label-md text-on-surface"
            >
              Content Sub-Topics (one per line)
            </label>
            <textarea
              id={`${baseId}-custom-subtopics`}
              rows={2}
              value={formState.contentSubTopicsText}
              onChange={(e) =>
                setFormState((prev) => ({
                  ...prev,
                  contentSubTopicsText: e.target.value,
                }))
              }
              className={INPUT_CLASS}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter-md">
            <div className="flex flex-col gap-gutter-xs">
              <label
                htmlFor={`${baseId}-custom-cs`}
                className="font-label text-label-md text-on-surface"
              >
                Content Standard *
              </label>
              <textarea
                id={`${baseId}-custom-cs`}
                rows={2}
                required
                value={formState.contentStandard}
                onChange={(e) =>
                  setFormState((prev) => ({
                    ...prev,
                    contentStandard: e.target.value,
                  }))
                }
                className={INPUT_CLASS}
              />
            </div>

            <div className="flex flex-col gap-gutter-xs">
              <label
                htmlFor={`${baseId}-custom-ps`}
                className="font-label text-label-md text-on-surface"
              >
                Performance Standard *
              </label>
              <textarea
                id={`${baseId}-custom-ps`}
                rows={2}
                required
                value={formState.performanceStandard}
                onChange={(e) =>
                  setFormState((prev) => ({
                    ...prev,
                    performanceStandard: e.target.value,
                  }))
                }
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div className="flex flex-col gap-gutter-xs">
            <label
              htmlFor={`${baseId}-custom-lc`}
              className="font-label text-label-md text-on-surface"
            >
              Learning Competency *
            </label>
            <textarea
              id={`${baseId}-custom-lc`}
              rows={2}
              required
              value={formState.learningCompetency}
              onChange={(e) =>
                setFormState((prev) => ({
                  ...prev,
                  learningCompetency: e.target.value,
                }))
              }
              className={INPUT_CLASS}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter-md">
            <div className="flex flex-col gap-gutter-xs">
              <label
                htmlFor={`${baseId}-custom-bow-term`}
                className="font-label text-label-md text-on-surface"
              >
                BoW Term (optional)
              </label>
              <input
                id={`${baseId}-custom-bow-term`}
                type="text"
                list={`${baseId}-bow-term-options`}
                placeholder="e.g. First Term or One-Term"
                value={formState.budgetOfWork.term}
                onChange={(e) =>
                  setFormState((prev) => ({
                    ...prev,
                    budgetOfWork: { ...prev.budgetOfWork, term: e.target.value },
                  }))
                }
                className={INPUT_CLASS}
              />
              <datalist id={`${baseId}-bow-term-options`}>
                {BOW_TERMS.map((term) => (
                  <option key={term} value={term} />
                ))}
              </datalist>
            </div>

            <div className="flex flex-col gap-gutter-xs">
              <label
                htmlFor={`${baseId}-custom-bow-week`}
                className="font-label text-label-md text-on-surface"
              >
                BoW Week Range (optional)
              </label>
              <input
                id={`${baseId}-custom-bow-week`}
                type="text"
                placeholder="e.g. 1 to 3"
                value={formState.budgetOfWork.weekRange}
                onChange={(e) =>
                  setFormState((prev) => ({
                    ...prev,
                    budgetOfWork: {
                      ...prev.budgetOfWork,
                      weekRange: e.target.value,
                    },
                  }))
                }
                className={INPUT_CLASS}
              />
            </div>

            <div className="flex flex-col gap-gutter-xs">
              <label
                htmlFor={`${baseId}-custom-bow-activities`}
                className="font-label text-label-md text-on-surface"
              >
                Suggested Activities (optional)
              </label>
              <textarea
                id={`${baseId}-custom-bow-activities`}
                rows={2}
                value={formState.budgetOfWork.suggestedActivities}
                onChange={(e) =>
                  setFormState((prev) => ({
                    ...prev,
                    budgetOfWork: {
                      ...prev.budgetOfWork,
                      suggestedActivities: e.target.value,
                    },
                  }))
                }
                className={INPUT_CLASS}
              />
            </div>

            <div className="flex flex-col gap-gutter-xs">
              <label
                htmlFor={`${baseId}-custom-bow-tasks`}
                className="font-label text-label-md text-on-surface"
              >
                Suggested Performance Tasks (optional)
              </label>
              <textarea
                id={`${baseId}-custom-bow-tasks`}
                rows={2}
                value={formState.budgetOfWork.suggestedPerformanceTasks}
                onChange={(e) =>
                  setFormState((prev) => ({
                    ...prev,
                    budgetOfWork: {
                      ...prev.budgetOfWork,
                      suggestedPerformanceTasks: e.target.value,
                    },
                  }))
                }
                className={INPUT_CLASS}
              />
            </div>

            <div className="flex flex-col gap-gutter-xs md:col-span-2">
              <label
                htmlFor={`${baseId}-custom-bow-source`}
                className="font-label text-label-md text-on-surface"
              >
                BoW Source Document (optional)
              </label>
              <input
                id={`${baseId}-custom-bow-source`}
                type="text"
                placeholder="e.g. DepEd MATATAG BoW — Grade 11 General Mathematics"
                value={formState.budgetOfWork.sourceDocument}
                onChange={(e) =>
                  setFormState((prev) => ({
                    ...prev,
                    budgetOfWork: {
                      ...prev.budgetOfWork,
                      sourceDocument: e.target.value,
                    },
                  }))
                }
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div className="flex flex-col gap-gutter-xs">
            <label
              htmlFor={`${baseId}-custom-notes`}
              className="font-label text-label-md text-on-surface"
            >
              Unpacked Budget of Work / Teaching Notes
            </label>
            <textarea
              id={`${baseId}-custom-notes`}
              rows={2}
              value={formState.customNotes}
              onChange={(e) =>
                setFormState((prev) => ({
                  ...prev,
                  customNotes: e.target.value,
                }))
              }
              className={INPUT_CLASS}
            />
          </div>

          <div className="flex flex-wrap items-center gap-gutter-sm">
            <button
              type="submit"
              disabled={savingCustom}
              className="inline-flex items-center justify-center gap-gutter-sm px-gutter-md py-gutter-sm rounded bg-primary text-on-primary font-label text-label-lg hover:bg-primary-container focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change disabled:opacity-60"
            >
              {savingCustom
                ? "Saving..."
                : formState.id
                  ? "Update Custom Competency"
                  : "Save Custom Competency"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setFormState(emptyCustomForm());
              }}
              className="inline-flex items-center justify-center gap-gutter-sm px-gutter-md py-gutter-sm rounded bg-surface-container-lowest border border-outline-variant font-label text-label-lg text-on-surface hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Search & Filter Bar */}
      <search className="bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-md grid grid-cols-1 md:grid-cols-12 gap-gutter-md items-end">
        <div className="flex flex-col gap-gutter-xs md:col-span-6">
          <label
            htmlFor={`${baseId}-query`}
            className="font-label text-label-md text-on-surface"
          >
            Search Catalog
          </label>
          <div className="relative flex items-center">
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-title-md text-on-surface-variant absolute left-3 pointer-events-none"
            >
              search
            </span>
            <input
              id={`${baseId}-query`}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search competency, topic, standard, source, or notes..."
              className="w-full pl-10 pr-gutter-md py-gutter-sm rounded bg-surface-container-lowest border border-outline-variant text-body-md text-on-surface placeholder:text-on-surface-variant focus:border-primary focus-visible:outline-2 focus-visible:outline-primary"
            />
          </div>
        </div>

        <div className="flex flex-col gap-gutter-xs md:col-span-6">
          <label
            htmlFor={`${baseId}-sector`}
            className="font-label text-label-md text-on-surface"
          >
            Sector
          </label>
          <select
            id={`${baseId}-sector`}
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            disabled={availableSectors.length === 0}
            className="w-full px-gutter-sm py-gutter-sm rounded bg-surface-container-lowest border border-outline-variant text-body-md text-on-surface focus:border-primary focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60"
          >
            <option value="">
              {availableSectors.length === 0
                ? "None available"
                : "All Sectors"}
            </option>
            {availableSectors.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-gutter-xs md:col-span-3">
          <label
            htmlFor={`${baseId}-grade`}
            className="font-label text-label-md text-on-surface"
          >
            Grade Level
          </label>
          <select
            id={`${baseId}-grade`}
            value={gradeLevel === "" ? "" : String(gradeLevel)}
            onChange={(e) => handleGradeChange(e.target.value)}
            className="w-full px-gutter-sm py-gutter-sm rounded bg-surface-container-lowest border border-outline-variant text-body-md text-on-surface focus:border-primary focus-visible:outline-2 focus-visible:outline-primary"
          >
            <option value="">All Grades (7–12)</option>
            {GRADE_LEVELS.map((g) => (
              <option key={g} value={String(g)}>
                Grade {g}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-gutter-xs md:col-span-3">
          <label
            htmlFor={`${baseId}-component`}
            className="font-label text-label-md text-on-surface"
          >
            Component
          </label>
          <select
            id={`${baseId}-component`}
            value={component}
            onChange={(e) => handleComponentChange(e.target.value)}
            className="w-full px-gutter-sm py-gutter-sm rounded bg-surface-container-lowest border border-outline-variant text-body-md text-on-surface focus:border-primary focus-visible:outline-2 focus-visible:outline-primary"
          >
            <option value="">All Components</option>
            {TLE_COMPONENTS.map((value) => (
              <option key={value} value={value}>
                {COMPONENT_SHORT_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-gutter-xs md:col-span-3">
          <label
            htmlFor={`${baseId}-quarter`}
            className="font-label text-label-md text-on-surface"
          >
            Quarter / Term
          </label>
          <select
            id={`${baseId}-quarter`}
            value={quarterOrTerm}
            onChange={(e) => setQuarterOrTerm(e.target.value)}
            className="w-full px-gutter-sm py-gutter-sm rounded bg-surface-container-lowest border border-outline-variant text-body-md text-on-surface focus:border-primary focus-visible:outline-2 focus-visible:outline-primary"
          >
            <option value="">All Quarters &amp; Terms</option>
            <optgroup label="Curriculum Guide Quarters">
              {QUARTERS.map((q) => (
                <option key={q} value={`q:${q}`}>
                  Quarter {q}
                </option>
              ))}
            </optgroup>
            <optgroup label="Budget of Work Terms">
              {BOW_TERMS.map((term) => (
                <option key={term} value={`t:${term}`}>
                  {term} (BoW)
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        <div className="flex flex-col gap-gutter-xs md:col-span-3">
          <label
            htmlFor={`${baseId}-has-bow`}
            className="font-label text-label-md text-on-surface"
          >
            Budget of Work
          </label>
          <select
            id={`${baseId}-has-bow`}
            value={hasBow}
            onChange={(e) => setHasBow(e.target.value as BowFilterMode)}
            className="w-full px-gutter-sm py-gutter-sm rounded bg-surface-container-lowest border border-outline-variant text-body-md text-on-surface focus:border-primary focus-visible:outline-2 focus-visible:outline-primary"
          >
            <option value="all">All Competencies</option>
            <option value="with_bow">Has BoW</option>
            <option value="without_bow">Without BoW</option>
          </select>
        </div>
      </search>

      {/* Master-Detail Catalog Grid */}
      {loading ? (
        <div className="rounded-md border border-outline-variant bg-surface-container-lowest p-gutter-lg text-on-surface-variant font-body text-body-md">
          Loading curriculum catalog...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter-lg items-start">
          {/* Left Column: Competency List */}
          <div className="lg:col-span-5 flex flex-col gap-gutter-sm">
            <div className="flex items-center justify-between px-gutter-xs">
              <span className="font-label text-label-md text-on-surface-variant">
                Showing <strong className="text-on-surface">{items.length}</strong>{" "}
                of {allCatalog.length || items.length}{" "}
                {items.length === 1 ? "Competency" : "Competencies"}
              </span>
              <span className="font-label text-label-sm text-primary">
                BoW Enriched
              </span>
            </div>

            {items.length === 0 ? (
              <div className="bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-lg font-body text-body-md text-on-surface-variant">
                No Learning Competencies match the selected filters.
              </div>
            ) : (
              <ul className="flex flex-col gap-gutter-sm max-h-[70vh] overflow-y-auto pr-1">
                {items.map((item) => {
                  const isSelected = item.id === selectedId;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        aria-current={isSelected ? "true" : undefined}
                        onClick={() => setSelectedId(item.id)}
                        className={`w-full text-left rounded-md p-gutter-md flex flex-col gap-gutter-xs transition-colors duration-state-change focus-visible:outline-2 focus-visible:outline-primary ${
                          isSelected
                            ? "bg-surface-container-lowest border-2 border-primary"
                            : "bg-surface-container-lowest border border-outline-variant hover:border-primary"
                        }`}
                      >
                        <CompetencyBadges item={item} showWeek />
                        <h2 className="font-title text-title-md text-on-surface text-pretty">
                          {item.contentTopic}
                        </h2>
                        <p className="font-body text-body-sm text-on-surface-variant text-pretty line-clamp-2">
                          {item.sector ? `${item.sector} · ` : ""}
                          {item.learningCompetency}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Right Column: Competency & BoW Detail Inspector */}
          <article className="lg:col-span-7 bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-lg flex flex-col gap-gutter-md lg:sticky lg:top-20">
            {!selectedItem ? (
              <p className="font-body text-body-md text-on-surface-variant">
                Select a Learning Competency from the catalog to inspect its
                Content, Standards, and Budget of Work details.
              </p>
            ) : (
              <>
                <header className="flex flex-wrap items-start justify-between gap-gutter-md pb-gutter-md border-b border-outline-variant">
                  <div className="flex flex-col gap-gutter-xs min-w-0 flex-1">
                    <CompetencyBadges item={selectedItem} showSector />
                    <h2 className="font-headline text-headline-md text-on-surface mt-1">
                      {selectedItem.contentTopic}
                    </h2>
                    {selectedItem.sectorDescription && (
                      <p className="font-body text-body-sm text-on-surface-variant">
                        {selectedItem.sectorDescription}
                      </p>
                    )}
                  </div>

                  {selectedItem.source === "custom" && (
                    <div className="flex flex-wrap items-center gap-gutter-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setFormState(formFromItem(selectedItem));
                          setShowForm(true);
                        }}
                        className="inline-flex items-center gap-gutter-xs px-gutter-sm py-gutter-xs rounded bg-surface-container-low border border-outline-variant font-label text-label-md text-on-surface hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        Edit Competency
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteCustom(selectedItem)}
                        className="inline-flex items-center gap-gutter-xs px-gutter-sm py-gutter-xs rounded bg-error-container text-on-error-container border border-error/30 font-label text-label-md hover:opacity-90 focus-visible:outline-2 focus-visible:outline-error"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </header>

                {/* Direct Generator Shortcuts */}
                <div
                  role="group"
                  aria-label="Create lesson or quiz from this Learning Competency"
                  className="flex flex-wrap items-center gap-gutter-sm"
                >
                  <button
                    type="button"
                    onClick={() => onUseInDll?.(selectedItem.id)}
                    className="inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-xs rounded bg-primary text-on-primary font-label text-label-md hover:bg-primary-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors duration-state-change"
                  >
                    <span
                      className="material-symbols-outlined text-title-md"
                      aria-hidden="true"
                    >
                      view_week
                    </span>
                    <span>Use in DLL</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onUseInDlp?.(selectedItem.id)}
                    className="inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-xs rounded bg-surface-container-low border border-outline-variant font-label text-label-md text-on-surface hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors duration-state-change"
                  >
                    <span
                      className="material-symbols-outlined text-title-md text-primary"
                      aria-hidden="true"
                    >
                      splitscreen
                    </span>
                    <span>Use in DLP</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onUseInQuiz?.(selectedItem.id)}
                    className="inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-xs rounded bg-surface-container-low border border-outline-variant font-label text-label-md text-on-surface hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors duration-state-change"
                  >
                    <span
                      className="material-symbols-outlined text-title-md text-primary"
                      aria-hidden="true"
                    >
                      quiz
                    </span>
                    <span>Use in Quiz</span>
                  </button>
                </div>

                <div className="flex flex-col gap-gutter-sm">
                  <div className="flex flex-col gap-gutter-xs">
                    <span className="font-label text-label-md text-primary">
                      Learning Competency
                    </span>
                    <p className="font-body text-body-md text-on-surface text-pretty">
                      {selectedItem.learningCompetency}
                    </p>
                  </div>

                  {selectedItem.contentSubTopics.length > 0 && (
                    <div className="flex flex-col gap-gutter-xs">
                      <span className="font-label text-label-md text-on-surface">
                        Content Sub-topics (MATATAG CG)
                      </span>
                      <ul className="list-disc list-inside font-body text-body-sm text-on-surface-variant flex flex-col gap-gutter-xs">
                        {selectedItem.contentSubTopics.map((sub, idx) => (
                          <li key={`${sub}-${idx}`}>{sub}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Content & Performance Standards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter-md p-gutter-md rounded bg-surface-container-low border border-outline-variant">
                  <div className="flex flex-col gap-gutter-xs">
                    <span className="font-label text-label-md text-on-surface">
                      Content Standard
                    </span>
                    <p className="font-body text-body-sm text-on-surface-variant text-pretty">
                      {selectedItem.contentStandard}
                    </p>
                  </div>
                  <div className="flex flex-col gap-gutter-xs">
                    <span className="font-label text-label-md text-on-surface">
                      Performance Standard
                    </span>
                    <p className="font-body text-body-sm text-on-surface-variant text-pretty">
                      {selectedItem.performanceStandard}
                    </p>
                  </div>
                </div>

                {/* Budget of Work Enrichment */}
                {selectedItem.budgetOfWork && (
                  <div className="flex flex-col gap-gutter-sm pt-gutter-sm border-t border-outline-variant">
                    <div className="flex items-center justify-between gap-gutter-sm">
                      <span className="font-title text-title-md text-primary">
                        Budget of Work (
                        {selectedItem.budgetOfWork.term || "BoW"})
                      </span>
                      {selectedItem.budgetOfWork.weekRange && (
                        <span className="font-mono text-mono-md text-on-surface-variant tabular-nums">
                          Week {selectedItem.budgetOfWork.weekRange}
                        </span>
                      )}
                    </div>

                    {selectedItem.budgetOfWork.sourceDocument && (
                      <p className="font-body text-body-sm text-on-surface-variant">
                        Source:{" "}
                        <span className="font-mono text-mono-md text-on-surface">
                          {selectedItem.budgetOfWork.sourceDocument}
                        </span>
                      </p>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter-md">
                      {selectedItem.budgetOfWork.suggestedActivities && (
                        <div className="flex flex-col gap-gutter-xs">
                          <span className="font-label text-label-md text-on-surface">
                            Suggested Activities
                          </span>
                          <p className="font-body text-body-sm text-on-surface-variant whitespace-pre-wrap text-pretty">
                            {selectedItem.budgetOfWork.suggestedActivities}
                          </p>
                        </div>
                      )}
                      {selectedItem.budgetOfWork.suggestedPerformanceTasks && (
                        <div className="flex flex-col gap-gutter-xs">
                          <span className="font-label text-label-md text-on-surface">
                            Suggested Performance Tasks
                          </span>
                          <p className="font-body text-body-sm text-on-surface-variant whitespace-pre-wrap text-pretty">
                            {
                              selectedItem.budgetOfWork
                                .suggestedPerformanceTasks
                            }
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Editable Unpacked BoW Notes */}
                <form
                  onSubmit={(e) => void handleSaveNotes(e)}
                  className="flex flex-col gap-gutter-sm pt-gutter-sm border-t border-outline-variant"
                >
                  <div className="flex flex-col gap-gutter-xs">
                    <div className="flex flex-wrap items-center justify-between gap-gutter-xs">
                      <label
                        htmlFor={`${baseId}-detail-notes`}
                        className="font-label text-label-md text-on-surface"
                      >
                        Custom / Unpacked Budget of Work Notes
                      </label>
                      <span className="font-body text-body-sm text-on-surface-variant">
                        Saved locally to disk alongside this competency.
                      </span>
                    </div>
                    <textarea
                      id={`${baseId}-detail-notes`}
                      rows={3}
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      placeholder="Add daily unpacked objectives, lab tools needed, or pacing adjustments..."
                      className="w-full px-gutter-md py-gutter-sm rounded bg-surface-container-low border border-outline-variant text-body-sm text-on-surface focus:border-primary focus-visible:outline-2 focus-visible:outline-primary"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={savingNotes}
                      className="inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-xs rounded border border-outline-variant bg-surface-container-lowest font-label text-label-md text-on-surface hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change disabled:opacity-60"
                    >
                      <span
                        className="material-symbols-outlined text-title-md text-primary"
                        aria-hidden="true"
                      >
                        save
                      </span>
                      <span>
                        {savingNotes ? "Saving..." : "Save BoW Notes"}
                      </span>
                    </button>
                  </div>
                </form>
              </>
            )}
          </article>
        </div>
      )}
    </section>
  );
}
