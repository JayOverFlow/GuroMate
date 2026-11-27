import {
  SESSION_NUMBERS,
  type DailyLessonLog,
  type DailyLessonPlan,
  type DllSessionConfig,
  type SessionNumber,
} from "../engine/types";
import type { AppRoute, LessonViewMode } from "../utils/workspaceRouting";

export type LessonRouteResolution =
  | { kind: "create" }
  | { kind: "loading" }
  | { kind: "open"; lessonId: string; viewMode: LessonViewMode }
  | { kind: "missing"; lessonId: string };

export interface DllLaunchTarget {
  competencyId: string;
}

export type DlpLaunchTarget =
  | { mode: "derive"; dllId: string; sessionNumber: SessionNumber }
  | { mode: "scratch"; competencyId: string };

export interface DlpLaunchState {
  selectedDlpId: string;
  builderMode: "scratch" | "derive";
  deriveDllId: string;
  deriveSessionNumber: SessionNumber;
  selectedCompetencyIds: string[];
  pickedCompetencyId: string;
}

export type QuizLaunchTarget =
  | { sourceKind: "dll"; dllId: string; sessionNumber: SessionNumber }
  | { sourceKind: "dlp"; dlpId: string }
  | { sourceKind: "standalone"; competencyId: string };

export interface QuizLaunchState {
  selectedQuizId: string;
  sourceKind: "standalone" | "dll" | "dlp";
  selectedDllId: string;
  selectedSessionNumber: SessionNumber;
  selectedDlpId: string;
  selectedCompetencyIds: string[];
  pickedCompetencyId: string;
}

export function createInitialDllSessionConfigs(): DllSessionConfig[] {
  return SESSION_NUMBERS.map((sessionNumber) => ({
    sessionNumber,
    mode: "instructional",
    competencyIds: [],
    nonInstructionalReason: "",
  }));
}

export function applyDllLaunchTarget(
  sessionConfigs: ReadonlyArray<DllSessionConfig>,
  target: DllLaunchTarget,
): DllSessionConfig[] {
  const competencyId = target.competencyId.trim();
  if (!competencyId) return [...sessionConfigs];

  return sessionConfigs.map((cfg) => {
    if (cfg.sessionNumber !== 1) return cfg;
    const nextIds = cfg.competencyIds.includes(competencyId)
      ? cfg.competencyIds
      : [...cfg.competencyIds, competencyId];
    return {
      ...cfg,
      mode: "instructional",
      competencyIds: nextIds,
    };
  });
}

export function appendUniqueId(
  ids: ReadonlyArray<string>,
  id: string,
): string[] {
  const trimmed = id.trim();
  if (!trimmed) return [...ids];
  return ids.includes(trimmed) ? [...ids] : [...ids, trimmed];
}

export function applyDlpLaunchTarget(
  state: DlpLaunchState,
  target: DlpLaunchTarget,
): DlpLaunchState {
  if (target.mode === "derive") {
    return {
      ...state,
      selectedDlpId: "",
      builderMode: "derive",
      deriveDllId: target.dllId,
      deriveSessionNumber: target.sessionNumber,
    };
  }

  const competencyId = target.competencyId.trim();
  return {
    ...state,
    selectedDlpId: "",
    builderMode: "scratch",
    selectedCompetencyIds: appendUniqueId(
      state.selectedCompetencyIds,
      competencyId,
    ),
    pickedCompetencyId: competencyId || state.pickedCompetencyId,
  };
}

export function applyQuizLaunchTarget(
  state: QuizLaunchState,
  target: QuizLaunchTarget,
): QuizLaunchState {
  if (target.sourceKind === "dll") {
    return {
      ...state,
      selectedQuizId: "",
      sourceKind: "dll",
      selectedDllId: target.dllId,
      selectedSessionNumber: target.sessionNumber,
    };
  }

  if (target.sourceKind === "dlp") {
    return {
      ...state,
      selectedQuizId: "",
      sourceKind: "dlp",
      selectedDlpId: target.dlpId,
    };
  }

  const competencyId = target.competencyId.trim();
  return {
    ...state,
    selectedQuizId: "",
    sourceKind: "standalone",
    selectedCompetencyIds: appendUniqueId(
      state.selectedCompetencyIds,
      competencyId,
    ),
    pickedCompetencyId: competencyId || state.pickedCompetencyId,
  };
}

export function resolveLessonRouteSelection(
  routeLessonId: string | undefined,
  routeViewMode: LessonViewMode | undefined,
  savedIds: ReadonlyArray<string>,
  loading: boolean,
): LessonRouteResolution {
  const id = routeLessonId?.trim();
  if (!id) {
    return { kind: "create" };
  }
  if (savedIds.includes(id)) {
    return {
      kind: "open",
      lessonId: id,
      viewMode: routeViewMode === "markdown" ? "markdown" : "edit",
    };
  }
  if (loading) {
    return { kind: "loading" };
  }
  return { kind: "missing", lessonId: id };
}

function serializeDllEditableState(dll: DailyLessonLog): string {
  return JSON.stringify({
    lessonTitle: dll.lessonTitle,
    learningAreas: dll.learningAreas,
    gradeAndSection: dll.gradeAndSection,
    references: dll.references,
    promptNotes: dll.promptNotes,
    intentions: {
      learningCompetencies: dll.intentions.learningCompetencies,
      contentStandards: dll.intentions.contentStandards,
      performanceStandards: dll.intentions.performanceStandards,
      learnerContext: dll.intentions.learnerContext,
    },
    sessions: dll.sessions.map((session) => ({
      sessionNumber: session.sessionNumber,
      mode: session.mode,
      competencyIds: session.competencyIds,
      components: session.components,
      nonInstructionalReason: session.nonInstructionalReason ?? "",
      learningObjectives: session.learningObjectives,
      preLesson: session.preLesson,
      lessonFlow: session.lessonFlow,
      learningResources: session.learningResources,
      integrationAndContextualization: session.integrationAndContextualization,
      formativeAssessment: session.formativeAssessment,
      extendedLearningOpportunities: session.extendedLearningOpportunities,
      reflections: session.reflections,
    })),
  });
}

export function isDllDraftDirty(
  saved: DailyLessonLog | null,
  draft: DailyLessonLog | null,
): boolean {
  if (!saved || !draft || saved.id !== draft.id) return false;
  return serializeDllEditableState(saved) !== serializeDllEditableState(draft);
}

function serializeDlpEditableState(dlp: DailyLessonPlan): string {
  return JSON.stringify({
    lessonTitle: dlp.lessonTitle,
    learningAreas: dlp.learningAreas,
    gradeAndSection: dlp.gradeAndSection,
    references: dlp.references,
    promptNotes: dlp.promptNotes,
    intentions: {
      learningCompetencies: dlp.intentions.learningCompetencies,
      contentStandards: dlp.intentions.contentStandards,
      performanceStandards: dlp.intentions.performanceStandards,
      learningObjectives: dlp.intentions.learningObjectives,
      learnerContext: dlp.intentions.learnerContext,
    },
    preLesson: dlp.preLesson,
    lessonFlow: dlp.lessonFlow,
    learningResources: dlp.learningResources,
    integrationAndContextualization: dlp.integrationAndContextualization,
    formativeAssessment: dlp.formativeAssessment,
    extendedLearningOpportunities: dlp.extendedLearningOpportunities,
    reflections: dlp.reflections,
  });
}

export function isDlpDraftDirty(
  saved: DailyLessonPlan | null,
  draft: DailyLessonPlan | null,
): boolean {
  if (!saved || !draft || saved.id !== draft.id) return false;
  return serializeDlpEditableState(saved) !== serializeDlpEditableState(draft);
}

export function isLeavingActiveLesson(
  current: AppRoute,
  next: AppRoute,
): boolean {
  if (current.workspace !== "dll" && current.workspace !== "dlp") {
    return false;
  }
  const currentId = current.lessonId?.trim();
  if (!currentId) return false;

  if (next.workspace === current.workspace && next.lessonId?.trim() === currentId) {
    return false;
  }
  return true;
}
