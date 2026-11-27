import {
  dedupeOrdered,
  formatComponentLabel,
  parseLearningAreaComponents,
} from "../engine/lessonHelpers";
import {
  TLE_COMPONENTS,
  type DailyLessonLog,
  type DailyLessonPlan,
  type GuroMateSettings,
  type SessionNumber,
  type TleComponent,
} from "../engine/types";
import { validateSettingsForm } from "./formValidation";
import type { LessonKind } from "./workspaceRouting";

export type LessonTypeFilter = "all" | LessonKind;
export type LessonLibrarySort = "updated" | "created" | "title";

export interface LessonLibraryFilters {
  type: LessonTypeFilter;
  query: string;
  component: TleComponent | "";
  gradeAndSection: string;
  sort: LessonLibrarySort;
}

export const DEFAULT_LESSON_LIBRARY_FILTERS: LessonLibraryFilters = {
  type: "all",
  query: "",
  component: "",
  gradeAndSection: "",
  sort: "updated",
};

export interface LessonLibraryCounts {
  total: number;
  dlls: number;
  dlps: number;
}

export interface LessonLibraryComponentOption {
  value: TleComponent;
  label: string;
}

export interface LessonLibraryEntryBase {
  kind: LessonKind;
  id: string;
  lessonTitle: string;
  gradeAndSection: string;
  learningAreas: string;
  components: TleComponent[];
  learningCompetencies: string[];
  references: string;
  createdAt: string;
  updatedAt: string;
}

export type DlpDerivationLineage =
  | {
      status: "linked";
      parentDllId: string;
      parentDllTitle: string;
      sessionNumber?: SessionNumber;
    }
  | {
      status: "orphaned";
      sourceDllId: string;
      sessionNumber?: SessionNumber;
    };

export interface LessonLibraryDllEntry extends LessonLibraryEntryBase {
  kind: "dll";
  dll: DailyLessonLog;
  derivedDlpCount: number;
  firstInstructionalSessionNumber: SessionNumber;
  hasInstructionalSession: boolean;
}

export interface LessonLibraryDlpEntry extends LessonLibraryEntryBase {
  kind: "dlp";
  dlp: DailyLessonPlan;
  sourceDllId?: string;
  sourceSessionNumber?: SessionNumber;
  lineage: DlpDerivationLineage | null;
}

export type LessonLibraryEntry =
  | LessonLibraryDllEntry
  | LessonLibraryDlpEntry;

export interface LessonLibraryQueryInput {
  dlls: readonly DailyLessonLog[];
  dlps: readonly DailyLessonPlan[];
  settings?: GuroMateSettings | null;
  filters?: Partial<LessonLibraryFilters>;
}

export interface LessonLibraryQueryResult {
  counts: LessonLibraryCounts;
  entries: LessonLibraryEntry[];
  componentOptions: LessonLibraryComponentOption[];
  gradeSectionOptions: string[];
  hasActiveFilters: boolean;
  needsSetup: boolean;
}

export function extractDllComponents(dll: DailyLessonLog): TleComponent[] {
  const fromSessions = dll.sessions.flatMap((session) => session.components);
  const fromAreas = parseLearningAreaComponents(dll.learningAreas);
  return dedupeOrdered([...fromSessions, ...fromAreas]);
}

export function extractDlpComponents(dlp: DailyLessonPlan): TleComponent[] {
  return parseLearningAreaComponents(dlp.learningAreas);
}

export function findFirstInstructionalSessionNumber(
  dll: Pick<DailyLessonLog, "sessions">,
): SessionNumber {
  const first = dll.sessions.find((session) => session.mode === "instructional");
  return first ? first.sessionNumber : 1;
}

export function countDerivedDlps(
  dllId: string,
  dlps: readonly Pick<DailyLessonPlan, "sourceDllId">[],
): number {
  const targetId = dllId.trim();
  if (!targetId) return 0;
  let count = 0;
  for (const dlp of dlps) {
    if (dlp.sourceDllId?.trim() === targetId) {
      count += 1;
    }
  }
  return count;
}

export function resolveDlpLineage(
  dlp: Pick<DailyLessonPlan, "sourceDllId" | "sourceSessionNumber">,
  dlls: readonly Pick<DailyLessonLog, "id" | "lessonTitle">[],
): DlpDerivationLineage | null {
  const sourceDllId = dlp.sourceDllId?.trim();
  if (!sourceDllId) return null;

  const parent = dlls.find((dll) => dll.id === sourceDllId);
  if (parent) {
    return {
      status: "linked",
      parentDllId: parent.id,
      parentDllTitle: parent.lessonTitle,
      sessionNumber: dlp.sourceSessionNumber,
    };
  }

  return {
    status: "orphaned",
    sourceDllId,
    sessionNumber: dlp.sourceSessionNumber,
  };
}

export function formatOrphanedDlpLabel(
  sessionNumber?: SessionNumber,
): string {
  return sessionNumber !== undefined
    ? `Derived from deleted DLL (Session ${sessionNumber})`
    : "Derived from deleted DLL";
}

function toTimestamp(iso: string): number {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? 0 : time;
}

export function isSettingsSetupIncomplete(
  settings: GuroMateSettings | null | undefined,
): boolean {
  if (!settings) return false;
  return Object.keys(validateSettingsForm(settings, "save")).length > 0;
}

export function clearLessonLibraryFilters(
  filters: LessonLibraryFilters,
): LessonLibraryFilters {
  return {
    ...DEFAULT_LESSON_LIBRARY_FILTERS,
    sort: filters.sort,
  };
}

export function hasActiveLessonLibraryFilters(
  filters: LessonLibraryFilters,
): boolean {
  return (
    filters.type !== "all" ||
    filters.query.trim().length > 0 ||
    filters.component !== "" ||
    filters.gradeAndSection.trim().length > 0
  );
}

function compareEntries(
  a: LessonLibraryEntry,
  b: LessonLibraryEntry,
  sort: LessonLibrarySort,
): number {
  if (sort === "title") {
    const titleDiff = a.lessonTitle.localeCompare(b.lessonTitle, undefined, {
      numeric: true,
      sensitivity: "base",
    });
    if (titleDiff !== 0) return titleDiff;
    const updatedDiff = toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt);
    return updatedDiff !== 0 ? updatedDiff : a.id.localeCompare(b.id);
  }

  if (sort === "created") {
    const createdDiff = toTimestamp(b.createdAt) - toTimestamp(a.createdAt);
    if (createdDiff !== 0) return createdDiff;
  } else {
    const updatedDiff = toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt);
    if (updatedDiff !== 0) return updatedDiff;
  }

  const titleDiff = a.lessonTitle.localeCompare(b.lessonTitle, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  return titleDiff !== 0 ? titleDiff : a.id.localeCompare(b.id);
}

function buildSearchHaystack(entry: LessonLibraryEntry): string {
  const componentTerms = entry.components.flatMap((component) => [
    component,
    formatComponentLabel(component),
  ]);
  return [
    entry.lessonTitle,
    entry.gradeAndSection,
    entry.learningAreas,
    ...componentTerms,
    ...entry.learningCompetencies,
    entry.references,
  ]
    .join("\n")
    .toLowerCase();
}

export function queryLessonLibrary(
  input: LessonLibraryQueryInput,
): LessonLibraryQueryResult {
  const filters: LessonLibraryFilters = {
    ...DEFAULT_LESSON_LIBRARY_FILTERS,
    ...input.filters,
  };

  const derivedCountByDllId = new Map<string, number>();
  for (const dlp of input.dlps) {
    const sourceId = dlp.sourceDllId?.trim();
    if (sourceId) {
      derivedCountByDllId.set(
        sourceId,
        (derivedCountByDllId.get(sourceId) ?? 0) + 1,
      );
    }
  }

  const allEntries: LessonLibraryEntry[] = [
    ...input.dlls.map(
      (dll): LessonLibraryDllEntry => ({
        kind: "dll",
        id: dll.id,
        lessonTitle: dll.lessonTitle,
        gradeAndSection: dll.gradeAndSection,
        learningAreas: dll.learningAreas,
        components: extractDllComponents(dll),
        learningCompetencies: dll.intentions.learningCompetencies,
        references: dll.references,
        createdAt: dll.createdAt,
        updatedAt: dll.updatedAt,
        dll,
        derivedDlpCount: derivedCountByDllId.get(dll.id) ?? 0,
        firstInstructionalSessionNumber:
          findFirstInstructionalSessionNumber(dll),
        hasInstructionalSession: dll.sessions.some(
          (session) => session.mode === "instructional",
        ),
      }),
    ),
    ...input.dlps.map(
      (dlp): LessonLibraryDlpEntry => ({
        kind: "dlp",
        id: dlp.id,
        lessonTitle: dlp.lessonTitle,
        gradeAndSection: dlp.gradeAndSection,
        learningAreas: dlp.learningAreas,
        components: extractDlpComponents(dlp),
        learningCompetencies: dlp.intentions.learningCompetencies,
        references: dlp.references,
        createdAt: dlp.createdAt,
        updatedAt: dlp.updatedAt,
        dlp,
        sourceDllId: dlp.sourceDllId,
        sourceSessionNumber: dlp.sourceSessionNumber,
        lineage: resolveDlpLineage(dlp, input.dlls),
      }),
    ),
  ];

  const normalizedQuery = filters.query.trim().toLowerCase();
  const selectedGradeSection = filters.gradeAndSection.trim();

  const filteredEntries = allEntries.filter((entry) => {
    if (filters.type !== "all" && entry.kind !== filters.type) {
      return false;
    }
    if (
      filters.component !== "" &&
      !entry.components.includes(filters.component)
    ) {
      return false;
    }
    if (
      selectedGradeSection &&
      entry.gradeAndSection.trim() !== selectedGradeSection
    ) {
      return false;
    }
    if (normalizedQuery) {
      const haystack = buildSearchHaystack(entry);
      if (!haystack.includes(normalizedQuery)) {
        return false;
      }
    }
    return true;
  });

  const entries = [...filteredEntries].sort((a, b) =>
    compareEntries(a, b, filters.sort),
  );

  const presentComponents = new Set<TleComponent>();
  const presentGradeSections = new Set<string>();
  for (const entry of allEntries) {
    for (const c of entry.components) {
      presentComponents.add(c);
    }
    const trimmedGradeSection = entry.gradeAndSection.trim();
    if (trimmedGradeSection) {
      presentGradeSections.add(trimmedGradeSection);
    }
  }
  const componentOptions: LessonLibraryComponentOption[] = TLE_COMPONENTS.filter(
    (c) => presentComponents.has(c),
  ).map((value) => ({
    value,
    label: formatComponentLabel(value),
  }));
  const gradeSectionOptions = [...presentGradeSections].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );

  return {
    counts: {
      total: input.dlls.length + input.dlps.length,
      dlls: input.dlls.length,
      dlps: input.dlps.length,
    },
    entries,
    componentOptions,
    gradeSectionOptions,
    hasActiveFilters: hasActiveLessonLibraryFilters(filters),
    needsSetup: isSettingsSetupIncomplete(input.settings),
  };
}
