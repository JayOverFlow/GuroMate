import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { renderDlpMarkdown } from "../engine/dlp";
import type {
  ClassSection,
  CurriculumCompetency,
  DailyLessonLog,
  DailyLessonPlan,
  DlpActivityPair,
  DlpIntentions,
  SessionNumber,
} from "../engine/types";
import { CurriculumCompetencyPicker } from "./CurriculumCompetencyPicker";
import { readErrorMessage, renderMarkdownBlocks } from "./lessonViewHelpers";

type ViewMode = "edit" | "markdown";
type BuilderMode = "scratch" | "derive";

interface StatusState {
  tone: "success" | "error";
  text: string;
}

type ActivityRowKey =
  | "preLesson"
  | "lessonFlow"
  | "learningResources"
  | "integrationAndContextualization"
  | "formativeAssessment"
  | "extendedLearningOpportunities"
  | "reflections";

const DLP_ACTIVITY_ROWS: ReadonlyArray<{
  key: ActivityRowKey;
  label: string;
  section: string;
  rows?: number;
}> = [
  { key: "preLesson", label: "Pre-Lesson", section: "Learning Experience", rows: 3 },
  { key: "lessonFlow", label: "Lesson Flow", section: "Learning Experience", rows: 4 },
  {
    key: "learningResources",
    label: "Learning Resources",
    section: "Learning Experience",
    rows: 2,
  },
  {
    key: "integrationAndContextualization",
    label: "Opportunities for Integration and Contextualization",
    section: "Learning Experience",
    rows: 2,
  },
  {
    key: "formativeAssessment",
    label: "Formative Assessment",
    section: "Assessing Learning",
    rows: 3,
  },
  {
    key: "extendedLearningOpportunities",
    label: "Extended Learning Opportunities",
    section: "Ways Forward",
    rows: 2,
  },
  {
    key: "reflections",
    label: "Reflections (always left blank in .docx export)",
    section: "Ways Forward",
    rows: 2,
  },
];

const INTENTIONS_LIST_FIELDS: ReadonlyArray<{
  key: "learningCompetencies" | "contentStandards" | "performanceStandards";
  label: string;
}> = [
  { key: "learningCompetencies", label: "Learning Competencies (one per line)" },
  { key: "contentStandards", label: "Content Standards (one per line)" },
  { key: "performanceStandards", label: "Performance Standards (one per line)" },
];

export interface DeriveDlpTarget {
  dllId: string;
  sessionNumber: SessionNumber;
}

interface DlpWorkspaceProps {
  initialDeriveTarget?: DeriveDlpTarget | null;
  onConsumeDeriveTarget?: () => void;
}

export function DlpWorkspace({
  initialDeriveTarget,
  onConsumeDeriveTarget,
}: DlpWorkspaceProps) {
  const headingId = useId();
  const baseId = useId();

  const [dlps, setDlps] = useState<DailyLessonPlan[]>([]);
  const [dlls, setDlls] = useState<DailyLessonLog[]>([]);
  const [curriculum, setCurriculum] = useState<CurriculumCompetency[]>([]);
  const [sections, setSections] = useState<ClassSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusState | null>(null);

  const [selectedDlpId, setSelectedDlpId] = useState("");
  const [draftDlp, setDraftDlp] = useState<DailyLessonPlan | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("edit");
  const [saving, setSaving] = useState(false);

  // Builder state
  const [builderMode, setBuilderMode] = useState<BuilderMode>("scratch");
  const [deriveDllId, setDeriveDllId] = useState("");
  const [deriveSessionNumber, setDeriveSessionNumber] = useState<SessionNumber>(1);
  const [lessonTitle, setLessonTitle] = useState("");
  const [gradeAndSection, setGradeAndSection] = useState("");
  const [references, setReferences] = useState("");
  const [promptNotes, setPromptNotes] = useState("");
  const [selectedCompetencyIds, setSelectedCompetencyIds] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [pickedCompetencyId, setPickedCompetencyId] = useState("");
  const deriveIntentRef = useRef(Boolean(initialDeriveTarget));

  const loadWorkspaceData = useCallback(async () => {
    setLoading(true);
    try {
      const [dlpRes, dllRes, currRes, secRes] = await Promise.all([
        fetch("/api/dlps"),
        fetch("/api/dlls"),
        fetch("/api/curriculum"),
        fetch("/api/class-sections"),
      ]);
      if (!dlpRes.ok) throw new Error(await readErrorMessage(dlpRes));
      if (!dllRes.ok) throw new Error(await readErrorMessage(dllRes));
      if (!currRes.ok) throw new Error(await readErrorMessage(currRes));
      if (!secRes.ok) throw new Error(await readErrorMessage(secRes));

      const loadedDlps = (await dlpRes.json()) as DailyLessonPlan[];
      const loadedDlls = (await dllRes.json()) as DailyLessonLog[];
      const loadedCurr = (await currRes.json()) as CurriculumCompetency[];
      const loadedSec = (await secRes.json()) as ClassSection[];

      setDlps(loadedDlps);
      setDlls(loadedDlls);
      setCurriculum(loadedCurr);
      setSections(loadedSec);

      if (loadedSec.length > 0) {
        const first = loadedSec[0]!;
        setGradeAndSection(
          (prev) => prev || `Grade ${first.gradeLevel} - ${first.sectionName}`,
        );
      }
      if (loadedDlls.length > 0) {
        setDeriveDllId((prev) =>
          prev && loadedDlls.some((d) => d.id === prev) ? prev : loadedDlls[0]!.id,
        );
      }
      if (loadedDlps.length > 0 && !deriveIntentRef.current) {
        setSelectedDlpId((prev) =>
          prev && loadedDlps.some((d) => d.id === prev) ? prev : loadedDlps[0]!.id,
        );
      }
    } catch (err) {
      setStatus({
        tone: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkspaceData();
  }, [loadWorkspaceData]);

  useEffect(() => {
    if (!initialDeriveTarget) return;
    deriveIntentRef.current = true;
    setSelectedDlpId("");
    setBuilderMode("derive");
    setDeriveDllId(initialDeriveTarget.dllId);
    setDeriveSessionNumber(initialDeriveTarget.sessionNumber);
    onConsumeDeriveTarget?.();
  }, [initialDeriveTarget, onConsumeDeriveTarget]);

  useEffect(() => {
    const match = dlps.find((d) => d.id === selectedDlpId) ?? null;
    setDraftDlp(match ? structuredClone(match) : null);
  }, [dlps, selectedDlpId]);

  const competencyMap = useMemo(
    () => new Map(curriculum.map((c) => [c.id, c])),
    [curriculum],
  );

  const selectedSourceDll = useMemo(
    () => dlls.find((d) => d.id === deriveDllId) ?? null,
    [dlls, deriveDllId],
  );

  const activeSourceSessions = useMemo(
    () =>
      selectedSourceDll
        ? selectedSourceDll.sessions.filter((s) => s.mode === "instructional")
        : [],
    [selectedSourceDll],
  );

  useEffect(() => {
    if (
      activeSourceSessions.length > 0 &&
      !activeSourceSessions.some((s) => s.sessionNumber === deriveSessionNumber)
    ) {
      setDeriveSessionNumber(activeSourceSessions[0]!.sessionNumber);
    }
  }, [activeSourceSessions, deriveSessionNumber]);

  const selectedSourceSession = useMemo(
    () =>
      activeSourceSessions.find((s) => s.sessionNumber === deriveSessionNumber) ?? null,
    [activeSourceSessions, deriveSessionNumber],
  );

  function addScratchCompetency() {
    if (!pickedCompetencyId) return;
    setSelectedCompetencyIds((prev) =>
      prev.includes(pickedCompetencyId) ? prev : [...prev, pickedCompetencyId],
    );
  }

  function removeScratchCompetency(id: string) {
    setSelectedCompetencyIds((prev) => prev.filter((item) => item !== id));
  }

  async function handleGenerate(event: FormEvent) {
    event.preventDefault();
    setStatus(null);
    setGenerating(true);
    try {
      const payload =
        builderMode === "derive"
          ? {
              mode: "derive" as const,
              dllId: deriveDllId,
              sessionNumber: deriveSessionNumber,
              lessonTitle,
              references,
              promptNotes,
            }
          : {
              mode: "scratch" as const,
              lessonTitle,
              gradeAndSection,
              references,
              promptNotes,
              competencyIds: selectedCompetencyIds,
            };
      const res = await fetch("/api/dlps/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const created = (await res.json()) as DailyLessonPlan;
      setDlps((prev) => [created, ...prev]);
      setSelectedDlpId(created.id);
      setViewMode("edit");
      setStatus({
        tone: "success",
        text: `Generated Daily Lesson Plan "${created.lessonTitle}" (${created.learningAreas}).`,
      });
    } catch (err) {
      setStatus({
        tone: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setGenerating(false);
    }
  }

  function updateDraftHeader<K extends keyof DailyLessonPlan>(
    key: K,
    value: DailyLessonPlan[K],
  ) {
    setDraftDlp((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function updateDraftIntentions(patch: Partial<DlpIntentions>) {
    setDraftDlp((prev) =>
      prev ? { ...prev, intentions: { ...prev.intentions, ...patch } } : prev,
    );
  }

  function updateDraftActivity(
    key: ActivityRowKey,
    column: keyof DlpActivityPair,
    value: string,
  ) {
    setDraftDlp((prev) =>
      prev ? { ...prev, [key]: { ...prev[key], [column]: value } } : prev,
    );
  }

  async function handleSaveEdits() {
    if (!draftDlp) return;
    setStatus(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/dlps/${encodeURIComponent(draftDlp.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftDlp),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const updated = (await res.json()) as DailyLessonPlan;
      setDlps((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item)),
      );
      setStatus({
        tone: "success",
        text: `Saved changes to "${updated.lessonTitle}" on local disk.`,
      });
    } catch (err) {
      setStatus({
        tone: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteDlp() {
    if (!draftDlp) return;
    setStatus(null);
    try {
      const res = await fetch(`/api/dlps/${encodeURIComponent(draftDlp.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const remaining = dlps.filter((d) => d.id !== draftDlp.id);
      setDlps(remaining);
      setSelectedDlpId(remaining[0]?.id ?? "");
      setStatus({
        tone: "success",
        text: `Deleted "${draftDlp.lessonTitle}".`,
      });
    } catch (err) {
      setStatus({
        tone: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <section className="dll-workspace" aria-labelledby={headingId}>
      <div className="curriculum-header-row">
        <div className="workspace-header">
          <h1 id={headingId} tabIndex={-1}>
            DLP Builder
          </h1>
          <p className="workspace-subtitle">
            Build single-session ILAW Daily Lesson Plans from a DLL Session or
            from scratch with paired Teacher&apos;s and Student&apos;s Activity.
          </p>
        </div>

        <div className="actions-row">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setSelectedDlpId("")}
          >
            + New DLP
          </button>
        </div>
      </div>

      {status && (
        <div className="status-banner" data-tone={status.tone} role="status">
          {status.text}
        </div>
      )}

      {dlps.length > 0 && (
        <div className="card dll-saved-bar">
          <div className="field">
            <label htmlFor={`${baseId}-saved-dlp`}>Saved Daily Lesson Plans</label>
            <select
              id={`${baseId}-saved-dlp`}
              value={selectedDlpId}
              onChange={(e) => setSelectedDlpId(e.target.value)}
            >
              <option value="">Create a new Daily Lesson Plan...</option>
              {dlps.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.lessonTitle} — {item.learningAreas} ({item.gradeAndSection})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card">Loading Daily Lesson Plans and Curriculum Catalog...</div>
      ) : !draftDlp ? (
        <form className="settings-form" onSubmit={handleGenerate}>
          <fieldset className="settings-fieldset">
            <legend>1. Creation Source</legend>

            <div className="classroom-tablist" role="tablist" aria-label="DLP Creation Mode">
              <button
                type="button"
                role="tab"
                className="classroom-tab"
                aria-selected={builderMode === "scratch"}
                onClick={() => setBuilderMode("scratch")}
              >
                From Scratch (Curriculum Catalog)
              </button>
              <button
                type="button"
                role="tab"
                className="classroom-tab"
                aria-selected={builderMode === "derive"}
                onClick={() => setBuilderMode("derive")}
              >
                Derive from DLL Session
              </button>
            </div>

            {builderMode === "derive" ? (
              dlls.length === 0 ? (
                <p className="hint">
                  No saved Daily Lesson Logs yet. Create one in{" "}
                  <a href="#dll">DLL Builder</a> or switch to From Scratch.
                </p>
              ) : (
                <div className="dll-form-grid">
                  <div className="field">
                    <label htmlFor={`${baseId}-derive-dll`}>Saved DLL</label>
                    <select
                      id={`${baseId}-derive-dll`}
                      value={deriveDllId}
                      onChange={(e) => setDeriveDllId(e.target.value)}
                    >
                      {dlls.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.lessonTitle} ({item.gradeAndSection})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label htmlFor={`${baseId}-derive-session`}>Active Session</label>
                    <select
                      id={`${baseId}-derive-session`}
                      value={deriveSessionNumber}
                      onChange={(e) =>
                        setDeriveSessionNumber(Number(e.target.value) as SessionNumber)
                      }
                    >
                      {activeSourceSessions.map((s) => (
                        <option key={s.sessionNumber} value={s.sessionNumber}>
                          Session {s.sessionNumber} ({s.components.join(", ") || "TLE"})
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedSourceSession && (
                    <div className="curriculum-bow-box dlp-derive-preview">
                      <div>
                        <strong>Inherited TLE Component:</strong>{" "}
                        {selectedSourceSession.components.join(", ") ||
                          selectedSourceDll?.learningAreas}
                      </div>
                      <div>
                        <strong>Inherited Learning Objectives:</strong>{" "}
                        {selectedSourceSession.learningObjectives || "—"}
                      </div>
                    </div>
                  )}
                </div>
              )
            ) : null}

            <div className="dll-form-grid">
              <div className="field">
                <label htmlFor={`${baseId}-title`}>Lesson Title (optional)</label>
                <input
                  id={`${baseId}-title`}
                  type="text"
                  value={lessonTitle}
                  onChange={(e) => setLessonTitle(e.target.value)}
                  placeholder="Leave blank for AI-generated title"
                />
              </div>

              {builderMode === "scratch" && (
                <div className="field">
                  <label htmlFor={`${baseId}-grade-section`}>
                    Grade Level and Section
                  </label>
                  <input
                    id={`${baseId}-grade-section`}
                    type="text"
                    required
                    value={gradeAndSection}
                    onChange={(e) => setGradeAndSection(e.target.value)}
                    placeholder="e.g. Grade 7 - Rizal"
                  />
                  {sections.length > 0 && (
                    <select
                      aria-label="Fill from saved Class Section"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) setGradeAndSection(e.target.value);
                      }}
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
              )}
            </div>

            <div className="field">
              <label htmlFor={`${baseId}-refs`}>References (optional)</label>
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
              />
            </div>

            <div className="field">
              <label htmlFor={`${baseId}-prompt-notes`}>Prompt Notes (optional)</label>
              <textarea
                id={`${baseId}-prompt-notes`}
                value={promptNotes}
                onChange={(e) => setPromptNotes(e.target.value)}
                placeholder="e.g. 45-minute period, 40 learners in pairs, limited tools..."
              />
              <span className="hint">
                Included in the AI prompt only; never written into Learner Context.
              </span>
            </div>
          </fieldset>

          {builderMode === "scratch" && (
            <fieldset className="settings-fieldset">
              <legend>2. Select Learning Competencies</legend>

              <CurriculumCompetencyPicker
                baseId={baseId}
                curriculum={curriculum}
                pickedCompetencyId={pickedCompetencyId}
                onPickCompetencyId={setPickedCompetencyId}
              />

              <div className="actions-row">
                <button
                  type="button"
                  className="btn-secondary btn-compact"
                  disabled={!pickedCompetencyId}
                  onClick={addScratchCompetency}
                >
                  + Add Learning Competency
                </button>
              </div>

              {selectedCompetencyIds.length === 0 ? (
                <p className="hint">No Learning Competency selected yet.</p>
              ) : (
                <ul className="dll-assigned-list">
                  {selectedCompetencyIds.map((cid) => {
                    const comp = competencyMap.get(cid);
                    return (
                      <li key={cid} className="dll-assigned-item">
                        <span>
                          <span className="badge">{comp?.component ?? "TLE"}</span>{" "}
                          {comp?.learningCompetency ?? cid}
                        </span>
                        <button
                          type="button"
                          className="btn-secondary btn-compact"
                          onClick={() => removeScratchCompetency(cid)}
                        >
                          Remove
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </fieldset>
          )}

          <div className="actions-row">
            <button
              type="submit"
              className="btn-primary"
              disabled={
                generating ||
                (builderMode === "derive" && (!deriveDllId || !selectedSourceSession))
              }
            >
              {generating
                ? "Generating DLP..."
                : builderMode === "derive"
                  ? "Generate DLP from Session"
                  : "Generate Standalone DLP"}
            </button>
          </div>
        </form>
      ) : (
        <div className="dll-editor-stack">
          <div className="card dll-toolbar">
            <div>
              <h2>{draftDlp.lessonTitle}</h2>
              <div className="curriculum-badges">
                <span className="badge badge-bow">{draftDlp.learningAreas}</span>
                <span className="badge">{draftDlp.gradeAndSection}</span>
                <span className="badge">No. of Sessions: 1</span>
                {draftDlp.sourceDllId && (
                  <span className="badge">
                    Derived from Session {draftDlp.sourceSessionNumber}
                  </span>
                )}
              </div>
            </div>

            <div className="actions-row">
              <div className="classroom-tablist" role="tablist" aria-label="DLP View Mode">
                <button
                  type="button"
                  role="tab"
                  className="classroom-tab"
                  aria-selected={viewMode === "edit"}
                  onClick={() => setViewMode("edit")}
                >
                  Inline Editor
                </button>
                <button
                  type="button"
                  role="tab"
                  className="classroom-tab"
                  aria-selected={viewMode === "markdown"}
                  onClick={() => setViewMode("markdown")}
                >
                  Markdown View
                </button>
              </div>

              <button
                type="button"
                className="btn-primary"
                disabled={saving}
                onClick={handleSaveEdits}
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <a
                className="btn-secondary dll-download-link"
                href={`/api/dlps/${encodeURIComponent(draftDlp.id)}/docx`}
                download
              >
                Download .docx
              </a>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleDeleteDlp}
              >
                Delete
              </button>
            </div>
          </div>

          {viewMode === "markdown" ? (
            <article className="card dll-markdown-view">
              {renderMarkdownBlocks(renderDlpMarkdown(draftDlp))}
            </article>
          ) : (
            <div className="dll-editor-stack">
              <div className="card settings-form">
                <h3>Header &amp; Intentions</h3>
                <div className="dll-form-grid">
                  <div className="field">
                    <label htmlFor={`${baseId}-edit-title`}>Lesson Title</label>
                    <input
                      id={`${baseId}-edit-title`}
                      type="text"
                      value={draftDlp.lessonTitle}
                      onChange={(e) =>
                        updateDraftHeader("lessonTitle", e.target.value)
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`${baseId}-edit-areas`}>Learning Area/s</label>
                    <input
                      id={`${baseId}-edit-areas`}
                      type="text"
                      value={draftDlp.learningAreas}
                      onChange={(e) =>
                        updateDraftHeader("learningAreas", e.target.value)
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`${baseId}-edit-gs`}>
                      Grade Level and Section
                    </label>
                    <input
                      id={`${baseId}-edit-gs`}
                      type="text"
                      value={draftDlp.gradeAndSection}
                      onChange={(e) =>
                        updateDraftHeader("gradeAndSection", e.target.value)
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`${baseId}-edit-refs`}>References</label>
                    <input
                      id={`${baseId}-edit-refs`}
                      type="text"
                      value={draftDlp.references}
                      onChange={(e) =>
                        updateDraftHeader("references", e.target.value)
                      }
                    />
                  </div>
                </div>

                {INTENTIONS_LIST_FIELDS.map((field) => (
                  <div key={field.key} className="field">
                    <label htmlFor={`${baseId}-edit-${field.key}`}>
                      {field.label}
                    </label>
                    <textarea
                      id={`${baseId}-edit-${field.key}`}
                      value={draftDlp.intentions[field.key].join("\n")}
                      onChange={(e) =>
                        updateDraftIntentions({
                          [field.key]: e.target.value.split(/\r?\n/),
                        })
                      }
                    />
                  </div>
                ))}

                <div className="field">
                  <label htmlFor={`${baseId}-edit-objectives`}>
                    Learning Objectives
                  </label>
                  <textarea
                    id={`${baseId}-edit-objectives`}
                    value={draftDlp.intentions.learningObjectives}
                    onChange={(e) =>
                      updateDraftIntentions({ learningObjectives: e.target.value })
                    }
                  />
                </div>

                <div className="field">
                  <label htmlFor={`${baseId}-edit-ctx`}>
                    Learner Context (always left blank in .docx export)
                  </label>
                  <textarea
                    id={`${baseId}-edit-ctx`}
                    value={draftDlp.intentions.learnerContext}
                    onChange={(e) =>
                      updateDraftIntentions({ learnerContext: e.target.value })
                    }
                  />
                </div>
              </div>

              {DLP_ACTIVITY_ROWS.map((row) => (
                <section
                  key={row.key}
                  className="card settings-form"
                  aria-label={`${row.section}: ${row.label}`}
                >
                  <h3>
                    {row.section}: {row.label}
                  </h3>
                  <div className="dlp-activity-pair">
                    <div className="field">
                      <label htmlFor={`${baseId}-${row.key}-teacher`}>
                        Teacher&apos;s Activity
                      </label>
                      <textarea
                        id={`${baseId}-${row.key}-teacher`}
                        rows={row.rows ?? 2}
                        value={draftDlp[row.key].teacherActivity}
                        onChange={(e) =>
                          updateDraftActivity(
                            row.key,
                            "teacherActivity",
                            e.target.value,
                          )
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`${baseId}-${row.key}-student`}>
                        Student&apos;s Activity
                      </label>
                      <textarea
                        id={`${baseId}-${row.key}-student`}
                        rows={row.rows ?? 2}
                        value={draftDlp[row.key].studentActivity}
                        onChange={(e) =>
                          updateDraftActivity(
                            row.key,
                            "studentActivity",
                            e.target.value,
                          )
                        }
                      />
                    </div>
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
