import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { evaluateDllAlignment } from "../engine/alignmentCheck";
import { DEFAULT_CLASSROOM_CONTEXT } from "../engine/lessonHelpers";
import {
  type ClassSection,
  type ClassroomContext,
  type ClassroomFacility,
  type CurriculumCompetency,
  type DailyLessonLog,
  type DailyLessonPlan,
  type DeliveryModality,
  type DllIntentions,
  type DllLessonBlueprint,
  type DllSessionConfig,
  type FormativeAssessmentType,
  type SessionNumber,
  type TleComponent,
} from "../engine/types";
import {
  DLL_BUILDER_FIELDS,
  parseDllSessionFieldKey,
  parsePeriodMinutes,
  updateFieldError,
  validateDllBuilderField,
  validateDllBuilderForm,
  type DllBuilderFieldKey,
  type FieldErrors,
} from "../utils/formValidation";
import { countDerivedDlps } from "../utils/lessonLibraryQuery";
import { readErrorMessage } from "../workspaces/lessonViewHelpers";
import {
  applyDllLaunchTarget,
  createFreshDllCreationFormState,
  createInitialDllSessionConfigs,
  isDllDraftDirty,
  resolveLessonRouteSelection,
  shouldResetCreationFormOnRouteChange,
  type DllLaunchTarget,
} from "./workspaceLaunchHelpers";

export type { DllLaunchTarget };

export type ViewMode = "edit" | "markdown";

export interface UseDllWorkspaceOptions {
  initialLaunchTarget?: DllLaunchTarget | null;
  onConsumeLaunchTarget?: () => void;
  routeLessonId?: string;
  routeViewMode?: ViewMode;
  onRouteChange?: (lessonId?: string, viewMode?: ViewMode) => void;
  onMissingLesson?: (lessonId: string) => void;
  onDeletedLesson?: (lessonTitle: string) => void;
  onDirtyChange?: (isDirty: boolean, lessonLabel?: string) => void;
}

export interface DllStatusState {
  tone: "success" | "error";
  text: string;
}

export type SessionTextFieldKey =
  | "learningObjectives"
  | "preLesson"
  | "lessonFlow"
  | "learningResources"
  | "integrationAndContextualization"
  | "formativeAssessment"
  | "extendedLearningOpportunities"
  | "reflections";

export const SESSION_ILAW_FIELDS: ReadonlyArray<{
  key: SessionTextFieldKey;
  label: string;
  section: string;
  rows?: number;
}> = [
  {
    key: "learningObjectives",
    label: "Learning Objectives",
    section: "I. Intentions",
    rows: 2,
  },
  {
    key: "preLesson",
    label: "Pre-Lesson",
    section: "II. Learning Experience",
    rows: 2,
  },
  {
    key: "lessonFlow",
    label: "Lesson Flow",
    section: "II. Learning Experience",
    rows: 3,
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
    rows: 2,
  },
  {
    key: "extendedLearningOpportunities",
    label: "Extended Learning Opportunities",
    section: "IV. Ways Forward",
    rows: 2,
  },
  {
    key: "reflections",
    label: "Reflections (left blank on .docx export)",
    section: "IV. Ways Forward",
    rows: 2,
  },
];

export const INTENTIONS_LIST_FIELDS: ReadonlyArray<{
  key: Exclude<keyof DllIntentions, "learnerContext">;
  label: string;
}> = [
  { key: "learningCompetencies", label: "Learning Competencies (one per line)" },
  { key: "contentStandards", label: "Content Standards (one per line)" },
  { key: "performanceStandards", label: "Performance Standards (one per line)" },
];

export function useDllWorkspace(options: UseDllWorkspaceOptions = {}) {
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
  const [dlls, setDlls] = useState<DailyLessonLog[]>([]);
  const [dlps, setDlps] = useState<DailyLessonPlan[]>([]);
  const [curriculum, setCurriculum] = useState<CurriculumCompetency[]>([]);
  const [sections, setSections] = useState<ClassSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [status, setStatus] = useState<DllStatusState | null>(null);

  const [selectedDllId, setSelectedDllId] = useState<string>("");
  const [draftDll, setDraftDll] = useState<DailyLessonLog | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(routeViewMode ?? "edit");
  const [saving, setSaving] = useState(false);

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
  const [sessionConfigs, setSessionConfigs] = useState<DllSessionConfig[]>(
    createInitialDllSessionConfigs,
  );
  const [blueprint, setBlueprint] = useState<DllLessonBlueprint | null>(null);
  const [planning, setPlanning] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pickedCompetencyId, setPickedCompetencyId] = useState("");
  const [fieldErrors, setFieldErrors] = useState<
    FieldErrors<DllBuilderFieldKey>
  >({});
  const [focusRequest, setFocusRequest] = useState<{
    field: DllBuilderFieldKey;
    seq: number;
  } | null>(null);
  const gradeSectionRef = useRef<HTMLInputElement>(null);
  const periodMinutesRef = useRef<HTMLInputElement>(null);
  const sessionCardRefs = useRef<
    Partial<Record<SessionNumber, HTMLElement | null>>
  >({});
  const sessionsGroupRef = useRef<HTMLDivElement>(null);
  const interactedFieldsRef = useRef<Set<DllBuilderFieldKey>>(new Set());
  const recentlyDeletedIdRef = useRef<string | null>(null);
  const reportedMissingIdRef = useRef<string | null>(null);
  const prevRouteLessonIdRef = useRef<string | undefined>(routeLessonId);
  const sectionsRef = useRef<ClassSection[]>(sections);
  sectionsRef.current = sections;

  const resetCreationForm = useCallback((launchTarget?: DllLaunchTarget | null) => {
    const fresh = createFreshDllCreationFormState(
      sectionsRef.current,
      launchTarget,
    );
    setLessonTitle(fresh.lessonTitle);
    setGradeAndSection(fresh.gradeAndSection);
    setReferences(fresh.references);
    setClassroomContext(fresh.classroomContext);
    setPeriodDraft(String(fresh.classroomContext.periodMinutes));
    setReferenceSourceLabel(fresh.referenceSourceLabel);
    setReferenceText(fresh.referenceText);
    setPromptNotes(fresh.promptNotes);
    setSessionConfigs(fresh.sessionConfigs);
    setBlueprint(null);
    setPickedCompetencyId(fresh.pickedCompetencyId);
    interactedFieldsRef.current.clear();
    setFieldErrors({});
  }, []);

  const loadWorkspaceData = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const [dllRes, dlpRes, currRes, secRes] = await Promise.all([
        fetch("/api/dlls"),
        fetch("/api/dlps"),
        fetch("/api/curriculum"),
        fetch("/api/class-sections"),
      ]);
      if (!dllRes.ok) throw new Error(await readErrorMessage(dllRes));
      if (!dlpRes.ok) throw new Error(await readErrorMessage(dlpRes));
      if (!currRes.ok) throw new Error(await readErrorMessage(currRes));
      if (!secRes.ok) throw new Error(await readErrorMessage(secRes));

      const loadedDlls = (await dllRes.json()) as DailyLessonLog[];
      const loadedDlps = (await dlpRes.json()) as DailyLessonPlan[];
      const loadedCurr = (await currRes.json()) as CurriculumCompetency[];
      const loadedSec = (await secRes.json()) as ClassSection[];

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
    setSelectedDllId("");
    setViewMode("edit");
    setSessionConfigs((prev) => applyDllLaunchTarget(prev, initialLaunchTarget));
    setBlueprint(null);
    interactedFieldsRef.current.clear();
    setFieldErrors({});
    const trimmed = initialLaunchTarget.competencyId.trim();
    if (trimmed) setPickedCompetencyId(trimmed);
    onConsumeLaunchTarget?.();
  }, [initialLaunchTarget, onConsumeLaunchTarget]);

  const routeResolution = useMemo(
    () =>
      resolveLessonRouteSelection(
        routeLessonId,
        routeViewMode,
        dlls.map((d) => d.id),
        loading,
      ),
    [routeLessonId, routeViewMode, dlls, loading],
  );

  useEffect(() => {
    if (routeResolution.kind === "loading") return;
    const prevRouteLessonId = prevRouteLessonIdRef.current;
    prevRouteLessonIdRef.current = routeLessonId;

    if (routeResolution.kind === "create") {
      reportedMissingIdRef.current = null;
      setSelectedDllId("");
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
      setSelectedDllId(routeResolution.lessonId);
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

  const savedDll = useMemo(
    () => dlls.find((d) => d.id === selectedDllId) ?? null,
    [dlls, selectedDllId],
  );

  useEffect(() => {
    setDraftDll(savedDll ? structuredClone(savedDll) : null);
    interactedFieldsRef.current.clear();
    setFieldErrors({});
  }, [savedDll]);

  const isDirty = useMemo(
    () => isDllDraftDirty(savedDll, draftDll),
    [savedDll, draftDll],
  );

  const derivedDlpCount = useMemo(
    () => (draftDll ? countDerivedDlps(draftDll.id, dlps) : 0),
    [draftDll, dlps],
  );

  const alignmentCheck = useMemo(() => {
    if (!savedDll) return null;
    return savedDll.alignmentCheck ?? evaluateDllAlignment(savedDll);
  }, [savedDll]);

  useEffect(() => {
    onDirtyChange?.(isDirty, draftDll?.lessonTitle);
  }, [isDirty, draftDll?.lessonTitle, onDirtyChange]);

  useEffect(() => {
    return () => {
      onDirtyChange?.(false);
    };
  }, [onDirtyChange]);

  useEffect(() => {
    if (!focusRequest) return;
    const { field } = focusRequest;
    if (field === "gradeAndSection") {
      gradeSectionRef.current?.focus();
    } else if (field === "periodMinutes") {
      periodMinutesRef.current?.focus();
    } else if (field === "sessions") {
      sessionsGroupRef.current?.focus();
    } else {
      const sessionNumber = parseDllSessionFieldKey(field);
      if (sessionNumber !== null) {
        sessionCardRefs.current[sessionNumber]?.focus();
      }
    }
  }, [focusRequest]);

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

  function updateGradeAndSection(value: string) {
    interactedFieldsRef.current.add("gradeAndSection");
    setGradeAndSection(value);
    setFieldErrors((prev) => {
      if (!prev.gradeAndSection) return prev;
      const nextMsg = validateDllBuilderField("gradeAndSection", {
        gradeAndSection: value,
        sessions: sessionConfigs,
      });
      return updateFieldError(prev, "gradeAndSection", nextMsg);
    });
  }

  function validateGradeAndSectionOnBlur() {
    if (
      !interactedFieldsRef.current.has("gradeAndSection") &&
      !fieldErrors.gradeAndSection
    ) {
      return;
    }
    const nextMsg = validateDllBuilderField("gradeAndSection", {
      gradeAndSection,
      sessions: sessionConfigs,
    });
    setFieldErrors((prev) =>
      updateFieldError(prev, "gradeAndSection", nextMsg),
    );
  }

  function selectPeriodPreset(minutes: number) {
    setPeriodDraft(String(minutes));
    setClassroomContext((prev) => ({ ...prev, periodMinutes: minutes }));
    setFieldErrors((prev) => updateFieldError(prev, "periodMinutes", undefined));
  }

  function updatePeriodDraft(value: string) {
    interactedFieldsRef.current.add("periodMinutes");
    setPeriodDraft(value);
    const parsed = parsePeriodMinutes(value);
    if (parsed !== null) {
      setClassroomContext((prev) => ({ ...prev, periodMinutes: parsed }));
    }
    setFieldErrors((prev) => {
      if (!prev.periodMinutes) return prev;
      const nextMsg = validateDllBuilderField("periodMinutes", {
        gradeAndSection,
        periodMinutes: value,
        sessions: sessionConfigs,
      });
      return updateFieldError(prev, "periodMinutes", nextMsg);
    });
  }

  function validatePeriodDraftOnBlur() {
    if (
      !interactedFieldsRef.current.has("periodMinutes") &&
      !fieldErrors.periodMinutes
    ) {
      return;
    }
    const nextMsg = validateDllBuilderField("periodMinutes", {
      gradeAndSection,
      periodMinutes: periodDraft,
      sessions: sessionConfigs,
    });
    setFieldErrors((prev) =>
      updateFieldError(prev, "periodMinutes", nextMsg),
    );
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

  function syncActiveSessionErrors(nextSessions: DllSessionConfig[]) {
    setFieldErrors((prev) => {
      let next = prev;
      for (const field of DLL_BUILDER_FIELDS) {
        if (field === "gradeAndSection" || field === "periodMinutes" || !next[field]) {
          continue;
        }
        const nextMsg = validateDllBuilderField(field, {
          gradeAndSection,
          periodMinutes: periodDraft,
          sessions: nextSessions,
        });
        next = updateFieldError(next, field, nextMsg);
      }
      return next;
    });
  }

  function assignCompetencyToSessions(
    targetSessions: SessionNumber[],
    competencyId: string,
  ) {
    if (!competencyId) return;
    const targetSet = new Set(targetSessions);
    const nextSessions = sessionConfigs.map((cfg) => {
      if (!targetSet.has(cfg.sessionNumber)) return cfg;
      const nextIds = cfg.competencyIds.includes(competencyId)
        ? cfg.competencyIds
        : [...cfg.competencyIds, competencyId];
      return {
        ...cfg,
        mode: "instructional" as const,
        competencyIds: nextIds,
      };
    });
    setSessionConfigs(nextSessions);
    syncActiveSessionErrors(nextSessions);
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
    const nextSessions = sessionConfigs.map((cfg) =>
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
    );
    setSessionConfigs(nextSessions);
    syncActiveSessionErrors(nextSessions);
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

  function validateBuilderBeforeRequest(): boolean {
    for (const field of DLL_BUILDER_FIELDS) {
      interactedFieldsRef.current.add(field);
    }
    const errors = validateDllBuilderForm({
      gradeAndSection,
      periodMinutes: periodDraft,
      sessions: sessionConfigs,
    });
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setStatus(null);
      const firstInvalid = DLL_BUILDER_FIELDS.find((field) =>
        Boolean(errors[field]),
      );
      if (firstInvalid) {
        setFocusRequest((prev) => ({
          field: firstInvalid,
          seq: (prev?.seq ?? 0) + 1,
        }));
      }
      return false;
    }
    interactedFieldsRef.current.clear();
    setFieldErrors({});
    return true;
  }

  function buildPlanRequestPayload() {
    const resolvedPeriod =
      parsePeriodMinutes(periodDraft) ?? classroomContext.periodMinutes;
    return {
      lessonTitle,
      gradeAndSection,
      references,
      classroomContext: {
        ...classroomContext,
        periodMinutes: resolvedPeriod,
      },
      ...(referenceText.trim()
        ? {
            referenceMaterial: {
              ...(referenceSourceLabel.trim()
                ? { sourceLabel: referenceSourceLabel.trim() }
                : {}),
              text: referenceText,
            },
          }
        : {}),
      promptNotes,
      sessions: sessionConfigs,
    };
  }

  async function handlePlanLesson(event?: FormEvent) {
    event?.preventDefault();
    if (!validateBuilderBeforeRequest()) return;

    setStatus(null);
    setPlanning(true);
    try {
      const res = await fetch("/api/dlls/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPlanRequestPayload()),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const planned = (await res.json()) as DllLessonBlueprint;
      setBlueprint(planned);
      setStatus({
        tone: "success",
        text: "Lesson Blueprint ready. Review or tweak objectives, activities, and formative assessments, then click Approve & Generate DLL.",
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

  function updateBlueprintSessionObjectives(
    sessionNumber: SessionNumber,
    learningObjectives: string,
  ) {
    setBlueprint((prev) => {
      if (!prev) return prev;
      const nextSessions = prev.sessions.map((session) =>
        session.sessionNumber === sessionNumber
          ? { ...session, learningObjectives }
          : session,
      ) as DllLessonBlueprint["sessions"];
      return { ...prev, sessions: nextSessions };
    });
  }

  function selectBlueprintActivity(
    sessionNumber: SessionNumber,
    activityId: string,
  ) {
    setBlueprint((prev) => {
      if (!prev) return prev;
      const nextSessions = prev.sessions.map((session) =>
        session.sessionNumber === sessionNumber
          ? { ...session, selectedActivityId: activityId }
          : session,
      ) as DllLessonBlueprint["sessions"];
      return { ...prev, sessions: nextSessions };
    });
  }

  function selectBlueprintAssessment(
    sessionNumber: SessionNumber,
    assessmentType: FormativeAssessmentType,
  ) {
    setBlueprint((prev) => {
      if (!prev) return prev;
      const nextSessions = prev.sessions.map((session) =>
        session.sessionNumber === sessionNumber
          ? { ...session, selectedAssessmentType: assessmentType }
          : session,
      ) as DllLessonBlueprint["sessions"];
      return { ...prev, sessions: nextSessions };
    });
  }

  async function handleApproveAndGenerate() {
    if (!validateBuilderBeforeRequest()) return;

    setStatus(null);
    setGenerating(true);
    try {
      const payload = buildPlanRequestPayload();
      const res = await fetch("/api/dlls/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          ...(blueprint ? { blueprint } : {}),
        }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const created = (await res.json()) as DailyLessonLog;
      setBlueprint(null);
      setDlls((prev) => [created, ...prev]);
      setSelectedDllId(created.id);
      setViewMode("edit");
      onRouteChange?.(created.id, "edit");
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

  function selectViewMode(nextMode: ViewMode) {
    setViewMode(nextMode);
    if (selectedDllId) {
      onRouteChange?.(selectedDllId, nextMode);
    }
  }

  function startNewDll() {
    if (onRouteChange && routeLessonId?.trim()) {
      onRouteChange(undefined, undefined);
      return;
    }
    setSelectedDllId("");
    setViewMode("edit");
    resetCreationForm();
    setStatus(null);
    onRouteChange?.(undefined, undefined);
  }

  async function handleDeleteDll(targetDll?: DailyLessonLog) {
    const target = targetDll ?? draftDll;
    if (!target) return;
    setStatus(null);
    const res = await fetch(`/api/dlls/${encodeURIComponent(target.id)}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(await readErrorMessage(res));
    recentlyDeletedIdRef.current = target.id;
    const remaining = dlls.filter((d) => d.id !== target.id);
    setDlls(remaining);
    setSelectedDllId("");
    if (onDeletedLesson) {
      onDeletedLesson(target.lessonTitle);
    } else {
      setStatus({
        tone: "success",
        text: `Deleted "${target.lessonTitle}".`,
      });
    }
  }

  const resolvingDeepLink =
    !loadFailed &&
    (routeResolution.kind === "loading" ||
      (routeResolution.kind === "open" &&
        draftDll?.id !== routeResolution.lessonId));

  return {
    dlls,
    curriculum,
    sections,
    loading: loading || resolvingDeepLink,
    status,
    selectedDllId,
    setSelectedDllId,
    startNewDll,
    draftDll,
    alignmentCheck,
    isDirty,
    derivedDlpCount,
    viewMode,
    setViewMode: selectViewMode,
    saving,
    lessonTitle,
    setLessonTitle,
    gradeAndSection,
    setGradeAndSection: updateGradeAndSection,
    validateGradeAndSectionOnBlur,
    fieldErrors,
    gradeSectionRef,
    periodMinutesRef,
    sessionCardRefs,
    sessionsGroupRef,
    references,
    setReferences,
    classroomContext,
    periodDraft,
    selectPeriodPreset,
    updatePeriodDraft,
    validatePeriodDraftOnBlur,
    updateFacility,
    updateModality,
    referenceSourceLabel,
    setReferenceSourceLabel,
    referenceText,
    setReferenceText,
    clearReferenceMaterial,
    promptNotes,
    setPromptNotes,
    sessionConfigs,
    blueprint,
    planning,
    generating,
    pickedCompetencyId,
    setPickedCompetencyId,
    competencyMap,
    previewLearningAreas,
    assignCompetencyToSessions,
    removeCompetencyFromSession,
    updateSessionMode,
    updateNonInstructionalReason,
    handlePlanLesson,
    updateBlueprintTitle,
    updateBlueprintSessionObjectives,
    selectBlueprintActivity,
    selectBlueprintAssessment,
    handleApproveAndGenerate,
    updateDraftHeader,
    updateDraftSessionField,
    handleSaveEdits,
    handleDeleteDll,
  };
}
