import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
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
import { readErrorMessage } from "../workspaces/lessonViewHelpers";
import {
  applyQuizLaunchTarget,
  type QuizLaunchTarget,
} from "./workspaceLaunchHelpers";

export type { QuizLaunchTarget };

export type ViewMode = "edit" | "markdown";
export type SourceKind = "standalone" | "dll" | "dlp";

export interface QuizStatusState {
  tone: "success" | "error";
  text: string;
}

const DEFAULT_COUNTS: QuizItemCounts = {
  multipleChoice: 5,
  trueFalse: 0,
  identification: 0,
  essayRubric: 0,
};

export function useQuizWorkspace(
  initialLaunchTarget?: QuizLaunchTarget | null,
  onConsumeLaunchTarget?: () => void,
) {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [dlls, setDlls] = useState<DailyLessonLog[]>([]);
  const [dlps, setDlps] = useState<DailyLessonPlan[]>([]);
  const [curriculum, setCurriculum] = useState<CurriculumCompetency[]>([]);
  const [sections, setSections] = useState<ClassSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<QuizStatusState | null>(null);

  const [selectedQuizId, setSelectedQuizId] = useState("");
  const [draftQuiz, setDraftQuiz] = useState<Quiz | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("markdown");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const [sourceKind, setSourceKind] = useState<SourceKind>("standalone");
  const [selectedDllId, setSelectedDllId] = useState("");
  const [selectedSessionNumber, setSelectedSessionNumber] =
    useState<SessionNumber>(1);
  const [selectedDlpId, setSelectedDlpId] = useState("");
  const [title, setTitle] = useState("");
  const [gradeAndSection, setGradeAndSection] = useState("");
  const [promptNotes, setPromptNotes] = useState("");
  const [itemCounts, setItemCounts] = useState<QuizItemCounts>(DEFAULT_COUNTS);
  const [selectedCompetencyIds, setSelectedCompetencyIds] = useState<string[]>(
    [],
  );
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
    } else if (initialLaunchTarget.sourceKind === "dlp") {
      setSourceKind("dlp");
      setSelectedDlpId(initialLaunchTarget.dlpId);
    } else {
      setSourceKind("standalone");
      setSelectedCompetencyIds((prev) =>
        applyQuizLaunchTarget(
          {
            selectedQuizId: "",
            sourceKind: "standalone",
            selectedDllId: "",
            selectedSessionNumber: 1,
            selectedDlpId: "",
            selectedCompetencyIds: prev,
            pickedCompetencyId: "",
          },
          initialLaunchTarget,
        ).selectedCompetencyIds,
      );
      const trimmed = initialLaunchTarget.competencyId.trim();
      if (trimmed) setPickedCompetencyId(trimmed);
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
      !activeSourceSessions.some(
        (s) => s.sessionNumber === selectedSessionNumber,
      )
    ) {
      setSelectedSessionNumber(activeSourceSessions[0]!.sessionNumber);
    }
  }, [activeSourceSessions, selectedSessionNumber]);

  const selectedSourceSession = useMemo(
    () =>
      activeSourceSessions.find(
        (s) => s.sessionNumber === selectedSessionNumber,
      ) ?? null,
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
      const res = await fetch(
        `/api/quizzes/${encodeURIComponent(saved.id)}/sync`,
        { method: "POST" },
      );
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
      const res = await fetch(
        `/api/quizzes/${encodeURIComponent(saved.id)}/docx`,
      );
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
      const res = await fetch(
        `/api/quizzes/${encodeURIComponent(draftQuiz.id)}`,
        { method: "DELETE" },
      );
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

  return {
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
    setSourceKind,
    selectedDllId,
    setSelectedDllId,
    selectedSessionNumber,
    setSelectedSessionNumber,
    selectedDlpId,
    setSelectedDlpId,
    title,
    setTitle,
    gradeAndSection,
    setGradeAndSection,
    promptNotes,
    setPromptNotes,
    itemCounts,
    selectedCompetencyIds,
    pickedCompetencyId,
    setPickedCompetencyId,
    generating,
    competencyMap,
    activeSourceSessions,
    selectedSourceSession,
    addCompetency,
    removeCompetency,
    updateCount,
    handleGenerate,
    updateSectionDirections,
    updateItemField,
    updateChoice,
    handleSaveEdits,
    handleSyncToLesson,
    handleDownloadDocx,
    handleDeleteQuiz,
  };
}
