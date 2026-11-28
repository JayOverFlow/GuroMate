import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { evaluateDlpAlignment } from "../engine/alignmentCheck";
import { DEFAULT_CLASSROOM_CONTEXT } from "../engine/lessonHelpers";
import type {
  ClassSection,
  ClassroomContext,
  ClassroomFacility,
  CurriculumCompetency,
  DailyLessonLog,
  DailyLessonPlan,
  DeliveryModality,
  DlpActivityPair,
  DlpIntentions,
  DlpLessonBlueprint,
  FormativeAssessmentType,
  SessionNumber,
} from "../engine/types";
import {
  buildDeleteDlpPrompt,
  buildRemoveDlpCompetencyPrompt,
} from "../utils/confirmAction";
import {
  DLP_BUILDER_FIELDS,
  parsePeriodMinutes,
  updateFieldError,
  validateDlpBuilderField,
  validateDlpBuilderForm,
  type DlpBuilderFieldKey,
  type FieldErrors,
} from "../utils/formValidation";
import { resolveDlpLineage } from "../utils/lessonLibraryQuery";
import { readErrorMessage } from "../workspaces/lessonViewHelpers";
import { useConfirmDialog } from "./useConfirmDialog";
import {
  appendUniqueId,
  createFreshDlpCreationFormState,
  isDlpDraftDirty,
  resolveLessonRouteSelection,
  shouldResetCreationFormOnRouteChange,
  type DlpLaunchTarget,
} from "./workspaceLaunchHelpers";

export type { DlpLaunchTarget };

export type ViewMode = "edit" | "markdown";
export type BuilderMode = "scratch" | "derive";

export interface UseDlpWorkspaceOptions {
  initialLaunchTarget?: DlpLaunchTarget | null;
  onConsumeLaunchTarget?: () => void;
  routeLessonId?: string;
  routeViewMode?: ViewMode;
  onRouteChange?: (lessonId?: string, viewMode?: ViewMode) => void;
  onMissingLesson?: (lessonId: string) => void;
  onDeletedLesson?: (lessonTitle: string) => void;
  onDirtyChange?: (isDirty: boolean, lessonLabel?: string) => void;
}

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

export function useDlpWorkspace(options: UseDlpWorkspaceOptions = {}) {
  const {
    initialLaunchTarget,
    onConsumeLaunchTarget,
    routeLessonId,
    routeViewMode,
    onRouteChange,
    onMissingLesson,
    onDeletedLesson,
    onDirtyChange,
  } = options;
  const [dlps, setDlps] = useState<DailyLessonPlan[]>([]);
  const [dlls, setDlls] = useState<DailyLessonLog[]>([]);
  const [curriculum, setCurriculum] = useState<CurriculumCompetency[]>([]);
  const [sections, setSections] = useState<ClassSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [status, setStatus] = useState<DlpStatusState | null>(null);

  const [selectedDlpId, setSelectedDlpId] = useState("");
  const [draftDlp, setDraftDlp] = useState<DailyLessonPlan | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(routeViewMode ?? "edit");
  const [saving, setSaving] = useState(false);

  const [builderMode, setBuilderMode] = useState<BuilderMode>("scratch");
  const [deriveDllId, setDeriveDllId] = useState("");
  const [deriveSessionNumber, setDeriveSessionNumber] =
    useState<SessionNumber>(1);
  const [lessonTitle, setLessonTitle] = useState("");
  const [gradeAndSection, setGradeAndSection] = useState("");
  const [references, setReferences] = useState("");
  const [classroomContext, setClassroomContext] = useState<ClassroomContext>(
    () => ({ ...DEFAULT_CLASSROOM_CONTEXT }),
  );
  const [periodDraft, setPeriodDraft] = useState<string>(
    String(DEFAULT_CLASSROOM_CONTEXT.periodMinutes),
  );
  const [referenceSourceLabel, setReferenceSourceLabel] = useState("");
  const [referenceText, setReferenceText] = useState("");
  const [promptNotes, setPromptNotes] = useState("");
  const [selectedCompetencyIds, setSelectedCompetencyIds] = useState<string[]>(
    [],
  );
  const [blueprint, setBlueprint] = useState<DlpLessonBlueprint | null>(null);
  const [planning, setPlanning] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pickedCompetencyId, setPickedCompetencyId] = useState("");
  const [fieldErrors, setFieldErrors] = useState<
    FieldErrors<DlpBuilderFieldKey>
  >({});
  const formRef = useRef<HTMLFormElement>(null);
  const interactedFieldsRef = useRef<Set<DlpBuilderFieldKey>>(new Set());
  const recentlyDeletedIdRef = useRef<string | null>(null);
  const reportedMissingIdRef = useRef<string | null>(null);
  const prevRouteLessonIdRef = useRef<string | undefined>(routeLessonId);
  const syncedDeriveDllIdRef = useRef<string>("");
  const sectionsRef = useRef<ClassSection[]>(sections);
  sectionsRef.current = sections;
  const dllsRef = useRef<DailyLessonLog[]>(dlls);
  dllsRef.current = dlls;
  const confirmDialog = useConfirmDialog();

  const resetCreationForm = useCallback((launchTarget?: DlpLaunchTarget | null) => {
    const fresh = createFreshDlpCreationFormState(
      sectionsRef.current,
      dllsRef.current,
      launchTarget,
    );
    setBuilderMode(fresh.builderMode);
    setDeriveDllId(fresh.deriveDllId);
    setDeriveSessionNumber(fresh.deriveSessionNumber);
    setLessonTitle(fresh.lessonTitle);
    setGradeAndSection(fresh.gradeAndSection);
    setReferences(fresh.references);
    setClassroomContext(fresh.classroomContext);
    setPeriodDraft(String(fresh.classroomContext.periodMinutes));
    setReferenceSourceLabel(fresh.referenceSourceLabel);
    setReferenceText(fresh.referenceText);
    setPromptNotes(fresh.promptNotes);
    setSelectedCompetencyIds(fresh.selectedCompetencyIds);
    setBlueprint(null);
    setPickedCompetencyId(fresh.pickedCompetencyId);
    syncedDeriveDllIdRef.current = "";
    interactedFieldsRef.current.clear();
    setFieldErrors({});
  }, []);

  const loadWorkspaceData = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
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
    } catch (err) {
      setLoadFailed(true);
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
    setSelectedDlpId("");
    setViewMode("edit");
    setBlueprint(null);
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

  const routeResolution = useMemo(
    () =>
      resolveLessonRouteSelection(
        routeLessonId,
        routeViewMode,
        dlps.map((d) => d.id),
        loading,
      ),
    [routeLessonId, routeViewMode, dlps, loading],
  );

  useEffect(() => {
    if (routeResolution.kind === "loading") return;
    const prevRouteLessonId = prevRouteLessonIdRef.current;
    prevRouteLessonIdRef.current = routeLessonId;

    if (routeResolution.kind === "create") {
      reportedMissingIdRef.current = null;
      setSelectedDlpId("");
      setViewMode("edit");
      if (
        shouldResetCreationFormOnRouteChange(
          prevRouteLessonId,
          routeResolution.kind,
        )
      ) {
        resetCreationForm(initialLaunchTarget);
        setStatus(null);
      }
      return;
    }
    if (routeResolution.kind === "open") {
      reportedMissingIdRef.current = null;
      setSelectedDlpId(routeResolution.lessonId);
      setViewMode(routeResolution.viewMode);
      return;
    }
    if (
      !loadFailed &&
      recentlyDeletedIdRef.current !== routeResolution.lessonId &&
      reportedMissingIdRef.current !== routeResolution.lessonId
    ) {
      reportedMissingIdRef.current = routeResolution.lessonId;
      onMissingLesson?.(routeResolution.lessonId);
    }
  }, [
    routeResolution,
    routeLessonId,
    initialLaunchTarget,
    resetCreationForm,
    loadFailed,
    onMissingLesson,
  ]);

  const savedDlp = useMemo(
    () => dlps.find((d) => d.id === selectedDlpId) ?? null,
    [dlps, selectedDlpId],
  );

  useEffect(() => {
    setDraftDlp(savedDlp ? structuredClone(savedDlp) : null);
    interactedFieldsRef.current.clear();
    setFieldErrors({});
  }, [savedDlp]);

  const isDirty = useMemo(
    () => isDlpDraftDirty(savedDlp, draftDlp),
    [savedDlp, draftDlp],
  );

  const draftLineage = useMemo(
    () => (draftDlp ? resolveDlpLineage(draftDlp, dlls) : null),
    [draftDlp, dlls],
  );

  const alignmentCheck = useMemo(() => {
    if (!savedDlp) return null;
    if (savedDlp.alignmentCheck) return savedDlp.alignmentCheck;
    const parentSession =
      savedDlp.sourceDllId && savedDlp.sourceSessionNumber
        ? dlls
            .find((d) => d.id === savedDlp.sourceDllId)
            ?.sessions.find(
              (s) =>
                s.sessionNumber === savedDlp.sourceSessionNumber &&
                s.mode === "instructional",
            )
        : undefined;
    return evaluateDlpAlignment(savedDlp, { parentSession });
  }, [savedDlp, dlls]);

  useEffect(() => {
    onDirtyChange?.(isDirty, draftDlp?.lessonTitle);
  }, [isDirty, draftDlp?.lessonTitle, onDirtyChange]);

  useEffect(() => {
    return () => {
      onDirtyChange?.(false);
    };
  }, [onDirtyChange]);

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

  useEffect(() => {
    if (builderMode !== "derive") {
      syncedDeriveDllIdRef.current = "";
      return;
    }
    if (!selectedSourceDll || syncedDeriveDllIdRef.current === selectedSourceDll.id) {
      return;
    }
    syncedDeriveDllIdRef.current = selectedSourceDll.id;
    // Always overwrite so a previous DLL's context/reference never leaks into this one.
    applyLessonContext(
      selectedSourceDll.classroomContext,
      selectedSourceDll.referenceMaterial,
    );
  }, [builderMode, selectedSourceDll]);

  function applyLessonContext(
    context: ClassroomContext | undefined,
    reference: { sourceLabel?: string; text: string } | undefined,
  ) {
    const next = context ?? DEFAULT_CLASSROOM_CONTEXT;
    setClassroomContext({ ...next });
    setPeriodDraft(String(next.periodMinutes));
    setFieldErrors((prev) => updateFieldError(prev, "periodMinutes", undefined));
    setReferenceSourceLabel(reference?.sourceLabel ?? "");
    setReferenceText(reference?.text ?? "");
  }

  function selectBuilderMode(mode: BuilderMode) {
    if (builderMode === "derive" && mode !== "derive") {
      applyLessonContext(undefined, undefined);
    }
    setBuilderMode(mode);
    setBlueprint(null);
    interactedFieldsRef.current.clear();
    setFieldErrors({});
  }

  function selectDeriveDllId(id: string) {
    setDeriveDllId(id);
    setBlueprint(null);
  }

  function selectDeriveSessionNumber(sessionNumber: SessionNumber) {
    setDeriveSessionNumber(sessionNumber);
    setBlueprint(null);
  }

  function validateField(
    field: DlpBuilderFieldKey,
    overrides?: Partial<{
      mode: BuilderMode;
      gradeAndSection: string;
      periodMinutes: string;
      selectedCompetencyIds: readonly string[];
    }>,
  ) {
    if (!interactedFieldsRef.current.has(field) && !fieldErrors[field]) {
      return;
    }
    const message = validateDlpBuilderField(field, {
      mode: overrides?.mode ?? builderMode,
      gradeAndSection: overrides?.gradeAndSection ?? gradeAndSection,
      periodMinutes: overrides?.periodMinutes ?? periodDraft,
      selectedCompetencyIds:
        overrides?.selectedCompetencyIds ?? selectedCompetencyIds,
    });
    setFieldErrors((prev) => updateFieldError(prev, field, message));
  }

  function selectPeriodPreset(minutes: number) {
    setPeriodDraft(String(minutes));
    setClassroomContext((prev) => ({ ...prev, periodMinutes: minutes }));
    setFieldErrors((prev) => updateFieldError(prev, "periodMinutes", undefined));
  }

  function handlePeriodDraftChange(value: string) {
    interactedFieldsRef.current.add("periodMinutes");
    setPeriodDraft(value);
    const parsed = parsePeriodMinutes(value);
    if (parsed !== null) {
      setClassroomContext((prev) => ({ ...prev, periodMinutes: parsed }));
    }
    if (fieldErrors.periodMinutes) {
      validateField("periodMinutes", { periodMinutes: value });
    }
  }

  function updateFacility(facility: ClassroomFacility) {
    setClassroomContext((prev) => ({ ...prev, facility }));
  }

  function updateModality(modality: DeliveryModality) {
    setClassroomContext((prev) => ({ ...prev, modality }));
  }

  function clearReferenceMaterial() {
    setReferenceSourceLabel("");
    setReferenceText("");
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
    setBlueprint(null);
    if (fieldErrors.selectedCompetencyIds) {
      validateField("selectedCompetencyIds", {
        selectedCompetencyIds: nextIds,
      });
    }
  }

  function removeScratchCompetency(id: string) {
    interactedFieldsRef.current.add("selectedCompetencyIds");
    setSelectedCompetencyIds((prev) => prev.filter((item) => item !== id));
    setBlueprint(null);
  }

  function requestRemoveScratchCompetency(id: string) {
    const label = competencyMap.get(id)?.learningCompetency ?? id;
    confirmDialog.requestConfirm(buildRemoveDlpCompetencyPrompt(label), () => {
      removeScratchCompetency(id);
    });
  }

  function validateBuilderBeforeRequest(): boolean {
    for (const field of DLP_BUILDER_FIELDS) {
      interactedFieldsRef.current.add(field);
    }
    const errors = validateDlpBuilderForm({
      mode: builderMode,
      gradeAndSection,
      periodMinutes: periodDraft,
      selectedCompetencyIds,
    });
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setStatus(null);
      const firstInvalid = DLP_BUILDER_FIELDS.find((field) =>
        Boolean(errors[field]),
      );
      if (firstInvalid) {
        formRef.current
          ?.querySelector<HTMLElement>(`[data-field="${firstInvalid}"]`)
          ?.focus();
      }
      return false;
    }
    interactedFieldsRef.current.clear();
    setFieldErrors({});
    return true;
  }

  function buildDlpRequestPayload() {
    const resolvedPeriod =
      parsePeriodMinutes(periodDraft) ?? classroomContext.periodMinutes;
    const nextContext: ClassroomContext = {
      ...classroomContext,
      periodMinutes: resolvedPeriod,
    };
    const referenceMaterial = referenceText.trim()
      ? {
          ...(referenceSourceLabel.trim()
            ? { sourceLabel: referenceSourceLabel.trim() }
            : {}),
          text: referenceText,
        }
      : builderMode === "derive"
        ? { text: "" }
        : undefined;

    return builderMode === "derive"
      ? {
          mode: "derive" as const,
          dllId: deriveDllId,
          sessionNumber: deriveSessionNumber,
          lessonTitle,
          references,
          classroomContext: nextContext,
          referenceMaterial,
          promptNotes,
        }
      : {
          mode: "scratch" as const,
          lessonTitle,
          gradeAndSection,
          references,
          classroomContext: nextContext,
          ...(referenceMaterial ? { referenceMaterial } : {}),
          promptNotes,
          competencyIds: selectedCompetencyIds,
        };
  }

  async function handlePlanLesson(event?: FormEvent) {
    event?.preventDefault();
    if (!validateBuilderBeforeRequest()) return;

    setStatus(null);
    setPlanning(true);
    try {
      const res = await fetch("/api/dlps/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildDlpRequestPayload()),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const planned = (await res.json()) as DlpLessonBlueprint;
      setBlueprint(planned);
      setStatus({
        tone: "success",
        text: planned.lockedToParentSession
          ? `Lesson Blueprint locked to parent DLL Session ${planned.sourceSessionNumber}. Review the inherited plan, then click Approve & Generate DLP.`
          : "Lesson Blueprint ready. Review or tweak objectives, activity, and formative assessment, then click Approve & Generate DLP.",
      });
    } catch (err) {
      setStatus({
        tone: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setPlanning(false);
    }
  }

  function updateBlueprintTitle(title: string) {
    setBlueprint((prev) => (prev ? { ...prev, lessonTitle: title } : prev));
  }

  function updateBlueprintObjectives(learningObjectives: string) {
    setBlueprint((prev) =>
      prev && !prev.lockedToParentSession
        ? { ...prev, learningObjectives }
        : prev,
    );
  }

  function selectBlueprintActivity(activityId: string) {
    setBlueprint((prev) =>
      prev && !prev.lockedToParentSession
        ? { ...prev, selectedActivityId: activityId }
        : prev,
    );
  }

  function selectBlueprintAssessment(assessmentType: FormativeAssessmentType) {
    setBlueprint((prev) =>
      prev && !prev.lockedToParentSession
        ? { ...prev, selectedAssessmentType: assessmentType }
        : prev,
    );
  }

  async function handleApproveAndGenerate() {
    if (!validateBuilderBeforeRequest()) return;

    setStatus(null);
    setGenerating(true);
    try {
      const payload = buildDlpRequestPayload();
      const res = await fetch("/api/dlps/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          ...(blueprint ? { blueprint } : {}),
        }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const created = (await res.json()) as DailyLessonPlan;
      setBlueprint(null);
      setDlps((prev) => [created, ...prev]);
      setSelectedDlpId(created.id);
      setViewMode("edit");
      onRouteChange?.(created.id, "edit");
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

  function selectViewMode(nextMode: ViewMode) {
    setViewMode(nextMode);
    if (selectedDlpId) {
      onRouteChange?.(selectedDlpId, nextMode);
    }
  }

  function startNewDlp() {
    if (onRouteChange && routeLessonId?.trim()) {
      onRouteChange(undefined, undefined);
      return;
    }
    setSelectedDlpId("");
    setViewMode("edit");
    resetCreationForm();
    setStatus(null);
    onRouteChange?.(undefined, undefined);
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
        recentlyDeletedIdRef.current = target.id;
        const remaining = dlps.filter((d) => d.id !== target.id);
        setDlps(remaining);
        setSelectedDlpId("");
        if (onDeletedLesson) {
          onDeletedLesson(target.lessonTitle);
        } else {
          setStatus({
            tone: "success",
            text: `Deleted "${target.lessonTitle}".`,
          });
        }
      },
    );
  }

  const resolvingDeepLink =
    !loadFailed &&
    (routeResolution.kind === "loading" ||
      (routeResolution.kind === "open" &&
        draftDlp?.id !== routeResolution.lessonId));

  return {
    dlps,
    dlls,
    curriculum,
    sections,
    loading: loading || resolvingDeepLink,
    status,
    selectedDlpId,
    setSelectedDlpId,
    startNewDlp,
    draftDlp,
    alignmentCheck,
    isDirty,
    draftLineage,
    viewMode,
    setViewMode: selectViewMode,
    saving,
    builderMode,
    selectBuilderMode,
    deriveDllId,
    setDeriveDllId: selectDeriveDllId,
    deriveSessionNumber,
    setDeriveSessionNumber: selectDeriveSessionNumber,
    lessonTitle,
    setLessonTitle,
    gradeAndSection,
    handleGradeAndSectionChange,
    references,
    setReferences,
    classroomContext,
    periodDraft,
    selectPeriodPreset,
    handlePeriodDraftChange,
    updateFacility,
    updateModality,
    referenceSourceLabel,
    setReferenceSourceLabel,
    referenceText,
    setReferenceText,
    clearReferenceMaterial,
    promptNotes,
    setPromptNotes,
    selectedCompetencyIds,
    blueprint,
    planning,
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
    handlePlanLesson,
    updateBlueprintTitle,
    updateBlueprintObjectives,
    selectBlueprintActivity,
    selectBlueprintAssessment,
    handleApproveAndGenerate,
    updateDraftHeader,
    updateDraftIntentions,
    updateDraftActivity,
    handleSaveEdits,
    requestDeleteDlp,
    confirmDialog,
  };
}
