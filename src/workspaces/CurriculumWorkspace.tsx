import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  BOW_TERMS,
  GRADE_LEVELS,
  QUARTERS,
  TLE_COMPONENTS,
  type BudgetOfWorkInfo,
  type CurriculumCompetency,
  type GradeLevel,
  type QuarterNumber,
  type TleComponent,
} from "../engine/types";

const COMPONENT_LABELS: Record<TleComponent, string> = {
  ICT: "ICT — Information & Communications Technology",
  AFA: "AFA — Agriculture & Fishery Arts",
  FCS: "FCS — Family & Consumer Science",
  IA: "IA — Industrial Arts",
};

interface StatusState {
  tone: "success" | "error";
  text: string;
}

interface CustomFormState {
  id?: string;
  gradeLevels: GradeLevel[];
  quarters: QuarterNumber[];
  component: TleComponent;
  sector: string;
  contentTopic: string;
  contentSubTopicsText: string;
  contentStandard: string;
  performanceStandard: string;
  learningCompetency: string;
  budgetOfWork: BudgetOfWorkInfo;
  customNotes: string;
}

function emptyCustomForm(): CustomFormState {
  return {
    gradeLevels: [7],
    quarters: [1],
    component: "ICT",
    sector: "",
    contentTopic: "",
    contentSubTopicsText: "",
    contentStandard: "",
    performanceStandard: "",
    learningCompetency: "",
    budgetOfWork: {
      term: "",
      weekRange: "",
      suggestedActivities: "",
      suggestedPerformanceTasks: "",
    },
    customNotes: "",
  };
}

function formFromItem(item: CurriculumCompetency): CustomFormState {
  return {
    id: item.id,
    gradeLevels: [...item.gradeLevels],
    quarters: [...item.quarters],
    component: item.component,
    sector: item.sector ?? "",
    contentTopic: item.contentTopic,
    contentSubTopicsText: item.contentSubTopics.join("\n"),
    contentStandard: item.contentStandard,
    performanceStandard: item.performanceStandard,
    learningCompetency: item.learningCompetency,
    budgetOfWork: {
      term: item.budgetOfWork?.term ?? "",
      weekRange: item.budgetOfWork?.weekRange ?? "",
      suggestedActivities: item.budgetOfWork?.suggestedActivities ?? "",
      suggestedPerformanceTasks:
        item.budgetOfWork?.suggestedPerformanceTasks ?? "",
    },
    customNotes: item.customNotes ?? "",
  };
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string; message?: string };
    return data.error || data.message || `Request failed (HTTP ${res.status}).`;
  } catch {
    return `Request failed (HTTP ${res.status}).`;
  }
}

function toggleArrayValue<T extends number>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value].sort((a, b) => a - b);
}

function formatGradeLabel(grades: GradeLevel[]): string {
  return grades.length > 1
    ? `Grades ${grades.join("–")}`
    : `Grade ${grades[0] ?? ""}`;
}

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
    <div className="curriculum-badges">
      <span className="badge">{formatGradeLabel(item.gradeLevels)}</span>
      <span className="badge">{item.component}</span>
      <span className="badge">{item.quarterLabel}</span>
      {showSector && item.sector && <span className="badge">{item.sector}</span>}
      {showWeek && item.budgetOfWork?.weekRange && (
        <span className="badge badge-bow">Wk {item.budgetOfWork.weekRange}</span>
      )}
      {item.source === "custom" && (
        <span className="badge badge-custom">Custom</span>
      )}
    </div>
  );
}

export function CurriculumWorkspace() {
  const headingId = useId();
  const baseId = useId();

  const [allCatalog, setAllCatalog] = useState<CurriculumCompetency[]>([]);
  const [items, setItems] = useState<CurriculumCompetency[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusState | null>(null);

  const [gradeLevel, setGradeLevel] = useState<GradeLevel | "">("");
  const [quarterOrTerm, setQuarterOrTerm] = useState<string>("");
  const [component, setComponent] = useState<TleComponent | "">("");
  const [sector, setSector] = useState<string>("");
  const [query, setQuery] = useState<string>("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState<string>("");
  const [savingNotes, setSavingNotes] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [formState, setFormState] = useState<CustomFormState>(emptyCustomForm);
  const [savingCustom, setSavingCustom] = useState(false);

  const reportError = useCallback((err: unknown) => {
    setStatus({
      tone: "error",
      text: `Error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }, []);

  const sectorsForScope = useCallback(
    (nextGrade: GradeLevel | "", nextComponent: TleComponent | "") => {
      const set = new Set<string>();
      for (const item of allCatalog) {
        if (!item.sector) continue;
        if (nextGrade !== "" && !item.gradeLevels.includes(nextGrade)) continue;
        if (nextComponent !== "" && item.component !== nextComponent) continue;
        set.add(item.sector);
      }
      return [...set].sort();
    },
    [allCatalog],
  );

  const availableSectors = useMemo(
    () => sectorsForScope(gradeLevel, component),
    [sectorsForScope, gradeLevel, component],
  );

  const allSectors = useMemo(() => sectorsForScope("", ""), [sectorsForScope]);

  const buildFilterUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (gradeLevel !== "") params.set("gradeLevel", String(gradeLevel));
    if (quarterOrTerm.startsWith("q:")) {
      params.set("quarter", quarterOrTerm.slice(2));
    } else if (quarterOrTerm.startsWith("t:")) {
      params.set("term", quarterOrTerm.slice(2));
    }
    if (component !== "") params.set("component", component);
    if (sector) params.set("sector", sector);
    if (query.trim()) params.set("query", query.trim());
    const qs = params.toString();
    return qs ? `/api/curriculum?${qs}` : "/api/curriculum";
  }, [gradeLevel, quarterOrTerm, component, sector, query]);

  const reloadFullCatalog = useCallback(async (signal?: AbortSignal) => {
    const res = await fetch("/api/curriculum", { signal });
    if (!res.ok) throw new Error(await readErrorMessage(res));
    const data = (await res.json()) as CurriculumCompetency[];
    setAllCatalog(data);
  }, []);

  const reloadFiltered = useCallback(
    async (preferredId?: string, signal?: AbortSignal) => {
      const res = await fetch(buildFilterUrl(), { signal });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const filtered = (await res.json()) as CurriculumCompetency[];
      setItems(filtered);
      setSelectedId((prev) => {
        const targetId = preferredId ?? prev;
        if (targetId && filtered.some((i) => i.id === targetId)) {
          return targetId;
        }
        return filtered[0]?.id ?? null;
      });
    },
    [buildFilterUrl],
  );

  useEffect(() => {
    const controller = new AbortController();
    void reloadFullCatalog(controller.signal).catch((err) => {
      if (!controller.signal.aborted) reportError(err);
    });
    return () => controller.abort();
  }, [reloadFullCatalog, reportError]);

  useEffect(() => {
    const controller = new AbortController();
    void reloadFiltered(undefined, controller.signal)
      .catch((err) => {
        if (!controller.signal.aborted) reportError(err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadFiltered, reportError]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  useEffect(() => {
    setNotesDraft(selectedItem?.customNotes ?? "");
  }, [selectedItem?.id, selectedItem?.customNotes]);

  function handleGradeChange(raw: string) {
    const nextGrade = raw ? (Number(raw) as GradeLevel) : "";
    setGradeLevel(nextGrade);
    if (sector && !sectorsForScope(nextGrade, component).includes(sector)) {
      setSector("");
    }
  }

  function handleComponentChange(raw: string) {
    const nextComp = raw ? (raw as TleComponent) : "";
    setComponent(nextComp);
    if (sector && !sectorsForScope(gradeLevel, nextComp).includes(sector)) {
      setSector("");
    }
  }

  async function refreshAfterMutation(preferredId?: string) {
    await Promise.all([reloadFullCatalog(), reloadFiltered(preferredId)]);
  }

  async function handleSaveNotes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedItem) return;
    setSavingNotes(true);
    setStatus(null);
    try {
      const res = await fetch(
        `/api/curriculum/${encodeURIComponent(selectedItem.id)}/notes`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customNotes: notesDraft }),
        },
      );
      if (!res.ok) throw new Error(await readErrorMessage(res));
      await refreshAfterMutation(selectedItem.id);
      setStatus({
        tone: "success",
        text: "Unpacked Budget of Work notes saved to local disk.",
      });
    } catch (err) {
      reportError(err);
    } finally {
      setSavingNotes(false);
    }
  }

  async function handleSaveCustom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingCustom(true);
    setStatus(null);
    try {
      const payload = {
        gradeLevels: formState.gradeLevels,
        quarters: formState.quarters,
        component: formState.component,
        sector: formState.sector.trim() || null,
        contentTopic: formState.contentTopic,
        contentSubTopics: formState.contentSubTopicsText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        contentStandard: formState.contentStandard,
        performanceStandard: formState.performanceStandard,
        learningCompetency: formState.learningCompetency,
        customNotes: formState.customNotes,
        budgetOfWork: formState.budgetOfWork,
      };

      const isEdit = Boolean(formState.id);
      const url = isEdit
        ? `/api/curriculum/custom/${encodeURIComponent(formState.id!)}`
        : "/api/curriculum/custom";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const saved = (await res.json()) as CurriculumCompetency;
      setShowForm(false);
      setFormState(emptyCustomForm());
      await refreshAfterMutation(saved.id);
      setStatus({
        tone: "success",
        text: isEdit
          ? "Custom Learning Competency updated."
          : "Custom Learning Competency added to local catalog.",
      });
    } catch (err) {
      reportError(err);
    } finally {
      setSavingCustom(false);
    }
  }

  async function handleDeleteCustom(item: CurriculumCompetency) {
    setStatus(null);
    try {
      const res = await fetch(
        `/api/curriculum/custom/${encodeURIComponent(item.id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(await readErrorMessage(res));
      await refreshAfterMutation();
      setStatus({
        tone: "success",
        text: "Custom Learning Competency deleted.",
      });
    } catch (err) {
      reportError(err);
    }
  }

  return (
    <section className="curriculum-workspace" aria-labelledby={headingId}>
      <div className="workspace-header curriculum-header-row">
        <div>
          <h1 id={headingId} tabIndex={-1}>
            MATATAG TLE Curriculum Catalog
          </h1>
          <p className="workspace-subtitle">
            Grades 7–10 Curriculum Guide, Grade 7 Budget of Work, and custom
            Learning Competencies (<code>./data/curriculum-custom.json</code>).
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setFormState(emptyCustomForm());
            setShowForm((prev) => !prev);
          }}
        >
          {showForm ? "Close Custom Form" : "Add Custom Competency"}
        </button>
      </div>

      <div
        className="status-banner"
        role="status"
        aria-live="polite"
        data-tone={status?.tone}
        hidden={!status}
      >
        {status?.text ?? ""}
      </div>

      {showForm && (
        <form
          className="card curriculum-custom-form"
          onSubmit={(e) => void handleSaveCustom(e)}
        >
          <h2>
            {formState.id
              ? "Edit Custom Learning Competency"
              : "New Custom Learning Competency"}
          </h2>

          <div className="curriculum-form-grid">
            <fieldset className="curriculum-check-group">
              <legend>Grade Level(s)</legend>
              <div className="curriculum-check-row">
                {GRADE_LEVELS.map((g) => (
                  <label key={g} className="curriculum-check-pill">
                    <input
                      type="checkbox"
                      checked={formState.gradeLevels.includes(g)}
                      onChange={() =>
                        setFormState((prev) => ({
                          ...prev,
                          gradeLevels: toggleArrayValue(prev.gradeLevels, g),
                        }))
                      }
                    />
                    <span>G{g}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="curriculum-check-group">
              <legend>Quarter(s)</legend>
              <div className="curriculum-check-row">
                {QUARTERS.map((q) => (
                  <label key={q} className="curriculum-check-pill">
                    <input
                      type="checkbox"
                      checked={formState.quarters.includes(q)}
                      onChange={() =>
                        setFormState((prev) => ({
                          ...prev,
                          quarters: toggleArrayValue(prev.quarters, q),
                        }))
                      }
                    />
                    <span>Q{q}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="field">
              <label htmlFor={`${baseId}-custom-component`}>
                TLE Component
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
              >
                {TLE_COMPONENTS.map((value) => (
                  <option key={value} value={value}>
                    {COMPONENT_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor={`${baseId}-custom-sector`}>
                Sector (optional, Grades 9–10)
              </label>
              <input
                id={`${baseId}-custom-sector`}
                type="text"
                list={`${baseId}-sector-options`}
                value={formState.sector}
                onChange={(e) =>
                  setFormState((prev) => ({ ...prev, sector: e.target.value }))
                }
                placeholder="e.g. COMPUTER PROGRAMMING"
              />
              <datalist id={`${baseId}-sector-options`}>
                {allSectors.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="field">
            <label htmlFor={`${baseId}-custom-topic`}>Content Topic *</label>
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
            />
          </div>

          <div className="field">
            <label htmlFor={`${baseId}-custom-subtopics`}>
              Content Sub-Topics (one per line)
            </label>
            <textarea
              id={`${baseId}-custom-subtopics`}
              value={formState.contentSubTopicsText}
              onChange={(e) =>
                setFormState((prev) => ({
                  ...prev,
                  contentSubTopicsText: e.target.value,
                }))
              }
            />
          </div>

          <div className="field">
            <label htmlFor={`${baseId}-custom-cs`}>Content Standard *</label>
            <textarea
              id={`${baseId}-custom-cs`}
              required
              value={formState.contentStandard}
              onChange={(e) =>
                setFormState((prev) => ({
                  ...prev,
                  contentStandard: e.target.value,
                }))
              }
            />
          </div>

          <div className="field">
            <label htmlFor={`${baseId}-custom-ps`}>
              Performance Standard *
            </label>
            <textarea
              id={`${baseId}-custom-ps`}
              required
              value={formState.performanceStandard}
              onChange={(e) =>
                setFormState((prev) => ({
                  ...prev,
                  performanceStandard: e.target.value,
                }))
              }
            />
          </div>

          <div className="field">
            <label htmlFor={`${baseId}-custom-lc`}>
              Learning Competency *
            </label>
            <textarea
              id={`${baseId}-custom-lc`}
              required
              value={formState.learningCompetency}
              onChange={(e) =>
                setFormState((prev) => ({
                  ...prev,
                  learningCompetency: e.target.value,
                }))
              }
            />
          </div>

          <div className="curriculum-form-grid">
            <div className="field">
              <label htmlFor={`${baseId}-custom-bow-term`}>
                BoW Term (optional)
              </label>
              <input
                id={`${baseId}-custom-bow-term`}
                type="text"
                placeholder="e.g. First Term"
                value={formState.budgetOfWork.term}
                onChange={(e) =>
                  setFormState((prev) => ({
                    ...prev,
                    budgetOfWork: { ...prev.budgetOfWork, term: e.target.value },
                  }))
                }
              />
            </div>

            <div className="field">
              <label htmlFor={`${baseId}-custom-bow-week`}>
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
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor={`${baseId}-custom-bow-activities`}>
              Suggested Activities (optional)
            </label>
            <textarea
              id={`${baseId}-custom-bow-activities`}
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
            />
          </div>

          <div className="field">
            <label htmlFor={`${baseId}-custom-bow-tasks`}>
              Suggested Performance Tasks (optional)
            </label>
            <textarea
              id={`${baseId}-custom-bow-tasks`}
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
            />
          </div>

          <div className="field">
            <label htmlFor={`${baseId}-custom-notes`}>
              Unpacked Budget of Work / Teaching Notes
            </label>
            <textarea
              id={`${baseId}-custom-notes`}
              value={formState.customNotes}
              onChange={(e) =>
                setFormState((prev) => ({
                  ...prev,
                  customNotes: e.target.value,
                }))
              }
            />
          </div>

          <div className="actions-row">
            <button
              type="submit"
              className="btn-primary"
              disabled={savingCustom}
            >
              {savingCustom
                ? "Saving..."
                : formState.id
                  ? "Update Custom Competency"
                  : "Save Custom Competency"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setShowForm(false);
                setFormState(emptyCustomForm());
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="card curriculum-filters" role="search">
        <div className="field">
          <label htmlFor={`${baseId}-grade`}>Grade Level</label>
          <select
            id={`${baseId}-grade`}
            value={gradeLevel === "" ? "" : String(gradeLevel)}
            onChange={(e) => handleGradeChange(e.target.value)}
          >
            <option value="">All Grades (7–10)</option>
            {GRADE_LEVELS.map((g) => (
              <option key={g} value={String(g)}>
                Grade {g}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor={`${baseId}-quarter`}>Quarter / Term</label>
          <select
            id={`${baseId}-quarter`}
            value={quarterOrTerm}
            onChange={(e) => setQuarterOrTerm(e.target.value)}
          >
            <option value="">All Quarters &amp; Terms</option>
            <optgroup label="Curriculum Guide Quarters">
              {QUARTERS.map((q) => (
                <option key={q} value={`q:${q}`}>
                  Quarter {q}
                </option>
              ))}
            </optgroup>
            <optgroup label="Grade 7 Budget of Work Terms">
              {BOW_TERMS.map((term) => (
                <option key={term} value={`t:${term}`}>
                  {term} (BoW)
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        <div className="field">
          <label htmlFor={`${baseId}-component`}>TLE Component</label>
          <select
            id={`${baseId}-component`}
            value={component}
            onChange={(e) => handleComponentChange(e.target.value)}
          >
            <option value="">All Components</option>
            {TLE_COMPONENTS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor={`${baseId}-sector`}>Specialized Sector</label>
          <select
            id={`${baseId}-sector`}
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            disabled={availableSectors.length === 0}
          >
            <option value="">
              {availableSectors.length === 0
                ? "None (Grades 7–8 exploratory)"
                : "All Sectors"}
            </option>
            {availableSectors.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="field curriculum-search-field">
          <label htmlFor={`${baseId}-query`}>Search Catalog</label>
          <input
            id={`${baseId}-query`}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search competency, topic, standard, or notes..."
          />
        </div>
      </div>

      {loading ? (
        <p>Loading curriculum catalog...</p>
      ) : (
        <div className="curriculum-grid">
          <div className="card curriculum-list-panel">
            <div className="curriculum-list-meta">
              <strong>{items.length}</strong>{" "}
              {items.length === 1 ? "Learning Competency" : "Learning Competencies"}
            </div>
            {items.length === 0 ? (
              <p className="hint">
                No Learning Competencies match the selected filters.
              </p>
            ) : (
              <ul className="curriculum-list">
                {items.map((item) => {
                  const isSelected = item.id === selectedId;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`curriculum-list-item${isSelected ? " is-selected" : ""}`}
                        aria-current={isSelected ? "true" : undefined}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <CompetencyBadges item={item} showWeek />
                        <div className="curriculum-item-title">
                          {item.learningCompetency}
                        </div>
                        <div className="curriculum-item-topic">
                          {item.sector ? `${item.sector} · ` : ""}
                          {item.contentTopic}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="card curriculum-detail-panel">
            {!selectedItem ? (
              <p className="hint">
                Select a Learning Competency from the catalog to inspect its
                Content, Standards, and Budget of Work details.
              </p>
            ) : (
              <div className="curriculum-detail">
                <div className="curriculum-detail-top">
                  <CompetencyBadges item={selectedItem} showSector />

                  {selectedItem.source === "custom" && (
                    <div className="actions-row">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          setFormState(formFromItem(selectedItem));
                          setShowForm(true);
                        }}
                      >
                        Edit Competency
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => void handleDeleteCustom(selectedItem)}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>

                <h2>{selectedItem.learningCompetency}</h2>

                {selectedItem.sectorDescription && (
                  <p className="hint">{selectedItem.sectorDescription}</p>
                )}

                <dl className="curriculum-dl">
                  <div>
                    <dt>Content Topic</dt>
                    <dd>
                      <strong>{selectedItem.contentTopic}</strong>
                      {selectedItem.contentSubTopics.length > 0 && (
                        <ul className="curriculum-subtopics">
                          {selectedItem.contentSubTopics.map((sub, idx) => (
                            <li key={`${sub}-${idx}`}>{sub}</li>
                          ))}
                        </ul>
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt>Content Standard</dt>
                    <dd>{selectedItem.contentStandard}</dd>
                  </div>

                  <div>
                    <dt>Performance Standard</dt>
                    <dd>{selectedItem.performanceStandard}</dd>
                  </div>

                  {selectedItem.budgetOfWork && (
                    <div>
                      <dt>
                        Budget of Work ({selectedItem.budgetOfWork.term || "BoW"}
                        {selectedItem.budgetOfWork.weekRange
                          ? ` · Week ${selectedItem.budgetOfWork.weekRange}`
                          : ""}
                        )
                      </dt>
                      <dd className="curriculum-bow-box">
                        {selectedItem.budgetOfWork.suggestedActivities && (
                          <div>
                            <strong>Suggested Activities</strong>
                            <pre className="curriculum-pre">
                              {selectedItem.budgetOfWork.suggestedActivities}
                            </pre>
                          </div>
                        )}
                        {selectedItem.budgetOfWork.suggestedPerformanceTasks && (
                          <div>
                            <strong>Suggested Performance Tasks</strong>
                            <pre className="curriculum-pre">
                              {
                                selectedItem.budgetOfWork
                                  .suggestedPerformanceTasks
                              }
                            </pre>
                          </div>
                        )}
                      </dd>
                    </div>
                  )}
                </dl>

                <form
                  className="curriculum-notes-form"
                  onSubmit={(e) => void handleSaveNotes(e)}
                >
                  <div className="field">
                    <label htmlFor={`${baseId}-detail-notes`}>
                      Custom / Unpacked Budget of Work Notes
                    </label>
                    <span className="hint">
                      Saved locally to disk alongside this competency.
                    </span>
                    <textarea
                      id={`${baseId}-detail-notes`}
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      placeholder="Add daily unpacked objectives, lab tools needed, or pacing adjustments..."
                    />
                  </div>
                  <div className="actions-row">
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={savingNotes}
                    >
                      {savingNotes ? "Saving..." : "Save BoW Notes"}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
