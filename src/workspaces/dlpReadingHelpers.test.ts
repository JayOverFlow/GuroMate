import { describe, expect, it } from "vitest";
import type { DailyLessonPlan } from "../engine/types";
import {
  buildDlpReadingSections,
  formatDlpSourceLabel,
} from "./dlpReadingHelpers";

describe("formatDlpSourceLabel", () => {
  it("returns null for standalone DLPs without a sourceDllId", () => {
    expect(formatDlpSourceLabel({})).toBeNull();
    expect(formatDlpSourceLabel({ sourceDllId: "   " })).toBeNull();
  });

  it("formats parent DLL title and Session number when both are available", () => {
    expect(
      formatDlpSourceLabel(
        { sourceDllId: "dll-1", sourceSessionNumber: 3 },
        "  ICT & FCS Combined Week  ",
      ),
    ).toBe("Derived from ICT & FCS Combined Week · Session 3");
  });

  it("falls back cleanly when parent DLL title or Session number is missing", () => {
    expect(
      formatDlpSourceLabel({ sourceDllId: "dll-1", sourceSessionNumber: 2 }),
    ).toBe("Derived from Session 2");

    expect(
      formatDlpSourceLabel({ sourceDllId: "dll-1" }, "Number Systems Week"),
    ).toBe("Derived from Number Systems Week");

    expect(formatDlpSourceLabel({ sourceDllId: "dll-1" })).toBe(
      "Derived from DLL",
    );
  });
});

describe("buildDlpReadingSections", () => {
  it("groups DLP paired activity rows into Learning Experience, Assessing Learning, and Ways Forward with Reflections placeholder", () => {
    const dlp: DailyLessonPlan = {
      id: "dlp-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      competencyIds: ["c1"],
      lessonTitle: "Binary to Decimal Conversion",
      learningAreas: "ICT",
      gradeAndSection: "Grade 7 - Rizal",
      references: "DepEd MATATAG TLE 7 CG",
      promptNotes: "45-minute period",
      intentions: {
        learningCompetencies: ["Convert binary to decimal."],
        contentStandards: ["Demonstrates understanding of number systems."],
        performanceStandards: ["Converts numbers accurately."],
        learningObjectives: "• Convert 4-bit binary numbers to decimal.",
        learnerContext: "",
      },
      preLesson: {
        teacherActivity: "Greet class and present hook.",
        studentActivity: "Respond and read objectives.",
      },
      lessonFlow: {
        teacherActivity: "Demonstrate place-value chart.",
        studentActivity: "Practice conversions in pairs.",
      },
      learningResources: {
        teacherActivity: "• Slides",
        studentActivity: "• Worksheet",
      },
      integrationAndContextualization: {
        teacherActivity: "Connect to digital receipts.",
        studentActivity: "",
      },
      formativeAssessment: {
        teacherActivity: "1. Convert 1010.\nA) 8\nB) 10\nC) 12\nD) 14",
        studentActivity: "Answer 5-item quiz independently.",
      },
      extendedLearningOpportunities: {
        teacherActivity: "Convert your birth date to binary.",
        studentActivity: "",
      },
      reflections: {
        teacherActivity: "",
        studentActivity: "",
      },
    };

    const sections = buildDlpReadingSections(dlp);

    expect(sections.map((section) => section.heading)).toEqual([
      "II. Learning Experience",
      "III. Assessing Learning",
      "IV. Ways Forward",
    ]);

    expect(sections[0]!.rows.map((row) => row.label)).toEqual([
      "Pre-Lesson",
      "Lesson Flow",
      "Learning Resources",
      "Opportunities for Integration and Contextualization",
    ]);
    expect(sections[0]!.rows[0]!.pair).toEqual(dlp.preLesson);
    expect(sections[0]!.rows[3]!.pair).toEqual(
      dlp.integrationAndContextualization,
    );

    expect(sections[1]!.rows.map((row) => row.label)).toEqual([
      "Formative Assessment",
    ]);
    expect(sections[1]!.rows[0]!.pair).toEqual(dlp.formativeAssessment);

    expect(sections[2]!.rows.map((row) => row.label)).toEqual([
      "Extended Learning Opportunities",
      "Reflections",
    ]);
    expect(sections[2]!.rows[0]!.emptyPlaceholder).toBeUndefined();
    expect(sections[2]!.rows[1]!.emptyPlaceholder).toBe(
      "Left blank for manual completion",
    );
  });
});
