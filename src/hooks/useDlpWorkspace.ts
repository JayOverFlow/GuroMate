import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type {
  ClassSection,
  CurriculumCompetency,
  DailyLessonLog,
  DailyLessonPlan,
  DlpActivityPair,
  DlpIntentions,
  SessionNumber,
} from "../engine/types";
import {
  buildDeleteDlpPrompt,
  buildRemoveDlpCompetencyPrompt,
} from "../utils/confirmAction";
import {
  DLP_BUILDER_FIELDS,
  updateFieldError,
  validateDlpBuilderField,
  validateDlpBuilderForm,
  type DlpBuilderFieldKey,
  type FieldErrors,
} from "../utils/formValidation";
import { readErrorMessage } from "../workspaces/lessonViewHelpers";
import { useConfirmDialog } from "./useConfirmDialog";
import {
  appendUniqueId,
  type DlpLaunchTarget,
} from "./workspaceLaunchHelpers";

export type { DlpLaunchTarget };

export type ViewMode = "edit" | "markdown";
export type BuilderMode = "scratch" | "derive";

export interface DlpStatusState {
  tone: "success" | "error";
  text: string;
}

export type ActivityRowKey =
  | "preLesson"
  | "lessonFlow"
  | "learningResources"
  | "integrationAndContextualization"
  | "formativeAssessment"
  | "extendedLearningOpportunities"
  | "reflections";

export const DLP_ACTIVITY_ROWS: ReadonlyArray<{
  key: ActivityRowKey;
  label: string;
  section: string;
  rows?: number;
}> = [
  {
    key: "preLesson",
    label: "Pre-Lesson",
    section: "II. Learning Experience",
    rows: 3,
  },
  {
    key: "lessonFlow",
    label: "Lesson Flow",
    section: "II. Learning Experience",
    rows: 4,
  },
  {
    key: "learningResources",
    label: "Learning Resources",
    section: "II. Learning Experience",
    rows: 2,
  },
  {
    key: "integrationAndContextualization",
    label: "Opportunities for Integration and Contextualization",
    section: "II. Learning Experience",
    rows: 2,
  },
  {
    key: "formativeAssessment",
    label: "Formative Assessment",
    section: "III. Assessing Learning",
    rows: 3,
  },
  {
    key: "extendedLearningOpportunities",
    label: "Extended Learning Opportunities",
    section: "IV. Ways Forward",
    rows: 2,
  },
  {
    key: "reflections",
    label: "Reflections (always left blank in .docx export)",
    section: "IV. Ways Forward",
    rows: 2,
  },
];

export const DLP_INTENTIONS_LIST_FIELDS: ReadonlyArray<{
  key: "learningCompetencies" | "contentStandards" | "performanceStandards";
  label: string;
}> = [
  { key: "learningCompetencies", label: "Learning Competencies (one per line)" },
  { key: "contentStandards", label: "Content Standards (one per line)" },
  { key: "performanceStandards", label: "Performance Standards (one per line)" },
];

export function useDlpWorkspace(
  initialLaunchTarget?: DlpLaunchTarget | null,
  onConsumeLaunchTarget?: () => void,
) {
  const [dlps, setDlps] = useState<DailyLessonPlan[]>([]);
  const [dlls, setDlls] = useState<DailyLessonLog[]>([]);
  const [curriculum, setCurriculum] = useState<CurriculumCompetency[]>([]);
  const [sections, setSections] = useState<ClassSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<DlpStatusState | null>(null);

  const [selectedDlpId, setSelectedDlpId] = useState("");
  const [draftDlp, setDraftDlp] = useState<DailyLessonPlan | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("edit");
  const [saving, setSaving] = useState(false);

  const [builderMode, setBuilderMode] = useState<BuilderMode>("scratch");
  const [deriveDllId, setDeriveDllId] = useState("");
  const [deriveSessionNumber, setDeriveSessionNumber] =
    useState<SessionNumber>(1);
  const [lessonTitle, setLessonTitle] = useState("");
  const [gradeAndSection, setGradeAndSection] = useState("");
  const [references, setReferences] = useState("");
  const [promptNotes, setPromptNotes] = useState("");
  const [selectedCompetencyIds, setSelectedCompetencyIds] = useState<string[]>(
    [],
  );
  const [generating, setGenerating] = useState(false);
  const [pickedCompetencyId, setPickedCompetencyId] = useState("");
  const [fieldErrors, setFieldErrors] = useState<
    FieldErrors<DlpBuilderFieldKey>
  >({});
  const formRef = useRef<HTMLFormElement>(null);
  const interactedFieldsRef = useRef<Set<DlpBuilderFieldKey>>(new Set());
  const launchIntentRef = useRef(Boolean(initialLaunchTarget));
  const confirmDialog = useConfirmDialog();

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
      if (loadedDlps.length > 0 && !launchIntentRef.current) {
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
    if (!initialLaunchTarget) return;
    launchIntentRef.current = true;
    setSelectedDlpId("");
    interactedFieldsRef.current.clear();
    setFieldErrors({});
    if (initialLaunchTarget.mode === "derive") {
      setBuilderMode("derive");
      setDeriveDllId(initialLaunchTarget.dllId);
      setDeriveSessionNumber(initialLaunchTarget.sessionNumber);
    } else {
      setBuilderMode("scratch");
      setSelectedCompetencyIds((prev) =>
        appendUniqueId(prev, initialLaunchTarget.competencyId),
      );
      const trimmed = initialLaunchTarget.competencyId.trim();
      if (trimmed) setPickedCompetencyId(trimmed);
    }
    onConsumeLaunchTarget?.();
  }, [initialLaunchTarget, onConsumeLaunchTarget]);

  useEffect(() => {
    const match = dlps.find((d) => d.id === selectedDlpId) ?? null;
    setDraftDlp(match ? structuredClone(match) : null);
    interactedFieldsRef.current.clear();
    setFieldErrors({});
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
      activeSourceSessions.find((s) => s.sessionNumber === deriveSessionNumber) ??
      null,
    [activeSourceSessions, deriveSessionNumber],
  );

  function selectBuilderMode(mode: BuilderMode) {
    setBuilderMode(mode);
    interactedFieldsRef.current.clear();
    setFieldErrors({});
  }

  function validateField(
    field: DlpBuilderFieldKey,
    overrides?: Partial<{
      mode: BuilderMode;
      gradeAndSection: string;
      selectedCompetencyIds: readonly string[];
    }>,
  ) {
    if (!interactedFieldsRef.current.has(field) && !fieldErrors[field]) {
      return;
    }
    const message = validateDlpBuilderField(field, {
      mode: overrides?.mode ?? builderMode,
      gradeAndSection: overrides?.gradeAndSection ?? gradeAndSection,
      selectedCompetencyIds:
        overrides?.selectedCompetencyIds ?? selectedCompetencyIds,
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

  function addScratchCompetency() {
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

  function removeScratchCompetency(id: string) {
    interactedFieldsRef.current.add("selectedCompetencyIds");
    setSelectedCompetencyIds((prev) => prev.filter((item) => item !== id));
  }

  function requestRemoveScratchCompetency(id: string) {
    const label = competencyMap.get(id)?.learningCompetency ?? id;
    confirmDialog.requestConfirm(buildRemoveDlpCompetencyPrompt(label), () => {
      removeScratchCompetency(id);
    });
  }

  async function handleGenerate(event: FormEvent) {
    event.preventDefault();
    setStatus(null);
    for (const field of DLP_BUILDER_FIELDS) {
      interactedFieldsRef.current.add(field);
    }
    const errors = validateDlpBuilderForm({
      mode: builderMode,
      gradeAndSection,
      selectedCompetencyIds,
    });
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const firstInvalid = DLP_BUILDER_FIELDS.find((field) =>
        Boolean(errors[field]),
      );
      if (firstInvalid) {
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

  function requestDeleteDlp() {
    if (!draftDlp) return;
    const target = draftDlp;
    confirmDialog.requestConfirm(
      buildDeleteDlpPrompt(target.lessonTitle),
      async () => {
        setStatus(null);
        const res = await fetch(`/api/dlps/${encodeURIComponent(target.id)}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error(await readErrorMessage(res));
        const remaining = dlps.filter((d) => d.id !== target.id);
        setDlps(remaining);
        setSelectedDlpId(remaining[0]?.id ?? "");
        setStatus({
          tone: "success",
          text: `Deleted "${target.lessonTitle}".`,
        });
      },
    );
  }

  return {
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
  };
}
