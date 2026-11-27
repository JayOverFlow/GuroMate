import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  QUIZ_QUESTION_TYPES,
  type ClassSection,
  type CurriculumCompetency,
  type DailyLessonLog,
  type DailyLessonPlan,
  type Quiz,
  type QuizQuestionType,
  type QuizSyncResult,
  type SessionNumber,
} from "../engine/types";
import {
  buildDeleteQuizPrompt,
  buildRemoveQuizCompetencyPrompt,
} from "../utils/confirmAction";
import {
  QUIZ_BUILDER_FIELDS,
  getInvalidQuizCountTypes,
  parseQuizItemCounts,
  updateFieldError,
  validateQuizBuilderField,
  validateQuizBuilderForm,
  type FieldErrors,
  type QuizBuilderFieldKey,
} from "../utils/formValidation";
import { readErrorMessage } from "../workspaces/lessonViewHelpers";
import { useConfirmDialog } from "./useConfirmDialog";
import {
  appendUniqueId,
  type QuizLaunchTarget,
} from "./workspaceLaunchHelpers";

export type { QuizLaunchTarget };

export type ViewMode = "edit" | "markdown";
export type SourceKind = "standalone" | "dll" | "dlp";

export interface QuizStatusState {
  tone: "success" | "error";
  text: string;
}

const DEFAULT_COUNT_DRAFTS: Record<QuizQuestionType, string> = {
  multipleChoice: "5",
  trueFalse: "0",
  identification: "0",
  essayRubric: "0",
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
  const [itemCountDrafts, setItemCountDrafts] =
    useState<Record<QuizQuestionType, string>>(DEFAULT_COUNT_DRAFTS);
  const [selectedCompetencyIds, setSelectedCompetencyIds] = useState<string[]>(
    [],
  );
  const [pickedCompetencyId, setPickedCompetencyId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<
    FieldErrors<QuizBuilderFieldKey>
  >({});
  const formRef = useRef<HTMLFormElement>(null);
  const interactedFieldsRef = useRef<Set<QuizBuilderFieldKey>>(new Set());
  const launchIntentRef = useRef(Boolean(initialLaunchTarget));
  const confirmDialog = useConfirmDialog();

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
    interactedFieldsRef.current.clear();
    setFieldErrors({});
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
        appendUniqueId(prev, initialLaunchTarget.competencyId),
      );
      const trimmed = initialLaunchTarget.competencyId.trim();
      if (trimmed) setPickedCompetencyId(trimmed);
    }
    onConsumeLaunchTarget?.();
  }, [initialLaunchTarget, onConsumeLaunchTarget]);

  useEffect(() => {
    const match = quizzes.find((q) => q.id === selectedQuizId) ?? null;
    setDraftQuiz(match ? structuredClone(match) : null);
    interactedFieldsRef.current.clear();
    setFieldErrors({});
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

  const invalidCountTypes = useMemo(
    () =>
      fieldErrors.itemCounts
        ? new Set(getInvalidQuizCountTypes(itemCountDrafts))
        : new Set<QuizQuestionType>(),
    [fieldErrors.itemCounts, itemCountDrafts],
  );

  function selectSourceKind(next: SourceKind) {
    setSourceKind(next);
    interactedFieldsRef.current.clear();
    setFieldErrors({});
  }

  function validateField(
    field: QuizBuilderFieldKey,
    overrides?: Partial<{
      sourceKind: SourceKind;
      gradeAndSection: string;
      selectedCompetencyIds: readonly string[];
      itemCounts: Record<QuizQuestionType, string>;
    }>,
  ) {
    if (!interactedFieldsRef.current.has(field) && !fieldErrors[field]) {
      return;
    }
    const message = validateQuizBuilderField(field, {
      sourceKind: overrides?.sourceKind ?? sourceKind,
      gradeAndSection: overrides?.gradeAndSection ?? gradeAndSection,
      selectedCompetencyIds:
        overrides?.selectedCompetencyIds ?? selectedCompetencyIds,
      itemCounts: overrides?.itemCounts ?? itemCountDrafts,
    });
    setFieldErrors((prev) => updateFieldError(prev, field, message));
  }

  function handleGradeAndSectionChange(value: string) {
    interactedFieldsRef.current.add("gradeAndSection");
    setGradeAndSection(value);
    if (fieldErrors.gradeAndSection) {
      validateField("gradeAndSection", { gradeAndSection: value });
    }
  }

  function addCompetency() {
    if (!pickedCompetencyId) return;
    interactedFieldsRef.current.add("selectedCompetencyIds");
    const nextIds = selectedCompetencyIds.includes(pickedCompetencyId)
      ? selectedCompetencyIds
      : [...selectedCompetencyIds, pickedCompetencyId];
    setSelectedCompetencyIds(nextIds);
    if (fieldErrors.selectedCompetencyIds) {
      validateField("selectedCompetencyIds", {
        selectedCompetencyIds: nextIds,
      });
    }
  }

  function removeCompetency(id: string) {
    interactedFieldsRef.current.add("selectedCompetencyIds");
    setSelectedCompetencyIds((prev) => prev.filter((item) => item !== id));
  }

  function requestRemoveCompetency(id: string) {
    const label = competencyMap.get(id)?.learningCompetency ?? id;
    confirmDialog.requestConfirm(buildRemoveQuizCompetencyPrompt(label), () => {
      removeCompetency(id);
    });
  }

  function updateCount(type: QuizQuestionType, value: string) {
    interactedFieldsRef.current.add("itemCounts");
    const nextDrafts = { ...itemCountDrafts, [type]: value };
    setItemCountDrafts(nextDrafts);
    if (fieldErrors.itemCounts) {
      validateField("itemCounts", { itemCounts: nextDrafts });
    }
  }

  async function handleGenerate(event: FormEvent) {
    event.preventDefault();
    setStatus(null);
    for (const field of QUIZ_BUILDER_FIELDS) {
      interactedFieldsRef.current.add(field);
    }
    const errors = validateQuizBuilderForm({
      sourceKind,
      gradeAndSection,
      selectedCompetencyIds,
      itemCounts: itemCountDrafts,
    });
    const parsedCounts = parseQuizItemCounts(itemCountDrafts);
    if (Object.keys(errors).length > 0 || !parsedCounts) {
      setFieldErrors(errors);
      const firstInvalid = QUIZ_BUILDER_FIELDS.find((field) =>
        Boolean(errors[field]),
      );
      if (firstInvalid === "itemCounts") {
        const firstType =
          getInvalidQuizCountTypes(itemCountDrafts)[0] ??
          QUIZ_QUESTION_TYPES[0];
        formRef.current
          ?.querySelector<HTMLElement>(`[data-field="count-${firstType}"]`)
          ?.focus();
      } else if (firstInvalid) {
        formRef.current
          ?.querySelector<HTMLElement>(`[data-field="${firstInvalid}"]`)
          ?.focus();
      }
      return;
    }
    interactedFieldsRef.current.clear();
    setFieldErrors({});
    setGenerating(true);
    try {
      const shared = { title, promptNotes, itemCounts: parsedCounts };
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

  function requestDeleteQuiz() {
    if (!draftQuiz) return;
    const target = draftQuiz;
    confirmDialog.requestConfirm(
      buildDeleteQuizPrompt(target.title),
      async () => {
        setStatus(null);
        const res = await fetch(
          `/api/quizzes/${encodeURIComponent(target.id)}`,
          { method: "DELETE" },
        );
        if (!res.ok) throw new Error(await readErrorMessage(res));
        const remaining = quizzes.filter((q) => q.id !== target.id);
        setQuizzes(remaining);
        setSelectedQuizId(remaining[0]?.id ?? "");
        setStatus({
          tone: "success",
          text: `Deleted "${target.title}".`,
        });
      },
    );
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
  };
}
