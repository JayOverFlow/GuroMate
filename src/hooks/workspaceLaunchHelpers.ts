import {
  SESSION_NUMBERS,
  type DllSessionConfig,
  type SessionNumber,
} from "../engine/types";

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
