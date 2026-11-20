import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { renderDllMarkdown } from "../engine/dll";
import {
  SESSION_NUMBERS,
  type ClassSection,
  type CurriculumCompetency,
  type DailyLessonLog,
  type DllIntentions,
  type DllSessionConfig,
  type SessionNumber,
  type TleComponent,
} from "../engine/types";
import { CurriculumCompetencyPicker } from "./CurriculumCompetencyPicker";
import { readErrorMessage, renderMarkdownBlocks } from "./lessonViewHelpers";

type ViewMode = "edit" | "markdown";

interface StatusState {
  tone: "success" | "error";
  text: string;
}

type SessionTextFieldKey =
  | "learningObjectives"
  | "preLesson"
  | "lessonFlow"
  | "learningResources"
  | "integrationAndContextualization"
  | "formativeAssessment"
  | "extendedLearningOpportunities"
  | "reflections";

const SESSION_ILAW_FIELDS: ReadonlyArray<{
  key: SessionTextFieldKey;
  label: string;
  section: string;
  rows?: number;
}> = [
  {
    key: "learningObjectives",
    label: "Learning Objectives",
    section: "Intentions",
    rows: 2,
  },
  {
    key: "preLesson",
    label: "Pre-Lesson",
    section: "Learning Experience",
    rows: 2,
  },
  {
    key: "lessonFlow",
    label: "Lesson Flow",
    section: "Learning Experience",
    rows: 3,
  },
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
    rows: 2,
  },
  {
    key: "extendedLearningOpportunities",
    label: "Extended Learning Opportunities",
    section: "Ways Forward",
    rows: 2,
  },
  {
    key: "reflections",
    label: "Reflections (left blank on .docx export)",
    section: "Ways Forward",
    rows: 2,
  },
];

const INTENTIONS_LIST_FIELDS: ReadonlyArray<{
  key: Exclude<keyof DllIntentions, "learnerContext">;
  label: string;
}> = [
  { key: "learningCompetencies", label: "Learning Competencies (one per line)" },
  { key: "contentStandards", label: "Content Standards (one per line)" },
  { key: "performanceStandards", label: "Performance Standards (one per line)" },
];

function createInitialSessionConfigs(): DllSessionConfig[] {
  return SESSION_NUMBERS.map((sessionNumber) => ({
    sessionNumber,
    mode: "instructional",
    competencyIds: [],
    nonInstructionalReason: "",
  }));
}

interface DllWorkspaceProps {
  onDeriveDlp?: (dllId: string, sessionNumber: SessionNumber) => void;
  onCreateQuiz?: (dllId: string, sessionNumber: SessionNumber) => void;
}

export function DllWorkspace({ onDeriveDlp, onCreateQuiz }: DllWorkspaceProps) {
  const headingId = useId();
  const baseId = useId();

  // Catalog, Class Sections, and Saved DLLs
  const [dlls, setDlls] = useState<DailyLessonLog[]>([]);
  const [curriculum, setCurriculum] = useState<CurriculumCompetency[]>([]);
  const [sections, setSections] = useState<ClassSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusState | null>(null);

  // Selected DLL vs New Builder mode
  const [selectedDllId, setSelectedDllId] = useState<string>("");
  const [draftDll, setDraftDll] = useState<DailyLessonLog | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("edit");
  const [saving, setSaving] = useState(false);

  // Builder form state
  const [lessonTitle, setLessonTitle] = useState("");
  const [gradeAndSection, setGradeAndSection] = useState("");
  const [references, setReferences] = useState("");
  const [promptNotes, setPromptNotes] = useState("");
  const [sessionConfigs, setSessionConfigs] = useState<DllSessionConfig[]>(
    createInitialSessionConfigs,
  );
  const [generating, setGenerating] = useState(false);
  const [pickedCompetencyId, setPickedCompetencyId] = useState("");

  const loadWorkspaceData = useCallback(async () => {
    setLoading(true);
    try {
      const [dllRes, currRes, secRes] = await Promise.all([
        fetch("/api/dlls"),
        fetch("/api/curriculum"),
        fetch("/api/class-sections"),
      ]);
      if (!dllRes.ok) throw new Error(await readErrorMessage(dllRes));
      if (!currRes.ok) throw new Error(await readErrorMessage(currRes));
      if (!secRes.ok) throw new Error(await readErrorMessage(secRes));

      const loadedDlls = (await dllRes.json()) as DailyLessonLog[];
      const loadedCurr = (await currRes.json()) as CurriculumCompetency[];
      const loadedSec = (await secRes.json()) as ClassSection[];

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
        setSelectedDllId((prev) =>
          prev && loadedDlls.some((d) => d.id === prev) ? prev : loadedDlls[0]!.id,
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
    const match = dlls.find((d) => d.id === selectedDllId) ?? null;
    setDraftDll(match ? structuredClone(match) : null);
  }, [dlls, selectedDllId]);

  const competencyMap = useMemo(
    () => new Map(curriculum.map((c) => [c.id, c])),
    [curriculum],
  );

  const previewLearningAreas = useMemo(() => {
    const seen = new Set<TleComponent>();
    for (const cfg of sessionConfigs) {
      if (cfg.mode !== "instructional") continue;
      for (const id of cfg.competencyIds) {
        const comp = competencyMap.get(id);
        if (comp) seen.add(comp.component);
      }
    }
    return [...seen].join(", ") || "None selected yet";
  }, [sessionConfigs, competencyMap]);

  function assignCompetencyToSessions(
    targetSessions: SessionNumber[],
    competencyId: string,
  ) {
    if (!competencyId) return;
    const targetSet = new Set(targetSessions);
    setSessionConfigs((prev) =>
      prev.map((cfg) => {
        if (!targetSet.has(cfg.sessionNumber)) return cfg;
        const nextIds = cfg.competencyIds.includes(competencyId)
          ? cfg.competencyIds
          : [...cfg.competencyIds, competencyId];
        return { ...cfg, mode: "instructional", competencyIds: nextIds };
      }),
    );
  }

  function removeCompetencyFromSession(
    sessionNumber: SessionNumber,
    competencyId: string,
  ) {
    setSessionConfigs((prev) =>
      prev.map((cfg) =>
        cfg.sessionNumber === sessionNumber
          ? {
              ...cfg,
              competencyIds: cfg.competencyIds.filter((id) => id !== competencyId),
            }
          : cfg,
      ),
    );
  }

  function updateSessionMode(
    sessionNumber: SessionNumber,
    mode: "instructional" | "non-instructional",
  ) {
    setSessionConfigs((prev) =>
      prev.map((cfg) =>
        cfg.sessionNumber === sessionNumber
          ? {
              ...cfg,
              mode,
              nonInstructionalReason:
                mode === "non-instructional"
                  ? cfg.nonInstructionalReason || "Holiday / School Event"
                  : cfg.nonInstructionalReason,
            }
          : cfg,
      ),
    );
  }

  function updateNonInstructionalReason(
    sessionNumber: SessionNumber,
    reason: string,
  ) {
    setSessionConfigs((prev) =>
      prev.map((cfg) =>
        cfg.sessionNumber === sessionNumber
          ? { ...cfg, nonInstructionalReason: reason }
          : cfg,
      ),
    );
  }

  async function handleGenerate(event: FormEvent) {
    event.preventDefault();
    setStatus(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/dlls/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonTitle,
          gradeAndSection,
          references,
          promptNotes,
          sessions: sessionConfigs,
        }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const created = (await res.json()) as DailyLessonLog;
      setDlls((prev) => [created, ...prev]);
      setSelectedDllId(created.id);
      setViewMode("edit");
      setStatus({
        tone: "success",
        text: `Generated Daily Lesson Log "${created.lessonTitle}" (${created.learningAreas}).`,
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

  function updateDraftHeader<K extends keyof DailyLessonLog>(
    key: K,
    value: DailyLessonLog[K],
  ) {
    setDraftDll((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function updateDraftSessionField(
    sessionNumber: SessionNumber,
    key: SessionTextFieldKey,
    value: string,
  ) {
    setDraftDll((prev) => {
      if (!prev) return prev;
      const nextSessions = prev.sessions.map((s) =>
        s.sessionNumber === sessionNumber ? { ...s, [key]: value } : s,
      ) as DailyLessonLog["sessions"];
      return { ...prev, sessions: nextSessions };
    });
  }

  async function handleSaveEdits() {
    if (!draftDll) return;
    setStatus(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/dlls/${encodeURIComponent(draftDll.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftDll),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const updated = (await res.json()) as DailyLessonLog;
      setDlls((prev) =>
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

  async function handleDeleteDll() {
    if (!draftDll) return;
    setStatus(null);
    try {
      const res = await fetch(`/api/dlls/${encodeURIComponent(draftDll.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const remaining = dlls.filter((d) => d.id !== draftDll.id);
      setDlls(remaining);
      setSelectedDllId(remaining[0]?.id ?? "");
      setStatus({
        tone: "success",
        text: `Deleted "${draftDll.lessonTitle}".`,
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
            DLL Builder
          </h1>
          <p className="workspace-subtitle">
            Build 5-Session ILAW Daily Lesson Logs across TLE Components, edit
            cells inline, and export to the official template.
          </p>
        </div>

        <div className="actions-row">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setSelectedDllId("")}
          >
            + New DLL
          </button>
        </div>
      </div>

      {status && (
        <div className="status-banner" data-tone={status.tone} role="status">
          {status.text}
        </div>
      )}

      {dlls.length > 0 && (
        <div className="card dll-saved-bar">
          <div className="field">
            <label htmlFor={`${baseId}-saved-dll`}>Saved Daily Lesson Logs</label>
            <select
              id={`${baseId}-saved-dll`}
              value={selectedDllId}
              onChange={(e) => setSelectedDllId(e.target.value)}
            >
              <option value="">Create a new 5-Session DLL...</option>
              {dlls.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.lessonTitle} — {item.learningAreas} ({item.gradeAndSection})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card">Loading Daily Lesson Logs and Curriculum Catalog...</div>
      ) : !draftDll ? (
        <form className="settings-form" onSubmit={handleGenerate}>
          <fieldset className="settings-fieldset">
            <legend>1. Header &amp; Prompt Notes</legend>

            <div className="dll-form-grid">
              <div className="field">
                <label htmlFor={`${baseId}-title`}>
                  Lesson Title (optional)
                </label>
                <input
                  id={`${baseId}-title`}
                  type="text"
                  value={lessonTitle}
                  onChange={(e) => setLessonTitle(e.target.value)}
                  placeholder="Leave blank for AI-generated title"
                />
              </div>

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
            </div>

            <div className="field">
              <label htmlFor={`${baseId}-refs`}>References (optional)</label>
              <input
                id={`${baseId}-refs`}
                type="text"
                value={references}
                onChange={(e) => setReferences(e.target.value)}
                placeholder="DepEd MATATAG TLE CG, Grade 7 Budget of Work, toolkits..."
              />
            </div>

            <div className="field">
              <label htmlFor={`${baseId}-prompt-notes`}>
                Prompt Notes (optional)
              </label>
              <textarea
                id={`${baseId}-prompt-notes`}
                value={promptNotes}
                onChange={(e) => setPromptNotes(e.target.value)}
                placeholder="e.g. 45-minute periods, limited tools in lab, group rotation..."
              />
              <span className="hint">
                Included in the AI prompt only; never written into Learner Context.
              </span>
            </div>
          </fieldset>

          <fieldset className="settings-fieldset">
            <legend>2. Pick Learning Competencies &amp; Map Sessions 1–5</legend>

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
                onClick={() =>
                  assignCompetencyToSessions([1, 2], pickedCompetencyId)
                }
              >
                Assign to Sessions 1–2
              </button>
              <button
                type="button"
                className="btn-secondary btn-compact"
                disabled={!pickedCompetencyId}
                onClick={() =>
                  assignCompetencyToSessions([3, 4, 5], pickedCompetencyId)
                }
              >
                Assign to Sessions 3–5
              </button>
              <button
                type="button"
                className="btn-secondary btn-compact"
                disabled={!pickedCompetencyId}
                onClick={() =>
                  assignCompetencyToSessions([1, 2, 3, 4, 5], pickedCompetencyId)
                }
              >
                Assign to All 5 Sessions
              </button>
            </div>

            <p className="hint">
              Combined Learning Area/s preview: <strong>{previewLearningAreas}</strong>
            </p>

            <div className="dll-session-grid">
              {sessionConfigs.map((cfg) => (
                <div key={cfg.sessionNumber} className="dll-session-card">
                  <div className="dll-session-card-head">
                    <h3>Session {cfg.sessionNumber}</h3>
                    <select
                      aria-label={`Session ${cfg.sessionNumber} mode`}
                      value={cfg.mode}
                      onChange={(e) =>
                        updateSessionMode(
                          cfg.sessionNumber,
                          e.target.value as "instructional" | "non-instructional",
                        )
                      }
                    >
                      <option value="instructional">Instructional</option>
                      <option value="non-instructional">
                        Non-Instructional / Holiday
                      </option>
                    </select>
                  </div>

                  {cfg.mode === "non-instructional" ? (
                    <div className="field">
                      <label htmlFor={`${baseId}-ni-${cfg.sessionNumber}`}>
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
                      />
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn-secondary btn-compact"
                        disabled={!pickedCompetencyId}
                        onClick={() =>
                          assignCompetencyToSessions(
                            [cfg.sessionNumber],
                            pickedCompetencyId,
                          )
                        }
                      >
                        + Add selected competency
                      </button>
                      {cfg.competencyIds.length === 0 ? (
                        <p className="hint">No Learning Competency assigned yet.</p>
                      ) : (
                        <ul className="dll-assigned-list">
                          {cfg.competencyIds.map((cid) => {
                            const comp = competencyMap.get(cid);
                            return (
                              <li key={cid} className="dll-assigned-item">
                                <span>
                                  <span className="badge">
                                    {comp?.component ?? "TLE"}
                                  </span>{" "}
                                  {comp?.learningCompetency ?? cid}
                                </span>
                                <button
                                  type="button"
                                  className="btn-secondary btn-compact"
                                  onClick={() =>
                                    removeCompetencyFromSession(
                                      cfg.sessionNumber,
                                      cid,
                                    )
                                  }
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
              ))}
            </div>
          </fieldset>

          <div className="actions-row">
            <button type="submit" className="btn-primary" disabled={generating}>
              {generating ? "Generating DLL..." : "Generate 5-Session DLL"}
            </button>
          </div>
        </form>
      ) : (
        <div className="dll-editor-stack">
          <div className="card dll-toolbar">
            <div>
              <h2>{draftDll.lessonTitle}</h2>
              <div className="curriculum-badges">
                <span className="badge badge-bow">{draftDll.learningAreas}</span>
                <span className="badge">{draftDll.gradeAndSection}</span>
                <span className="badge">5 Sessions</span>
              </div>
            </div>

            <div className="actions-row">
              <div className="classroom-tablist" role="tablist" aria-label="DLL View Mode">
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
                href={`/api/dlls/${encodeURIComponent(draftDll.id)}/docx`}
                download
              >
                Download .docx
              </a>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleDeleteDll}
              >
                Delete
              </button>
            </div>
          </div>

          {viewMode === "markdown" ? (
            <article className="card dll-markdown-view">
              {renderMarkdownBlocks(renderDllMarkdown(draftDll))}
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
                      value={draftDll.lessonTitle}
                      onChange={(e) =>
                        updateDraftHeader("lessonTitle", e.target.value)
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`${baseId}-edit-areas`}>
                      Learning Area/s
                    </label>
                    <input
                      id={`${baseId}-edit-areas`}
                      type="text"
                      value={draftDll.learningAreas}
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
                      value={draftDll.gradeAndSection}
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
                      value={draftDll.references}
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
                      value={draftDll.intentions[field.key].join("\n")}
                      onChange={(e) =>
                        updateDraftHeader("intentions", {
                          ...draftDll.intentions,
                          [field.key]: e.target.value.split(/\r?\n/),
                        })
                      }
                    />
                  </div>
                ))}

                <div className="field">
                  <label htmlFor={`${baseId}-edit-ctx`}>
                    Learner Context (always left blank in .docx export)
                  </label>
                  <textarea
                    id={`${baseId}-edit-ctx`}
                    value={draftDll.intentions.learnerContext}
                    onChange={(e) =>
                      updateDraftHeader("intentions", {
                        ...draftDll.intentions,
                        learnerContext: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              {draftDll.sessions.map((session) => (
                <section
                  key={session.sessionNumber}
                  className="card settings-form"
                  aria-label={`Session ${session.sessionNumber}`}
                >
                  <div className="dll-session-card-head">
                    <h3>
                      Session {session.sessionNumber}{" "}
                      {session.mode === "non-instructional"
                        ? `(Non-Instructional: ${session.nonInstructionalReason || "Holiday"})`
                        : session.components.length > 0
                          ? `(${session.components.join(", ")})`
                          : ""}
                    </h3>
                    {session.mode === "instructional" && (onDeriveDlp || onCreateQuiz) && (
                      <div className="actions-row">
                        {onDeriveDlp && (
                          <button
                            type="button"
                            className="btn-secondary btn-compact"
                            onClick={() =>
                              onDeriveDlp(draftDll.id, session.sessionNumber)
                            }
                          >
                            Derive DLP
                          </button>
                        )}
                        {onCreateQuiz && (
                          <button
                            type="button"
                            className="btn-secondary btn-compact"
                            onClick={() =>
                              onCreateQuiz(draftDll.id, session.sessionNumber)
                            }
                          >
                            Create Quiz
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="dll-session-fields">
                    {SESSION_ILAW_FIELDS.map((field) => (
                      <div key={field.key} className="field">
                        <label
                          htmlFor={`${baseId}-s${session.sessionNumber}-${field.key}`}
                        >
                          {field.section}: {field.label}
                        </label>
                        <textarea
                          id={`${baseId}-s${session.sessionNumber}-${field.key}`}
                          rows={field.rows ?? 2}
                          value={session[field.key]}
                          onChange={(e) =>
                            updateDraftSessionField(
                              session.sessionNumber,
                              field.key,
                              e.target.value,
                            )
                          }
                        />
                      </div>
                    ))}
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
