import { describe, expect, it } from "vitest";
import type { CurriculumCompetency } from "../engine/types";
import {
  DEFAULT_PICKER_FILTERS,
  filterPickerCompetencies,
  formatBowIndicator,
  formatCompetencyOptionLabel,
  listAvailableSectors,
} from "./competencyPickerFilters";

function makeCompetency(
  overrides: Partial<CurriculumCompetency> &
    Pick<CurriculumCompetency, "id" | "gradeLevels" | "component">,
): CurriculumCompetency {
  return {
    source: "built-in",
    quarters: [1],
    quarterLabel: "Quarter I",
    sector: null,
    sectorDescription: null,
    contentTopic: "Sample Topic",
    contentSubTopics: [],
    contentStandard: "Sample CS",
    performanceStandard: "Sample PS",
    competencyNumber: 1,
    learningCompetency: "Sample competency",
    ...overrides,
  };
}

const SAMPLE_CATALOG: CurriculumCompetency[] = [
  makeCompetency({
    id: "g7-ict-bow",
    gradeLevels: [7],
    quarters: [1],
    component: "ICT",
    sector: null,
    contentTopic: "Sectors of ICT",
    learningCompetency: "Analyze ICT career opportunities",
    budgetOfWork: {
      term: "First Term",
      weekRange: "1 to 2",
      suggestedActivities: "Career mapping workshop",
      suggestedPerformanceTasks: "ICT career portfolio",
      sourceDocument: "TLE 7 BoW.pdf",
    },
  }),
  makeCompetency({
    id: "g9-10-afa-cg",
    gradeLevels: [9, 10],
    quarters: [2],
    component: "AFA",
    sector: "ANIMAL PRODUCTION",
    contentTopic: "Poultry Housing",
    learningCompetency: "Prepare poultry housing facilities",
  }),
  makeCompetency({
    id: "g11-shs-bow",
    gradeLevels: [11],
    quarters: [1],
    component: "SHS_CORE",
    sector: "General Mathematics",
    contentTopic: "Functions",
    learningCompetency: "Represent real-life situations using functions",
    budgetOfWork: {
      term: "One-Term",
      weekRange: "1 to 3",
      suggestedActivities: "Real-world modeling exercises",
      suggestedPerformanceTasks: "Budget function project",
      sourceDocument: "SHS Core GenMath BoW.pdf",
    },
  }),
  makeCompetency({
    id: "g12-ia-bow",
    gradeLevels: [12],
    quarters: [3],
    component: "IA",
    sector: "Automotive Servicing",
    sectorDescription: "Industrial Technologies",
    contentTopic: "Engine Diagnostics",
    learningCompetency: "Perform basic engine diagnostics",
    budgetOfWork: {
      term: "Third Term",
      weekRange: "4 to 5",
      suggestedActivities: "Shop diagnostic checklist",
      suggestedPerformanceTasks: "Engine inspection report",
      sourceDocument: "G12 TechPro IA BoW.pdf",
    },
  }),
];

describe("filterPickerCompetencies", () => {
  it("returns all competencies when no filters are active", () => {
    expect(
      filterPickerCompetencies(SAMPLE_CATALOG, DEFAULT_PICKER_FILTERS).map(
        (c) => c.id,
      ),
    ).toEqual(["g7-ict-bow", "g9-10-afa-cg", "g11-shs-bow", "g12-ia-bow"]);
  });

  it("filters by Grade (7-12), Component (including SHS_CORE), Sector, Quarter, BoW term, BoW only, and search query", () => {
    expect(
      filterPickerCompetencies(SAMPLE_CATALOG, {
        ...DEFAULT_PICKER_FILTERS,
        grade: 11,
        component: "SHS_CORE",
        sector: "General Mathematics",
        bowTerm: "One-Term",
      }).map((c) => c.id),
    ).toEqual(["g11-shs-bow"]);

    expect(
      filterPickerCompetencies(SAMPLE_CATALOG, {
        ...DEFAULT_PICKER_FILTERS,
        bowOnly: true,
      }).map((c) => c.id),
    ).toEqual(["g7-ict-bow", "g11-shs-bow", "g12-ia-bow"]);

    expect(
      filterPickerCompetencies(SAMPLE_CATALOG, {
        ...DEFAULT_PICKER_FILTERS,
        grade: 10,
        quarter: 2,
      }).map((c) => c.id),
    ).toEqual(["g9-10-afa-cg"]);

    expect(
      filterPickerCompetencies(SAMPLE_CATALOG, {
        ...DEFAULT_PICKER_FILTERS,
        query: "TechPro IA",
      }).map((c) => c.id),
    ).toEqual(["g12-ia-bow"]);
  });
});

describe("listAvailableSectors", () => {
  it("lists unique sorted sectors scoped by grade and component", () => {
    expect(
      listAvailableSectors(SAMPLE_CATALOG, { grade: "", component: "" }),
    ).toEqual([
      "ANIMAL PRODUCTION",
      "Automotive Servicing",
      "General Mathematics",
    ]);

    expect(
      listAvailableSectors(SAMPLE_CATALOG, { grade: 11, component: "" }),
    ).toEqual(["General Mathematics"]);

    expect(
      listAvailableSectors(SAMPLE_CATALOG, { grade: 7, component: "ICT" }),
    ).toEqual([]);
  });
});

describe("formatBowIndicator and formatCompetencyOptionLabel", () => {
  it("formats BoW term and week range indicators when present and omits them when absent", () => {
    expect(formatBowIndicator(undefined)).toBeNull();
    expect(formatBowIndicator(SAMPLE_CATALOG[0]!.budgetOfWork)).toBe(
      "BoW · First Term · Wk 1 to 2",
    );
    expect(
      formatBowIndicator({
        term: "One-Term",
        weekRange: "",
        suggestedActivities: "",
        suggestedPerformanceTasks: "",
      }),
    ).toBe("BoW · One-Term");
    expect(
      formatBowIndicator({
        term: "",
        weekRange: "3",
        suggestedActivities: "",
        suggestedPerformanceTasks: "",
      }),
    ).toBe("BoW · Wk 3");
    expect(
      formatBowIndicator({
        term: "  ",
        weekRange: " ",
        suggestedActivities: "Act",
        suggestedPerformanceTasks: "",
      }),
    ).toBe("BoW");
  });

  it("includes component short label (including SHS Core) and BoW badge in option labels", () => {
    expect(formatCompetencyOptionLabel(SAMPLE_CATALOG[1]!)).toBe(
      "[AFA] Poultry Housing — Prepare poultry housing facilities",
    );
    expect(formatCompetencyOptionLabel(SAMPLE_CATALOG[2]!)).toBe(
      "[SHS Core] [BoW · One-Term · Wk 1 to 3] Functions — Represent real-life situations using functions",
    );
  });
});
