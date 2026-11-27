import { describe, expect, it } from "vitest";
import {
  formatCompetencyLines,
  parseLearningAreaComponents,
  resolveLessonReferences,
} from "./lessonHelpers";
import type { CurriculumCompetency } from "./types";

function makeCompetency(
  overrides: Partial<CurriculumCompetency> = {},
): CurriculumCompetency {
  return {
    id: "custom-g11-genmath-01",
    source: "custom",
    gradeLevels: [11],
    quarters: [1],
    quarterLabel: "Quarter I",
    component: "SHS_CORE",
    sector: "General Mathematics",
    sectorDescription: null,
    contentTopic: "Functions and Their Graphs",
    contentSubTopics: ["Representations of functions"],
    contentStandard: "The learner demonstrates understanding of key concepts of functions.",
    performanceStandard: "The learner accurately constructs mathematical models using functions.",
    competencyNumber: 1,
    learningCompetency: "Represent real-life situations using functions.",
    budgetOfWork: {
      term: "First Term",
      weekRange: "1 to 2",
      suggestedActivities: "Barangay utility bill modeling workshop",
      suggestedPerformanceTasks: "Local sari-sari store pricing model presentation",
      sourceDocument: "Grade 11 SHS Core General Mathematics Budget of Work",
    },
    ...overrides,
  };
}

describe("lessonHelpers BoW formatting and reference citations", () => {
  it("formats BoW pacing, Suggested Activities, Suggested Performance Tasks, and sourceDocument citation", () => {
    const formatted = formatCompetencyLines([makeCompetency()]);

    expect(formatted).toContain("First Term");
    expect(formatted).toContain("Week 1 to 2");
    expect(formatted).toContain("Barangay utility bill modeling workshop");
    expect(formatted).toContain("Local sari-sari store pricing model presentation");
    expect(formatted).toContain(
      "Grade 11 SHS Core General Mathematics Budget of Work",
    );
  });

  it("auto-populates deduped BoW sourceDocument citations when teacher leaves references blank and preserves explicit teacher references", () => {
    const comp1 = makeCompetency();
    const comp2 = makeCompetency({
      id: "custom-g12-ict-01",
      gradeLevels: [12],
      component: "ICT",
      sector: "Computer Programming",
      budgetOfWork: {
        term: "One-Term",
        weekRange: "3 to 4",
        suggestedActivities: "Algorithm flowchart sprint",
        suggestedPerformanceTasks: "Console inventory tracker prototype",
        sourceDocument: "Grade 12 Tech-Pro ICT Computer Programming Budget of Work",
      },
    });
    const compDuplicateSource = makeCompetency({ id: "custom-g11-genmath-02" });

    // Teacher leaves references blank and AI returns empty string
    expect(
      resolveLessonReferences("", "", [comp1, comp2, compDuplicateSource]),
    ).toBe(
      "Grade 11 SHS Core General Mathematics Budget of Work; Grade 12 Tech-Pro ICT Computer Programming Budget of Work",
    );

    // Teacher leaves references blank and AI returns a generic reference
    expect(
      resolveLessonReferences(undefined, "DepEd MATATAG Curriculum Guide", [
        comp1,
      ]),
    ).toBe(
      "DepEd MATATAG Curriculum Guide; Grade 11 SHS Core General Mathematics Budget of Work",
    );

    // Teacher leaves references blank and AI already included the BoW sourceDocument
    expect(
      resolveLessonReferences(
        "   ",
        "DepEd MATATAG CG; Grade 11 SHS Core General Mathematics Budget of Work",
        [comp1],
      ),
    ).toBe(
      "DepEd MATATAG CG; Grade 11 SHS Core General Mathematics Budget of Work",
    );

    // Explicit teacher references are preserved untouched
    expect(
      resolveLessonReferences(
        "Teacher Custom Module p. 12",
        "AI Reference",
        [comp1, comp2],
      ),
    ).toBe("Teacher Custom Module p. 12");
  });

  it("parses learningAreas strings into canonical deduped TleComponent values including SHS Core", () => {
    expect(parseLearningAreaComponents("ICT, FCS")).toEqual(["ICT", "FCS"]);
    expect(parseLearningAreaComponents("SHS Core, ICT, SHS_CORE")).toEqual([
      "SHS_CORE",
      "ICT",
    ]);
    expect(parseLearningAreaComponents("afa / ia; fcs")).toEqual([
      "AFA",
      "IA",
      "FCS",
    ]);
    expect(parseLearningAreaComponents("")).toEqual([]);
  });
});
