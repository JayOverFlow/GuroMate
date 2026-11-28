import type {
  CurriculumCompetency,
  GradeLevel,
  TleComponent,
} from "./types";

const GRADE_LEVELS: readonly GradeLevel[] = [7, 8, 9, 10, 11, 12];
const TLE_COMPONENTS: readonly TleComponent[] = [
  "ICT",
  "AFA",
  "FCS",
  "IA",
  "SHS_CORE",
];

export interface GradeCoverageRow {
  gradeLevel: GradeLevel;
  total: number;
  bowCount: number;
  byComponent: Record<TleComponent, number>;
}

export interface ComponentCoverageRow {
  component: TleComponent;
  total: number;
  bowCount: number;
}

export interface CatalogCoverageSummary {
  totalCompetencies: number;
  totalBowCompetencies: number;
  byGrade: GradeCoverageRow[];
  byComponent: ComponentCoverageRow[];
}

function emptyComponentCounts(): Record<TleComponent, number> {
  return {
    ICT: 0,
    AFA: 0,
    FCS: 0,
    IA: 0,
    SHS_CORE: 0,
  };
}

/** Computes read-only Grade 7-12 and component Budget of Work coverage counts from a catalog list. */
export function computeCatalogCoverage(
  items: readonly CurriculumCompetency[],
): CatalogCoverageSummary {
  const gradeMap = new Map<GradeLevel, GradeCoverageRow>(
    GRADE_LEVELS.map((gradeLevel) => [
      gradeLevel,
      {
        gradeLevel,
        total: 0,
        bowCount: 0,
        byComponent: emptyComponentCounts(),
      },
    ]),
  );

  const componentMap = new Map<TleComponent, ComponentCoverageRow>(
    TLE_COMPONENTS.map((component) => [
      component,
      { component, total: 0, bowCount: 0 },
    ]),
  );

  let totalBowCompetencies = 0;

  for (const item of items) {
    const hasBow = Boolean(item.budgetOfWork);
    if (hasBow) totalBowCompetencies += 1;

    const compRow = componentMap.get(item.component);
    if (compRow) {
      compRow.total += 1;
      if (hasBow) compRow.bowCount += 1;
    }

    for (const grade of item.gradeLevels) {
      const gradeRow = gradeMap.get(grade);
      if (!gradeRow) continue;
      gradeRow.total += 1;
      if (hasBow) gradeRow.bowCount += 1;
      if (gradeRow.byComponent[item.component] !== undefined) {
        gradeRow.byComponent[item.component] += 1;
      }
    }
  }

  return {
    totalCompetencies: items.length,
    totalBowCompetencies,
    byGrade: GRADE_LEVELS.map((g) => gradeMap.get(g)!),
    byComponent: TLE_COMPONENTS.map((c) => componentMap.get(c)!),
  };
}
