import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { QUIZ_SECTION_META, ROMAN_PARTS, renderQuizMarkdown } from "../engine/quiz";
import {
  QUIZ_QUESTION_TYPES,
  type ClassSection,
  type CurriculumCompetency,
  type DailyLessonLog,
  type DailyLessonPlan,
  type Quiz,
  type QuizItemCounts,
  type QuizQuestionType,
  type QuizSyncResult,
  type SessionNumber,
} from "../engine/types";
import { CurriculumCompetencyPicker } from "./CurriculumCompetencyPicker";
import { readErrorMessage, renderMarkdownBlocks } from "./lessonViewHelpers";

type ViewMode = "edit" | "markdown";
type SourceKind = "standalone" | "dll" | "dlp";

interface StatusState {
  tone: "success" | "error";
  text: string;
}

export type QuizLaunchTarget =
  | { sourceKind: "dll"; dllId: string; sessionNumber: SessionNumber }
  | { sourceKind: "dlp"; dlpId: string };

interface QuizWorkspaceProps {
  initialLaunchTarget?: QuizLaunchTarget | null;
  onConsumeLaunchTarget?: () => void;
}

const DEFAULT_COUNTS: QuizItemCounts = {
  multipleChoice: 5,
  trueFalse: 0,
  identification: 0,
  essayRubric: 0,
};

export function QuizWorkspace({
  initialLaunchTarget,
  onConsumeLaunchTarget,
}: QuizWorkspaceProps) {
  const headingId = useId();
  const baseId = useId();

  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [dlls, setDlls] = useState<DailyLessonLog[]>([]);
  const [dlps, setDlps] = useState<DailyLessonPlan[]>([]);
  const [curriculum, setCurriculum] = useState<CurriculumCompetency[]>([]);
  const [sections, setSections] = useState<ClassSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusState | null>(null);

  const [selectedQuizId, setSelectedQuizId] = useState("");
  const [draftQuiz, setDraftQuiz] = useState<Quiz | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("markdown");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Builder state
  const [sourceKind, setSourceKind] = useState<SourceKind>("standalone");
  const [selectedDllId, setSelectedDllId] = useState("");
  const [selectedSessionNumber, setSelectedSessionNumber] = useState<SessionNumber>(1);
  const [selectedDlpId, setSelectedDlpId] = useState("");
  const [title, setTitle] = useState("");
  const [gradeAndSection, setGradeAndSection] = useState("");
  const [promptNotes, setPromptNotes] = useState("");
  const [itemCounts, setItemCounts] = useState<QuizItemCounts>(DEFAULT_COUNTS);
  const [selectedCompetencyIds, setSelectedCompetencyIds] = useState<string[]>([]);
  const [pickedCompetencyId, setPickedCompetencyId] = useState("");
  const [generating, setGenerating] = useState(false);
  const launchIntentRef = useRef(Boolean(initialLaunchTarget));

  const loadWorkspaceData = useCallback(async () => {
    setLoading(true);
    try {
      const [quizRes, dllRes, dlpRes, currRes, secRes] = await Promise.all([
        fetch("/api/quizzes"),
        fetch("/api/dlls"),
        fetch("/api/dlps"),
        fetch("/api/curriculum"),
        fetch("/api/class-sections"),
      ]);
      if (!quizRes.ok) throw new Error(await readErrorMessage(quizRes));
      if (!dllRes.ok) throw new Error(await readErrorMessage(dllRes));
      if (!dlpRes.ok) throw new Error(await readErrorMessage(dlpRes));
      if (!currRes.ok) throw new Error(await readErrorMessage(currRes));
      if (!secRes.ok) throw new Error(await readErrorMessage(secRes));

      const loadedQuizzes = (await quizRes.json()) as Quiz[];
      const loadedDlls = (await dllRes.json()) as DailyLessonLog[];
      const loadedDlps = (await dlpRes.json()) as DailyLessonPlan[];
      const loadedCurr = (await currRes.json()) as CurriculumCompetency[];
      const loadedSec = (await secRes.json()) as ClassSection[];

      setQuizzes(loadedQuizzes);
      setDlls(loadedDlls);
      setDlps(loadedDlps);
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
      if (loadedDlps.length > 0) {
        setSelectedDlpId((prev) =>
          prev && loadedDlps.some((d) => d.id === prev) ? prev : loadedDlps[0]!.id,
        );
      }
      if (loadedQuizzes.length > 0 && !launchIntentRef.current) {
        setSelectedQuizId((prev) =>
          prev && loadedQuizzes.some((q) => q.id === prev)
            ? prev
            : loadedQuizzes[0]!.id,
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
    if (!initialLaunchTarget) return;
    launchIntentRef.current = true;
    setSelectedQuizId("");
    if (initialLaunchTarget.sourceKind === "dll") {
      setSourceKind("dll");
      setSelectedDllId(initialLaunchTarget.dllId);
      setSelectedSessionNumber(initialLaunchTarget.sessionNumber);
    } else {
      setSourceKind("dlp");
      setSelectedDlpId(initialLaunchTarget.dlpId);
    }
    onConsumeLaunchTarget?.();
  }, [initialLaunchTarget, onConsumeLaunchTarget]);

  useEffect(() => {
    const match = quizzes.find((q) => q.id === selectedQuizId) ?? null;
    setDraftQuiz(match ? structuredClone(match) : null);
  }, [quizzes, selectedQuizId]);

  const competencyMap = useMemo(
    () => new Map(curriculum.map((c) => [c.id, c])),
    [curriculum],
  );

  const selectedSourceDll = useMemo(
    () => dlls.find((d) => d.id === selectedDllId) ?? null,
    [dlls, selectedDllId],
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
      !activeSourceSessions.some((s) => s.sessionNumber === selectedSessionNumber)
    ) {
      setSelectedSessionNumber(activeSourceSessions[0]!.sessionNumber);
    }
  }, [activeSourceSessions, selectedSessionNumber]);

  const selectedSourceSession = useMemo(
    () =>
      activeSourceSessions.find((s) => s.sessionNumber === selectedSessionNumber) ??
      null,
    [activeSourceSessions, selectedSessionNumber],
  );

  function addCompetency() {
    if (!pickedCompetencyId) return;
    setSelectedCompetencyIds((prev) =>
      prev.includes(pickedCompetencyId) ? prev : [...prev, pickedCompetencyId],
    );
  }

  function removeCompetency(id: string) {
    setSelectedCompetencyIds((prev) => prev.filter((item) => item !== id));
  }

  function updateCount(type: QuizQuestionType, value: string) {
    const num = Math.max(0, Math.min(50, Math.floor(Number(value) || 0)));
    setItemCounts((prev) => ({ ...prev, [type]: num }));
  }

  async function handleGenerate(event: FormEvent) {
    event.preventDefault();
    setStatus(null);
    setGenerating(true);
    try {
      const shared = { title, promptNotes, itemCounts };
      const payload =
        sourceKind === "dll"
          ? {
              ...shared,
              sourceKind: "dll" as const,
              dllId: selectedDllId,
              sessionNumber: selectedSessionNumber,
            }
          : sourceKind === "dlp"
            ? {
                ...shared,
                sourceKind: "dlp" as const,
                dlpId: selectedDlpId,
              }
            : {
                ...shared,
                sourceKind: "standalone" as const,
                competencyIds: selectedCompetencyIds,
                gradeAndSection,
              };

      const res = await fetch("/api/quizzes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const created = (await res.json()) as Quiz;
      setQuizzes((prev) => [created, ...prev]);
      setSelectedQuizId(created.id);
      setViewMode("markdown");
      setStatus({
        tone: "success",
        text: `Generated Quiz "${created.title}" (${created.learningAreas}).`,
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

  function updateDraftSection(
    sectionIdx: number,
    updater: (section: Quiz["sections"][number]) => Quiz["sections"][number],
  ) {
    setDraftQuiz((prev) =>
      prev
        ? {
            ...prev,
            sections: prev.sections.map((s, idx) =>
              idx === sectionIdx ? updater(s) : s,
            ),
          }
        : prev,
    );
  }

  function updateDraftItem(
    sectionIdx: number,
    itemIdx: number,
    updater: (
      item: Quiz["sections"][number]["items"][number],
    ) => Quiz["sections"][number]["items"][number],
  ) {
    updateDraftSection(sectionIdx, (section) => ({
      ...section,
      items: section.items.map((item, idx) =>
        idx === itemIdx ? updater(item) : item,
      ),
    }));
  }

  function updateSectionDirections(sectionIdx: number, directions: string) {
    updateDraftSection(sectionIdx, (s) => ({ ...s, directions }));
  }

  function updateItemField(
    sectionIdx: number,
    itemIdx: number,
    field: "prompt" | "answer" | "rubric",
    value: string,
  ) {
    updateDraftItem(sectionIdx, itemIdx, (item) => ({ ...item, [field]: value }));
  }

  function updateChoice(
    sectionIdx: number,
    itemIdx: number,
    choiceIdx: number,
    value: string,
  ) {
    updateDraftItem(sectionIdx, itemIdx, (item) => {
      const choices = [...(item.choices ?? [])];
      choices[choiceIdx] = value;
      return { ...item, choices };
    });
  }

  async function saveDraftQuiz(quiz: Quiz): Promise<Quiz> {
    const res = await fetch(`/api/quizzes/${encodeURIComponent(quiz.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(quiz),
    });
    if (!res.ok) throw new Error(await readErrorMessage(res));
    const updated = (await res.json()) as Quiz;
    setQuizzes((prev) =>
      prev.map((item) => (item.id === updated.id ? updated : item)),
    );
    return updated;
  }

  async function handleSaveEdits() {
    if (!draftQuiz) return;
    setStatus(null);
    setSaving(true);
    try {
      const updated = await saveDraftQuiz(draftQuiz);
      setStatus({
        tone: "success",
        text: `Saved changes to "${updated.title}" on local disk.`,
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

  async function handleSyncToLesson() {
    if (!draftQuiz) return;
    setStatus(null);
    setSyncing(true);
    try {
      const saved = await saveDraftQuiz(draftQuiz);
      const res = await fetch(`/api/quizzes/${encodeURIComponent(saved.id)}/sync`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const result = (await res.json()) as QuizSyncResult;
      const targetLabel =
        result.kind === "dll"
          ? `DLL "${result.dll.lessonTitle}" Session ${saved.source.kind === "dll" ? saved.source.sessionNumber : ""}`
          : `DLP "${result.dlp.lessonTitle}"`;
      setStatus({
        tone: "success",
        text: `Synced Quiz items into ${targetLabel} Formative Assessment.`,
      });
    } catch (err) {
      setStatus({
        tone: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSyncing(false);
    }
  }

  async function handleDownloadDocx() {
    if (!draftQuiz) return;
    setStatus(null);
    setDownloading(true);
    try {
      const saved = await saveDraftQuiz(draftQuiz);
      const res = await fetch(`/api/quizzes/${encodeURIComponent(saved.id)}/docx`);
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") ?? "";
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filenameMatch?.[1] ?? `${saved.id}.docx`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setStatus({
        tone: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setDownloading(false);
    }
  }

  async function handleDeleteQuiz() {
    if (!draftQuiz) return;
    setStatus(null);
    try {
      const res = await fetch(`/api/quizzes/${encodeURIComponent(draftQuiz.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const remaining = quizzes.filter((q) => q.id !== draftQuiz.id);
      setQuizzes(remaining);
      setSelectedQuizId(remaining[0]?.id ?? "");
      setStatus({
        tone: "success",
        text: `Deleted "${draftQuiz.title}".`,
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
            Quiz Maker
          </h1>
          <p className="workspace-subtitle">
            Generate printable formative Quizzes from a DLL Session, DLP, or
            Learning Competencies, sync into lessons, and export .docx with a
            page-separated Answer Key.
          </p>
        </div>

        <div className="actions-row">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setSelectedQuizId("")}
          >
            + New Quiz
          </button>
        </div>
      </div>

      {status && (
        <div className="status-banner" data-tone={status.tone} role="status">
          {status.text}
        </div>
      )}

      {quizzes.length > 0 && (
        <div className="card dll-saved-bar">
          <div className="field">
            <label htmlFor={`${baseId}-saved-quiz`}>Saved Quizzes</label>
            <select
              id={`${baseId}-saved-quiz`}
              value={selectedQuizId}
              onChange={(e) => setSelectedQuizId(e.target.value)}
            >
              <option value="">Create a new Formative Quiz...</option>
              {quizzes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} — {item.learningAreas} ({item.gradeAndSection})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card">Loading Quizzes, Lessons, and Curriculum Catalog...</div>
      ) : !draftQuiz ? (
        <form className="settings-form" onSubmit={handleGenerate}>
          <fieldset className="settings-fieldset">
            <legend>1. Quiz Source</legend>

            <div className="classroom-tablist" role="tablist" aria-label="Quiz Source">
              <button
                type="button"
                role="tab"
                className="classroom-tab"
                aria-selected={sourceKind === "standalone"}
                onClick={() => setSourceKind("standalone")}
              >
                Learning Competencies
              </button>
              <button
                type="button"
                role="tab"
                className="classroom-tab"
                aria-selected={sourceKind === "dll"}
                onClick={() => setSourceKind("dll")}
              >
                From DLL Session
              </button>
              <button
                type="button"
                role="tab"
                className="classroom-tab"
                aria-selected={sourceKind === "dlp"}
                onClick={() => setSourceKind("dlp")}
              >
                From DLP
              </button>
            </div>

            {sourceKind === "dll" ? (
              dlls.length === 0 ? (
                <p className="hint">
                  No saved DLLs yet. Create one in <a href="#dll">DLL Builder</a>.
                </p>
              ) : (
                <div className="dll-form-grid">
                  <div className="field">
                    <label htmlFor={`${baseId}-src-dll`}>Saved DLL</label>
                    <select
                      id={`${baseId}-src-dll`}
                      value={selectedDllId}
                      onChange={(e) => setSelectedDllId(e.target.value)}
                    >
                      {dlls.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.lessonTitle} ({item.gradeAndSection})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor={`${baseId}-src-session`}>Active Session</label>
                    <select
                      id={`${baseId}-src-session`}
                      value={selectedSessionNumber}
                      onChange={(e) =>
                        setSelectedSessionNumber(Number(e.target.value) as SessionNumber)
                      }
                    >
                      {activeSourceSessions.map((s) => (
                        <option key={s.sessionNumber} value={s.sessionNumber}>
                          Session {s.sessionNumber} ({s.components.join(", ") || "TLE"})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )
            ) : sourceKind === "dlp" ? (
              dlps.length === 0 ? (
                <p className="hint">
                  No saved DLPs yet. Create one in <a href="#dlp">DLP Builder</a>.
                </p>
              ) : (
                <div className="field">
                  <label htmlFor={`${baseId}-src-dlp`}>Saved DLP</label>
                  <select
                    id={`${baseId}-src-dlp`}
                    value={selectedDlpId}
                    onChange={(e) => setSelectedDlpId(e.target.value)}
                  >
                    {dlps.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.lessonTitle} — {item.learningAreas} ({item.gradeAndSection})
                      </option>
                    ))}
                  </select>
                </div>
              )
            ) : (
              <>
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
                    onClick={addCompetency}
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
                            onClick={() => removeCompetency(cid)}
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
          </fieldset>

          <fieldset className="settings-fieldset">
            <legend>2. Question Types, Item Counts &amp; Prompt Notes</legend>

            <div className="field">
              <label htmlFor={`${baseId}-title`}>Quiz Title (optional)</label>
              <input
                id={`${baseId}-title`}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Leave blank for AI-generated title"
              />
            </div>

            <div className="quiz-counts-grid">
              {QUIZ_QUESTION_TYPES.map((type) => (
                <div key={type} className="field">
                  <label htmlFor={`${baseId}-count-${type}`}>
                    {QUIZ_SECTION_META[type].title}
                  </label>
                  <input
                    id={`${baseId}-count-${type}`}
                    type="number"
                    min={0}
                    max={50}
                    value={itemCounts[type]}
                    onChange={(e) => updateCount(type, e.target.value)}
                  />
                </div>
              ))}
            </div>

            <div className="field">
              <label htmlFor={`${baseId}-prompt-notes`}>Prompt Notes (optional)</label>
              <textarea
                id={`${baseId}-prompt-notes`}
                value={promptNotes}
                onChange={(e) => setPromptNotes(e.target.value)}
                placeholder="e.g. Focus on tool safety, Grade 7 reading level..."
              />
            </div>
          </fieldset>

          <div className="actions-row">
            <button
              type="submit"
              className="btn-primary"
              disabled={
                generating ||
                (sourceKind === "dll" && (!selectedDllId || !selectedSourceSession)) ||
                (sourceKind === "dlp" && !selectedDlpId)
              }
            >
              {generating ? "Generating Quiz..." : "Generate Quiz"}
            </button>
          </div>
        </form>
      ) : (
        <div className="dll-editor-stack">
          <div className="card dll-toolbar">
            <div>
              <h2>{draftQuiz.title}</h2>
              <div className="curriculum-badges">
                <span className="badge badge-bow">{draftQuiz.learningAreas}</span>
                <span className="badge">{draftQuiz.gradeAndSection}</span>
                {draftQuiz.source.kind === "dll" && (
                  <span className="badge">
                    Linked to DLL Session {draftQuiz.source.sessionNumber}
                  </span>
                )}
                {draftQuiz.source.kind === "dlp" && (
                  <span className="badge">Linked to DLP</span>
                )}
              </div>
            </div>

            <div className="actions-row">
              <div className="classroom-tablist" role="tablist" aria-label="Quiz View Mode">
                <button
                  type="button"
                  role="tab"
                  className="classroom-tab"
                  aria-selected={viewMode === "markdown"}
                  onClick={() => setViewMode("markdown")}
                >
                  Markdown View
                </button>
                <button
                  type="button"
                  role="tab"
                  className="classroom-tab"
                  aria-selected={viewMode === "edit"}
                  onClick={() => setViewMode("edit")}
                >
                  Inline Editor
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

              {draftQuiz.source.kind !== "standalone" && (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={syncing}
                  onClick={handleSyncToLesson}
                >
                  {syncing ? "Syncing..." : "Sync to Lesson Formative Assessment"}
                </button>
              )}

              <button
                type="button"
                className="btn-secondary"
                disabled={downloading}
                onClick={handleDownloadDocx}
              >
                {downloading ? "Preparing DOCX..." : "Download DOCX"}
              </button>

              <button
                type="button"
                className="btn-secondary"
                onClick={handleDeleteQuiz}
              >
                Delete
              </button>
            </div>
          </div>

          {viewMode === "markdown" ? (
            <article className="card dll-markdown-view">
              {renderMarkdownBlocks(renderQuizMarkdown(draftQuiz))}
            </article>
          ) : (
            <div className="dll-editor-stack">
              <div className="card settings-form">
                <h3>Quiz Header</h3>
                <div className="dll-form-grid">
                  <div className="field">
                    <label htmlFor={`${baseId}-edit-title`}>Quiz Title</label>
                    <input
                      id={`${baseId}-edit-title`}
                      type="text"
                      value={draftQuiz.title}
                      onChange={(e) =>
                        setDraftQuiz((prev) =>
                          prev ? { ...prev, title: e.target.value } : prev,
                        )
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`${baseId}-edit-areas`}>Learning Area/s</label>
                    <input
                      id={`${baseId}-edit-areas`}
                      type="text"
                      value={draftQuiz.learningAreas}
                      onChange={(e) =>
                        setDraftQuiz((prev) =>
                          prev ? { ...prev, learningAreas: e.target.value } : prev,
                        )
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
                      value={draftQuiz.gradeAndSection}
                      onChange={(e) =>
                        setDraftQuiz((prev) =>
                          prev ? { ...prev, gradeAndSection: e.target.value } : prev,
                        )
                      }
                    />
                  </div>
                </div>
              </div>

              {draftQuiz.sections.map((section, sIdx) => {
                const roman = ROMAN_PARTS[sIdx] ?? String(sIdx + 1);
                return (
                  <section
                    key={section.type}
                    className="card settings-form"
                    aria-label={`Part ${roman}. ${section.title}`}
                  >
                    <h3>
                      Part {roman}. {section.title}
                    </h3>
                    <div className="field">
                      <label htmlFor={`${baseId}-dir-${sIdx}`}>Directions</label>
                      <input
                        id={`${baseId}-dir-${sIdx}`}
                        type="text"
                        value={section.directions}
                        onChange={(e) => updateSectionDirections(sIdx, e.target.value)}
                      />
                    </div>

                    {section.items.map((item, iIdx) => (
                      <div key={item.id} className="quiz-item-card">
                        <div className="field">
                          <label htmlFor={`${baseId}-q-${sIdx}-${iIdx}`}>
                            Item {iIdx + 1} Question
                          </label>
                          <textarea
                            id={`${baseId}-q-${sIdx}-${iIdx}`}
                            rows={2}
                            value={item.prompt}
                            onChange={(e) =>
                              updateItemField(sIdx, iIdx, "prompt", e.target.value)
                            }
                          />
                        </div>

                        {section.type === "multipleChoice" && item.choices && (
                          <div className="quiz-choices-grid">
                            {item.choices.map((choice, cIdx) => (
                              <div key={cIdx} className="field">
                                <label htmlFor={`${baseId}-c-${sIdx}-${iIdx}-${cIdx}`}>
                                  Choice {String.fromCharCode(65 + cIdx)}
                                </label>
                                <input
                                  id={`${baseId}-c-${sIdx}-${iIdx}-${cIdx}`}
                                  type="text"
                                  value={choice}
                                  onChange={(e) =>
                                    updateChoice(sIdx, iIdx, cIdx, e.target.value)
                                  }
                                />
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="field">
                          <label htmlFor={`${baseId}-a-${sIdx}-${iIdx}`}>
                            Answer Key
                          </label>
                          <input
                            id={`${baseId}-a-${sIdx}-${iIdx}`}
                            type="text"
                            value={item.answer}
                            onChange={(e) =>
                              updateItemField(sIdx, iIdx, "answer", e.target.value)
                            }
                          />
                        </div>

                        {section.type === "essayRubric" && (
                          <div className="field">
                            <label htmlFor={`${baseId}-r-${sIdx}-${iIdx}`}>
                              Rubric
                            </label>
                            <textarea
                              id={`${baseId}-r-${sIdx}-${iIdx}`}
                              rows={2}
                              value={item.rubric ?? ""}
                              onChange={(e) =>
                                updateItemField(sIdx, iIdx, "rubric", e.target.value)
                              }
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
