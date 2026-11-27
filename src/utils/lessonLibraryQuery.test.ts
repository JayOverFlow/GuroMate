import { describe, expect, it } from "vitest";
import type {
  DailyLessonLog,
  DailyLessonPlan,
  DllSessionPlan,
  DlpActivityPair,
  GuroMateSettings,
  SessionNumber,
  TleComponent,
} from "../engine/types";
import {
  clearLessonLibraryFilters,
  DEFAULT_LESSON_LIBRARY_FILTERS,
  isSettingsSetupIncomplete,
  queryLessonLibrary,
} from "./lessonLibraryQuery";

const EMPTY_PAIR: DlpActivityPair = {
  teacherActivity: "",
  studentActivity: "",
};

function makeSession(
  sessionNumber: SessionNumber,
  components: TleComponent[] = ["ICT"],
): DllSessionPlan {
  return {
    sessionNumber,
    mode: "instructional",
    competencyIds: [`comp-${sessionNumber}`],
    components,
    learningObjectives: `Objectives for Session ${sessionNumber}`,
    preLesson: "",
    lessonFlow: "",
    learningResources: "",
    integrationAndContextualization: "",
    formativeAssessment: "",
    extendedLearningOpportunities: "",
    reflections: "",
  };
}

function makeDll(overrides: Partial<DailyLessonLog> = {}): DailyLessonLog {
  return {
    id: "dll-1",
    createdAt: "2026-04-01T08:00:00.000Z",
    updatedAt: "2026-04-05T08:00:00.000Z",
    lessonTitle: "Number Systems and Conversions",
    learningAreas: "ICT",
    gradeAndSection: "Grade 8 - Narra",
    references: "DepEd MATATAG TLE ICT CG",
    promptNotes: "",
    intentions: {
      learningCompetencies: ["Convert binary numbers to decimal"],
      contentStandards: ["Understand number systems"],
      performanceStandards: ["Perform number conversions accurately"],
      learnerContext: "",
    },
    sessions: [
      makeSession(1, ["ICT"]),
      makeSession(2, ["ICT"]),
      makeSession(3, ["ICT"]),
      makeSession(4, ["ICT"]),
      makeSession(5, ["ICT"]),
    ],
    ...overrides,
  };
}

function makeDlp(overrides: Partial<DailyLessonPlan> = {}): DailyLessonPlan {
  return {
    id: "dlp-1",
    createdAt: "2026-04-02T08:00:00.000Z",
    updatedAt: "2026-04-06T09:00:00.000Z",
    competencyIds: ["comp-1"],
    lessonTitle: "Kitchen Sanitation Fundamentals",
    learningAreas: "FCS",
    gradeAndSection: "Grade 7 - Molave",
    references: "DepEd MATATAG FCS BoW Q1",
    promptNotes: "",
    intentions: {
      learningCompetencies: ["Demonstrate kitchen sanitation procedures"],
      contentStandards: ["Understand food safety"],
      performanceStandards: ["Apply hygienic kitchen practices"],
      learningObjectives: "• Explain sanitation steps",
      learnerContext: "",
    },
    preLesson: EMPTY_PAIR,
    lessonFlow: EMPTY_PAIR,
    learningResources: EMPTY_PAIR,
    integrationAndContextualization: EMPTY_PAIR,
    formativeAssessment: EMPTY_PAIR,
    extendedLearningOpportunities: EMPTY_PAIR,
    reflections: EMPTY_PAIR,
    ...overrides,
  };
}

function makeSettings(
  overrides: {
    profile?: Partial<GuroMateSettings["profile"]>;
    ai?: Partial<GuroMateSettings["ai"]>;
  } = {},
): GuroMateSettings {
  return {
    profile: {
      studentTeacherName: "Maria Santos",
      cooperatingTeacherName: "Juan Dela Cruz",
      tleCoordinatorName: "Elena Reyes",
      academicHeadName: "Roberto Lim",
      aiDeclaration: "AI-assisted with teacher review.",
      ...overrides.profile,
    },
    ai: {
      aiProvider: "openai-compatible",
      apiKey: "sk-test-key",
      baseUrl: "https://api.example.com/v1",
      modelId: "gpt-4o-mini",
      ...overrides.ai,
    },
  };
}

describe("queryLessonLibrary", () => {
  it("unifies saved DLLs and DLPs, reports inventory counts, and sorts by Recently Updated by default", () => {
    const dll = makeDll({
      id: "dll-1",
      updatedAt: "2026-04-05T08:00:00.000Z",
    });
    const dlp = makeDlp({
      id: "dlp-1",
      updatedAt: "2026-04-06T09:00:00.000Z",
      sourceDllId: "dll-1",
      sourceSessionNumber: 2,
    });

    const result = queryLessonLibrary({
      dlls: [dll],
      dlps: [dlp],
      settings: makeSettings(),
    });

    expect(result.counts).toEqual({ total: 2, dlls: 1, dlps: 1 });
    expect(result.entries.map((e) => `${e.kind}:${e.id}`)).toEqual([
      "dlp:dlp-1",
      "dll:dll-1",
    ]);
    expect(result.entries[0]).toMatchObject({
      kind: "dlp",
      id: "dlp-1",
      components: ["FCS"],
      sourceDllId: "dll-1",
      sourceSessionNumber: 2,
    });
    expect(result.entries[1]).toMatchObject({
      kind: "dll",
      id: "dll-1",
      components: ["ICT"],
    });
    expect(result.hasActiveFilters).toBe(false);
  });

  it("filters entries by lesson type while preserving overall inventory counts", () => {
    const dll = makeDll({ id: "dll-1" });
    const dlp = makeDlp({ id: "dlp-1" });

    const dllOnly = queryLessonLibrary({
      dlls: [dll],
      dlps: [dlp],
      filters: { type: "dll" },
    });
    expect(dllOnly.counts).toEqual({ total: 2, dlls: 1, dlps: 1 });
    expect(dllOnly.entries.map((e) => e.id)).toEqual(["dll-1"]);
    expect(dllOnly.hasActiveFilters).toBe(true);

    const dlpOnly = queryLessonLibrary({
      dlls: [dll],
      dlps: [dlp],
      filters: { type: "dlp" },
    });
    expect(dlpOnly.counts).toEqual({ total: 2, dlls: 1, dlps: 1 });
    expect(dlpOnly.entries.map((e) => e.id)).toEqual(["dlp-1"]);
    expect(dlpOnly.hasActiveFilters).toBe(true);
  });

  it("matches live keyword search across title, Grade & Section, TLE Component / SHS Core code and label, Learning Competencies, and references", () => {
    const ictDll = makeDll({
      id: "dll-ict",
      lessonTitle: "Number Systems and Conversions",
      gradeAndSection: "Grade 8 - Narra",
      learningAreas: "ICT",
      references: "DepEd MATATAG TLE ICT CG 2024",
      intentions: {
        learningCompetencies: ["Convert binary numbers to decimal equivalents"],
        contentStandards: [],
        performanceStandards: [],
        learnerContext: "",
      },
      sessions: [
        makeSession(1, ["ICT"]),
        makeSession(2, ["ICT"]),
        makeSession(3, ["ICT"]),
        makeSession(4, ["ICT"]),
        makeSession(5, ["ICT"]),
      ],
    });
    const shsDlp = makeDlp({
      id: "dlp-shs",
      lessonTitle: "Functions and Inverse Relations",
      gradeAndSection: "Grade 11 - STEM A",
      learningAreas: "SHS_CORE",
      references: "Grade 11 General Mathematics BoW Term 1",
      intentions: {
        learningCompetencies: ["Determine the inverse of a one-to-one function"],
        contentStandards: [],
        performanceStandards: [],
        learningObjectives: "",
        learnerContext: "",
      },
    });

    // Title
    expect(
      queryLessonLibrary({
        dlls: [ictDll],
        dlps: [shsDlp],
        filters: { query: "conversions" },
      }).entries.map((e) => e.id),
    ).toEqual(["dll-ict"]);

    // Grade & Section
    expect(
      queryLessonLibrary({
        dlls: [ictDll],
        dlps: [shsDlp],
        filters: { query: "stem a" },
      }).entries.map((e) => e.id),
    ).toEqual(["dlp-shs"]);

    // SHS Core display label
    expect(
      queryLessonLibrary({
        dlls: [ictDll],
        dlps: [shsDlp],
        filters: { query: "SHS Core" },
      }).entries.map((e) => e.id),
    ).toEqual(["dlp-shs"]);

    // Raw component code SHS_CORE
    expect(
      queryLessonLibrary({
        dlls: [ictDll],
        dlps: [shsDlp],
        filters: { query: "shs_core" },
      }).entries.map((e) => e.id),
    ).toEqual(["dlp-shs"]);

    // Learning Competency
    expect(
      queryLessonLibrary({
        dlls: [ictDll],
        dlps: [shsDlp],
        filters: { query: "one-to-one function" },
      }).entries.map((e) => e.id),
    ).toEqual(["dlp-shs"]);

    // References
    expect(
      queryLessonLibrary({
        dlls: [ictDll],
        dlps: [shsDlp],
        filters: { query: "CG 2024" },
      }).entries.map((e) => e.id),
    ).toEqual(["dll-ict"]);

    // Non-matching query returns empty entries with active filters flag
    const noMatch = queryLessonLibrary({
      dlls: [ictDll],
      dlps: [shsDlp],
      filters: { query: "aquaculture" },
    });
    expect(noMatch.entries).toEqual([]);
    expect(noMatch.hasActiveFilters).toBe(true);
  });

  it("derives dynamic TLE Component / SHS Core and Grade & Section facets and filters by them", () => {
    const multiDll = makeDll({
      id: "dll-multi",
      gradeAndSection: "Grade 10 - Rizal",
      learningAreas: "ICT, FCS",
      sessions: [
        makeSession(1, ["ICT"]),
        makeSession(2, ["ICT"]),
        makeSession(3, ["FCS"]),
        makeSession(4, ["FCS"]),
        makeSession(5, ["IA"]),
      ],
    });
    const shsDll = makeDll({
      id: "dll-shs",
      gradeAndSection: "Grade 11 - HUMSS A",
      learningAreas: "SHS Core",
      sessions: [
        makeSession(1, ["SHS_CORE"]),
        makeSession(2, ["SHS_CORE"]),
        makeSession(3, ["SHS_CORE"]),
        makeSession(4, ["SHS_CORE"]),
        makeSession(5, ["SHS_CORE"]),
      ],
    });
    const afaDlp = makeDlp({
      id: "dlp-afa",
      gradeAndSection: "Grade 7 - Molave",
      learningAreas: "AFA",
    });
    const duplicateSectionDlp = makeDlp({
      id: "dlp-shs",
      gradeAndSection: "  Grade 11 - HUMSS A  ",
      learningAreas: "SHS_CORE",
    });

    const unfiltered = queryLessonLibrary({
      dlls: [multiDll, shsDll],
      dlps: [afaDlp, duplicateSectionDlp],
    });

    expect(unfiltered.componentOptions).toEqual([
      { value: "ICT", label: "ICT" },
      { value: "AFA", label: "AFA" },
      { value: "FCS", label: "FCS" },
      { value: "IA", label: "IA" },
      { value: "SHS_CORE", label: "SHS Core" },
    ]);
    expect(unfiltered.gradeSectionOptions).toEqual([
      "Grade 7 - Molave",
      "Grade 10 - Rizal",
      "Grade 11 - HUMSS A",
    ]);

    const shsFiltered = queryLessonLibrary({
      dlls: [multiDll, shsDll],
      dlps: [afaDlp, duplicateSectionDlp],
      filters: { component: "SHS_CORE" },
    });
    expect(shsFiltered.entries.map((e) => e.id).sort()).toEqual([
      "dll-shs",
      "dlp-shs",
    ]);
    // Dynamic facets still reflect full saved library so user can switch filters
    expect(shsFiltered.componentOptions).toHaveLength(5);

    const combinedFiltered = queryLessonLibrary({
      dlls: [multiDll, shsDll],
      dlps: [afaDlp, duplicateSectionDlp],
      filters: {
        type: "dlp",
        component: "SHS_CORE",
        gradeAndSection: "Grade 11 - HUMSS A",
      },
    });
    expect(combinedFiltered.entries.map((e) => e.id)).toEqual(["dlp-shs"]);
    expect(combinedFiltered.hasActiveFilters).toBe(true);
  });

  it("sorts entries by Recently Updated, Recently Created, and Title A–Z", () => {
    const beta = makeDll({
      id: "dll-beta",
      lessonTitle: "Beta Algorithms",
      createdAt: "2026-04-03T08:00:00.000Z",
      updatedAt: "2026-04-04T08:00:00.000Z",
    });
    const alpha = makeDlp({
      id: "dlp-alpha",
      lessonTitle: "alpha Breadmaking",
      createdAt: "2026-04-01T08:00:00.000Z",
      updatedAt: "2026-04-07T08:00:00.000Z",
    });
    const gamma = makeDll({
      id: "dll-gamma",
      lessonTitle: "Gamma Circuits",
      createdAt: "2026-04-05T08:00:00.000Z",
      updatedAt: "2026-04-05T08:00:00.000Z",
    });

    expect(
      queryLessonLibrary({
        dlls: [beta, gamma],
        dlps: [alpha],
        filters: { sort: "updated" },
      }).entries.map((e) => e.id),
    ).toEqual(["dlp-alpha", "dll-gamma", "dll-beta"]);

    expect(
      queryLessonLibrary({
        dlls: [beta, gamma],
        dlps: [alpha],
        filters: { sort: "created" },
      }).entries.map((e) => e.id),
    ).toEqual(["dll-gamma", "dll-beta", "dlp-alpha"]);

    expect(
      queryLessonLibrary({
        dlls: [beta, gamma],
        dlps: [alpha],
        filters: { sort: "title" },
      }).entries.map((e) => e.id),
    ).toEqual(["dlp-alpha", "dll-beta", "dll-gamma"]);
  });

  it("reports setup-callout readiness accurately based on Teacher Profile and AI provider settings", () => {
    expect(isSettingsSetupIncomplete(null)).toBe(false);
    expect(isSettingsSetupIncomplete(undefined)).toBe(false);
    expect(isSettingsSetupIncomplete(makeSettings())).toBe(false);

    // Ollama does not require an API key when baseUrl and modelId are set
    expect(
      isSettingsSetupIncomplete(
        makeSettings({
          ai: {
            aiProvider: "ollama",
            apiKey: "",
            baseUrl: "http://localhost:11434/v1",
            modelId: "llama3.2",
          },
        }),
      ),
    ).toBe(false);

    // Incomplete Teacher Profile
    expect(
      queryLessonLibrary({
        dlls: [],
        dlps: [],
        settings: makeSettings({ profile: { studentTeacherName: "   " } }),
      }).needsSetup,
    ).toBe(true);

    // Incomplete AI provider settings (missing API key or modelId)
    expect(
      queryLessonLibrary({
        dlls: [],
        dlps: [],
        settings: makeSettings({ ai: { apiKey: "" } }),
      }).needsSetup,
    ).toBe(true);

    expect(
      queryLessonLibrary({
        dlls: [],
        dlps: [],
        settings: makeSettings({ ai: { modelId: "" } }),
      }).needsSetup,
    ).toBe(true);

    // Complete settings yield needsSetup = false
    expect(
      queryLessonLibrary({
        dlls: [],
        dlps: [],
        settings: makeSettings(),
      }).needsSetup,
    ).toBe(false);
  });

  it("treats sort changes as non-filtering and resets active filters while preserving sort order", () => {
    const dll = makeDll({ id: "dll-1" });
    const sortedOnly = queryLessonLibrary({
      dlls: [dll],
      dlps: [],
      filters: { sort: "title" },
    });
    expect(sortedOnly.hasActiveFilters).toBe(false);

    const cleared = clearLessonLibraryFilters({
      type: "dlp",
      query: "nonexistent",
      component: "SHS_CORE",
      gradeAndSection: "Grade 11 - STEM A",
      sort: "title",
    });
    expect(cleared).toEqual({
      ...DEFAULT_LESSON_LIBRARY_FILTERS,
      sort: "title",
    });
  });
});
