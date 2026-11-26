import type {
  BowTerm,
  BudgetOfWorkInfo,
  CurriculumCompetency,
  GradeLevel,
  QuarterNumber,
  TleComponent,
} from "../engine/types";
import { COMPONENT_SHORT_LABELS } from "../hooks/useCurriculumWorkspace";

export interface CompetencyPickerFilterState {
  grade: GradeLevel | "";
  quarter: QuarterNumber | "";
  component: TleComponent | "";
  sector: string;
  bowTerm: BowTerm | "";
  bowOnly: boolean;
  query: string;
}

export const DEFAULT_PICKER_FILTERS: CompetencyPickerFilterState = {
  grade: "",
  quarter: "",
  component: "",
  sector: "",
  bowTerm: "",
  bowOnly: false,
  query: "",
};

export function filterPickerCompetencies(
  curriculum: readonly CurriculumCompetency[],
  filters: CompetencyPickerFilterState,
): CurriculumCompetency[] {
  const q = filters.query.trim().toLowerCase();
  return curriculum.filter((item) => {
    if (filters.grade !== "" && !item.gradeLevels.includes(filters.grade)) {
      return false;
    }
    if (filters.quarter !== "" && !item.quarters.includes(filters.quarter)) {
      return false;
    }
    if (filters.component !== "" && item.component !== filters.component) {
      return false;
    }
    if (filters.sector !== "" && item.sector !== filters.sector) {
      return false;
    }
    if (filters.bowTerm !== "" && item.budgetOfWork?.term !== filters.bowTerm) {
      return false;
    }
    if (filters.bowOnly && !item.budgetOfWork) {
      return false;
    }
    if (q) {
      const haystack = [
        item.learningCompetency,
        item.contentTopic,
        ...item.contentSubTopics,
        item.sector ?? "",
        item.sectorDescription ?? "",
        item.budgetOfWork?.term ?? "",
        item.budgetOfWork?.weekRange ?? "",
        item.budgetOfWork?.sourceDocument ?? "",
        item.customNotes ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export function listAvailableSectors(
  curriculum: readonly CurriculumCompetency[],
  scope: { grade: GradeLevel | ""; component: TleComponent | "" },
): string[] {
  const sectors = new Set<string>();
  for (const item of curriculum) {
    if (!item.sector) continue;
    if (scope.grade !== "" && !item.gradeLevels.includes(scope.grade)) continue;
    if (scope.component !== "" && item.component !== scope.component) continue;
    sectors.add(item.sector);
  }
  return [...sectors].sort();
}

export function formatBowIndicator(
  bow: BudgetOfWorkInfo | undefined,
): string | null {
  if (!bow) return null;
  const parts = ["BoW"];
  const term = bow.term.trim();
  const weekRange = bow.weekRange.trim();
  if (term) parts.push(term);
  if (weekRange) parts.push(`Wk ${weekRange}`);
  return parts.join(" · ");
}

export function formatCompetencyOptionLabel(
  item: CurriculumCompetency,
): string {
  const componentLabel = COMPONENT_SHORT_LABELS[item.component];
  const bowIndicator = formatBowIndicator(item.budgetOfWork);
  const bowPrefix = bowIndicator ? ` [${bowIndicator}]` : "";
  return `[${componentLabel}]${bowPrefix} ${item.contentTopic} — ${item.learningCompetency}`;
}
