import { describe, expect, it } from "vitest";
import { computeCatalogCoverage } from "./catalogCoverage";
import type { CurriculumCompetency } from "./types";

function makeItem(
  overrides: Partial<CurriculumCompetency> &
    Pick<CurriculumCompetency, "id" | "gradeLevels" | "component">,
): CurriculumCompetency {
  return {
    source: "built-in",
    quarters: [1],
    quarterLabel: "Quarter I",
    sector: null,
    sectorDescription: null,
    contentTopic: "Topic",
    contentSubTopics: [],
    contentStandard: "CS",
    performanceStandard: "PS",
    competencyNumber: 1,
    learningCompetency: "LC",
    ...overrides,
  };
}

describe("computeCatalogCoverage", () => {
  it("computes total, BoW-enriched, per-grade (7-12), and per-component counts including multi-grade competencies", () => {
    const items: CurriculumCompetency[] = [
      makeItem({
        id: "g7-ict",
        gradeLevels: [7],
        component: "ICT",
        budgetOfWork: {
          term: "First Term",
          weekRange: "1 to 2",
          suggestedActivities: "Act",
          suggestedPerformanceTasks: "Task",
        },
      }),
      makeItem({
        id: "g9-10-afa",
        gradeLevels: [9, 10],
        component: "AFA",
      }),
      makeItem({
        id: "g11-shs",
        gradeLevels: [11],
        component: "SHS_CORE",
        budgetOfWork: {
          term: "One-Term",
          weekRange: "1 to 3",
          suggestedActivities: "Act",
          suggestedPerformanceTasks: "Task",
          sourceDocument: "SHS Core BoW.pdf",
        },
      }),
      makeItem({
        id: "g12-ia",
        gradeLevels: [12],
        component: "IA",
        budgetOfWork: {
          term: "First Term",
          weekRange: "1",
          suggestedActivities: "Act",
          suggestedPerformanceTasks: "Task",
        },
      }),
    ];

    const summary = computeCatalogCoverage(items);

    expect(summary.totalCompetencies).toBe(4);
    expect(summary.totalBowCompetencies).toBe(3);

    expect(summary.byGrade.map((row) => row.gradeLevel)).toEqual([
      7, 8, 9, 10, 11, 12,
    ]);
    expect(summary.byGrade[0]).toEqual({
      gradeLevel: 7,
      total: 1,
      bowCount: 1,
      byComponent: { ICT: 1, AFA: 0, FCS: 0, IA: 0, SHS_CORE: 0 },
    });
    expect(summary.byGrade[1]).toEqual({
      gradeLevel: 8,
      total: 0,
      bowCount: 0,
      byComponent: { ICT: 0, AFA: 0, FCS: 0, IA: 0, SHS_CORE: 0 },
    });
    expect(summary.byGrade[2]).toMatchObject({
      gradeLevel: 9,
      total: 1,
      bowCount: 0,
      byComponent: { AFA: 1 },
    });
    expect(summary.byGrade[3]).toMatchObject({
      gradeLevel: 10,
      total: 1,
      bowCount: 0,
      byComponent: { AFA: 1 },
    });
    expect(summary.byGrade[4]).toEqual({
      gradeLevel: 11,
      total: 1,
      bowCount: 1,
      byComponent: { ICT: 0, AFA: 0, FCS: 0, IA: 0, SHS_CORE: 1 },
    });
    expect(summary.byGrade[5]).toEqual({
      gradeLevel: 12,
      total: 1,
      bowCount: 1,
      byComponent: { ICT: 0, AFA: 0, FCS: 0, IA: 1, SHS_CORE: 0 },
    });

    expect(summary.byComponent).toEqual([
      { component: "ICT", total: 1, bowCount: 1 },
      { component: "AFA", total: 1, bowCount: 0 },
      { component: "FCS", total: 0, bowCount: 0 },
      { component: "IA", total: 1, bowCount: 1 },
      { component: "SHS_CORE", total: 1, bowCount: 1 },
    ]);
  });
});
