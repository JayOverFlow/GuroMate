import { describe, expect, it } from "vitest";
import type {
  DailyLessonLog,
  DailyLessonPlan,
  DllSessionPlan,
  DlpActivityPair,
  SessionNumber,
} from "../engine/types";
import {
  applyDllLaunchTarget,
  applyDlpLaunchTarget,
  applyQuizLaunchTarget,
  createFreshDllCreationFormState,
  createFreshDlpCreationFormState,
  createInitialDllSessionConfigs,
  isDllDraftDirty,
  isDlpDraftDirty,
  isLeavingActiveLesson,
  resolveLessonRouteSelection,
  shouldResetCreationFormOnRouteChange,
  type DlpLaunchState,
  type QuizLaunchState,
} from "./workspaceLaunchHelpers";

describe("applyDllLaunchTarget", () => {
  it("assigns the launched Learning Competency to Session 1 on a clean 5-session config", () => {
    const initial = createInitialDllSessionConfigs();

    const next = applyDllLaunchTarget(initial, {
      competencyId: "g7-ict-q1-lc1",
    });

    expect(next).toHaveLength(5);
    expect(next[0]).toEqual({
      sessionNumber: 1,
      mode: "instructional",
      competencyIds: ["g7-ict-q1-lc1"],
      nonInstructionalReason: "",
    });
    expect(next.slice(1).every((s) => s.competencyIds.length === 0)).toBe(true);
  });

  it("preserves already configured Sessions 2-5 and existing Session 1 competencies without duplicates", () => {
    const existing = createInitialDllSessionConfigs().map((cfg) => {
      if (cfg.sessionNumber === 1) {
        return { ...cfg, competencyIds: ["g7-ict-q1-lc1"] };
      }
      if (cfg.sessionNumber === 3) {
        return {
          ...cfg,
          mode: "non-instructional" as const,
          nonInstructionalReason: "School Intramurals",
        };
      }
      if (cfg.sessionNumber === 4) {
        return { ...cfg, competencyIds: ["g7-fcs-q1-lc2"] };
      }
      return cfg;
    });

    const addedNew = applyDllLaunchTarget(existing, {
      competencyId: "g11-shs-core-q1-lc1",
    });
    expect(addedNew[0]?.competencyIds).toEqual([
      "g7-ict-q1-lc1",
      "g11-shs-core-q1-lc1",
    ]);
    expect(addedNew[2]).toEqual(existing[2]);
    expect(addedNew[3]).toEqual(existing[3]);

    const deduplicated = applyDllLaunchTarget(addedNew, {
      competencyId: "g7-ict-q1-lc1",
    });
    expect(deduplicated[0]?.competencyIds).toEqual([
      "g7-ict-q1-lc1",
      "g11-shs-core-q1-lc1",
    ]);
  });

  it("switches Session 1 back to instructional if it was non-instructional", () => {
    const existing = createInitialDllSessionConfigs().map((cfg) =>
      cfg.sessionNumber === 1
        ? {
            ...cfg,
            mode: "non-instructional" as const,
            nonInstructionalReason: "Holiday",
          }
        : cfg,
    );

    const next = applyDllLaunchTarget(existing, {
      competencyId: "g12-ia-t1-lc3",
    });

    expect(next[0]?.mode).toBe("instructional");
    expect(next[0]?.competencyIds).toEqual(["g12-ia-t1-lc3"]);
  });

  it("returns configs unchanged when competencyId is blank", () => {
    const initial = createInitialDllSessionConfigs();
    const next = applyDllLaunchTarget(initial, { competencyId: "   " });
    expect(next).toEqual(initial);
  });
});

describe("applyDlpLaunchTarget", () => {
  const baseState: DlpLaunchState = {
    selectedDlpId: "dlp-existing",
    builderMode: "derive",
    deriveDllId: "dll-1",
    deriveSessionNumber: 2,
    selectedCompetencyIds: [],
    pickedCompetencyId: "",
  };

  it("opens DLP builder in scratch mode with the chosen competency pre-selected", () => {
    const next = applyDlpLaunchTarget(baseState, {
      mode: "scratch",
      competencyId: "g11-shs-core-q1-lc2",
    });

    expect(next).toEqual({
      selectedDlpId: "",
      builderMode: "scratch",
      deriveDllId: "dll-1",
      deriveSessionNumber: 2,
      selectedCompetencyIds: ["g11-shs-core-q1-lc2"],
      pickedCompetencyId: "g11-shs-core-q1-lc2",
    });
  });

  it("deduplicates competencyId when launching DLP in scratch mode with an already-selected competency", () => {
    const withExisting: DlpLaunchState = {
      ...baseState,
      builderMode: "scratch",
      selectedCompetencyIds: ["g7-ict-q1-lc1"],
    };

    const next = applyDlpLaunchTarget(withExisting, {
      mode: "scratch",
      competencyId: "g7-ict-q1-lc1",
    });

    expect(next.selectedCompetencyIds).toEqual(["g7-ict-q1-lc1"]);
  });

  it("opens DLP builder in derive mode for a DLL session", () => {
    const next = applyDlpLaunchTarget(
      { ...baseState, builderMode: "scratch" },
      { mode: "derive", dllId: "dll-9", sessionNumber: 4 },
    );

    expect(next).toEqual({
      selectedDlpId: "",
      builderMode: "derive",
      deriveDllId: "dll-9",
      deriveSessionNumber: 4,
      selectedCompetencyIds: [],
      pickedCompetencyId: "",
    });
  });
});

describe("applyQuizLaunchTarget", () => {
  const baseState: QuizLaunchState = {
    selectedQuizId: "quiz-existing",
    sourceKind: "dll",
    selectedDllId: "dll-1",
    selectedSessionNumber: 3,
    selectedDlpId: "dlp-1",
    selectedCompetencyIds: [],
    pickedCompetencyId: "",
  };

  it("opens Quiz builder in standalone mode with the chosen competency pre-selected", () => {
    const next = applyQuizLaunchTarget(baseState, {
      sourceKind: "standalone",
      competencyId: "g12-afa-t1-lc4",
    });

    expect(next).toEqual({
      selectedQuizId: "",
      sourceKind: "standalone",
      selectedDllId: "dll-1",
      selectedSessionNumber: 3,
      selectedDlpId: "dlp-1",
      selectedCompetencyIds: ["g12-afa-t1-lc4"],
      pickedCompetencyId: "g12-afa-t1-lc4",
    });
  });

  it("deduplicates competencyId in standalone Quiz launch", () => {
    const withExisting: QuizLaunchState = {
      ...baseState,
      sourceKind: "standalone",
      selectedCompetencyIds: ["g8-fcs-q2-lc1"],
    };

    const next = applyQuizLaunchTarget(withExisting, {
      sourceKind: "standalone",
      competencyId: "g8-fcs-q2-lc1",
    });

    expect(next.selectedCompetencyIds).toEqual(["g8-fcs-q2-lc1"]);
  });

  it("supports DLL and DLP launch targets without losing their IDs", () => {
    const fromDll = applyQuizLaunchTarget(baseState, {
      sourceKind: "dll",
      dllId: "dll-7",
      sessionNumber: 5,
    });
    expect(fromDll.selectedQuizId).toBe("");
    expect(fromDll.sourceKind).toBe("dll");
    expect(fromDll.selectedDllId).toBe("dll-7");
    expect(fromDll.selectedSessionNumber).toBe(5);

    const fromDlp = applyQuizLaunchTarget(baseState, {
      sourceKind: "dlp",
      dlpId: "dlp-8",
    });
    expect(fromDlp.selectedQuizId).toBe("");
    expect(fromDlp.sourceKind).toBe("dlp");
    expect(fromDlp.selectedDlpId).toBe("dlp-8");
  });
});

describe("resolveLessonRouteSelection", () => {
  it("starts a fresh creation form without auto-loading saved DLLs/DLPs when route has no lessonId", () => {
    expect(
      resolveLessonRouteSelection(undefined, undefined, ["dll-1", "dll-2"], false),
    ).toEqual({ kind: "create" });
    expect(
      resolveLessonRouteSelection("   ", "markdown", ["dll-1"], false),
    ).toEqual({ kind: "create" });
  });

  it("waits while loading when a deep-linked lesson ID has not been fetched yet", () => {
    expect(
      resolveLessonRouteSelection("dll-2", "markdown", [], true),
    ).toEqual({ kind: "loading" });
  });

  it("opens an existing deep-linked lesson in edit or markdown view", () => {
    expect(
      resolveLessonRouteSelection("dll-2", undefined, ["dll-1", "dll-2"], false),
    ).toEqual({ kind: "open", lessonId: "dll-2", viewMode: "edit" });

    expect(
      resolveLessonRouteSelection("dll-2", "markdown", ["dll-1", "dll-2"], false),
    ).toEqual({ kind: "open", lessonId: "dll-2", viewMode: "markdown" });
  });

  it("reports missing when loading finishes and the deep-linked lesson ID does not exist", () => {
    expect(
      resolveLessonRouteSelection("dll-deleted", "edit", ["dll-1", "dll-2"], false),
    ).toEqual({ kind: "missing", lessonId: "dll-deleted" });
  });
});

function makeDllSession(sessionNumber: SessionNumber): DllSessionPlan {
  return {
    sessionNumber,
    mode: "instructional",
    competencyIds: [`comp-${sessionNumber}`],
    components: ["ICT"],
    learningObjectives: `Objectives ${sessionNumber}`,
    preLesson: `Pre-lesson ${sessionNumber}`,
    lessonFlow: `Flow ${sessionNumber}`,
    learningResources: `Resources ${sessionNumber}`,
    integrationAndContextualization: `Integration ${sessionNumber}`,
    formativeAssessment: `Assessment ${sessionNumber}`,
    extendedLearningOpportunities: `Extended ${sessionNumber}`,
    reflections: "",
  };
}

function makeSampleDll(): DailyLessonLog {
  return {
    id: "dll-1",
    createdAt: "2026-04-01T08:00:00.000Z",
    updatedAt: "2026-04-02T08:00:00.000Z",
    lessonTitle: "Number Systems",
    learningAreas: "ICT",
    gradeAndSection: "Grade 8 - Narra",
    references: "DepEd MATATAG TLE ICT CG",
    promptNotes: "",
    intentions: {
      learningCompetencies: ["Convert binary to decimal"],
      contentStandards: ["Understand number systems"],
      performanceStandards: ["Convert accurately"],
      learnerContext: "",
    },
    sessions: [
      makeDllSession(1),
      makeDllSession(2),
      makeDllSession(3),
      makeDllSession(4),
      makeDllSession(5),
    ],
  };
}

describe("isDllDraftDirty", () => {
  it("returns false when saved or draft is missing, IDs mismatch, or editable fields match", () => {
    const saved = makeSampleDll();
    expect(isDllDraftDirty(null, saved)).toBe(false);
    expect(isDllDraftDirty(saved, null)).toBe(false);
    expect(isDllDraftDirty(saved, { ...structuredClone(saved), id: "dll-2" })).toBe(
      false,
    );
    expect(isDllDraftDirty(saved, structuredClone(saved))).toBe(false);
    expect(
      isDllDraftDirty(saved, {
        ...structuredClone(saved),
        updatedAt: "2026-04-09T12:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("returns true when header, intentions, or any Session field is edited inline", () => {
    const saved = makeSampleDll();

    const editedTitle = structuredClone(saved);
    editedTitle.lessonTitle = "Number Systems Updated";
    expect(isDllDraftDirty(saved, editedTitle)).toBe(true);

    const editedIntentions = structuredClone(saved);
    editedIntentions.intentions.learnerContext = "40 learners in pairs";
    expect(isDllDraftDirty(saved, editedIntentions)).toBe(true);

    const editedSession = structuredClone(saved);
    editedSession.sessions[2].lessonFlow = "Updated Session 3 flow";
    expect(isDllDraftDirty(saved, editedSession)).toBe(true);

    const emptyLegacyDeclaration = structuredClone(saved);
    emptyLegacyDeclaration.aiDeclaration = "";
    expect(isDllDraftDirty(saved, emptyLegacyDeclaration)).toBe(false);

    const editedDeclaration = structuredClone(saved);
    editedDeclaration.aiDeclaration =
      "Declaration of AI Use (DO 003, s. 2026 Annex A): Reviewed by teacher.";
    expect(isDllDraftDirty(saved, editedDeclaration)).toBe(true);
  });
});

function makePair(prefix: string): DlpActivityPair {
  return {
    teacherActivity: `${prefix} teacher`,
    studentActivity: `${prefix} student`,
  };
}

function makeSampleDlp(): DailyLessonPlan {
  return {
    id: "dlp-1",
    createdAt: "2026-04-01T08:00:00.000Z",
    updatedAt: "2026-04-02T08:00:00.000Z",
    sourceDllId: "dll-1",
    sourceSessionNumber: 2,
    competencyIds: ["comp-1"],
    lessonTitle: "Binary to Decimal",
    learningAreas: "ICT",
    gradeAndSection: "Grade 8 - Narra",
    references: "DepEd MATATAG TLE ICT CG",
    promptNotes: "",
    intentions: {
      learningCompetencies: ["Convert binary to decimal"],
      contentStandards: ["Understand number systems"],
      performanceStandards: ["Convert accurately"],
      learningObjectives: "• Convert 4-bit binary numbers",
      learnerContext: "",
    },
    preLesson: makePair("Pre"),
    lessonFlow: makePair("Flow"),
    learningResources: makePair("Resources"),
    integrationAndContextualization: makePair("Integration"),
    formativeAssessment: makePair("Assessment"),
    extendedLearningOpportunities: makePair("Extended"),
    reflections: { teacherActivity: "", studentActivity: "" },
  };
}

describe("isDlpDraftDirty", () => {
  it("returns false when saved or draft is missing, IDs mismatch, or editable fields match", () => {
    const saved = makeSampleDlp();
    expect(isDlpDraftDirty(null, saved)).toBe(false);
    expect(isDlpDraftDirty(saved, null)).toBe(false);
    expect(isDlpDraftDirty(saved, { ...structuredClone(saved), id: "dlp-2" })).toBe(
      false,
    );
    expect(isDlpDraftDirty(saved, structuredClone(saved))).toBe(false);
    expect(
      isDlpDraftDirty(saved, {
        ...structuredClone(saved),
        updatedAt: "2026-04-10T10:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("returns true when header, intentions, or any paired activity cell is edited inline", () => {
    const saved = makeSampleDlp();

    const editedHeader = structuredClone(saved);
    editedHeader.references = "Updated CG";
    expect(isDlpDraftDirty(saved, editedHeader)).toBe(true);

    const editedObjectives = structuredClone(saved);
    editedObjectives.intentions.learningObjectives = "• Updated objective";
    expect(isDlpDraftDirty(saved, editedObjectives)).toBe(true);

    const editedStudentActivity = structuredClone(saved);
    editedStudentActivity.formativeAssessment.studentActivity =
      "Complete 5-item formative check";
    expect(isDlpDraftDirty(saved, editedStudentActivity)).toBe(true);

    const emptyLegacyDeclaration = structuredClone(saved);
    emptyLegacyDeclaration.aiDeclaration = "";
    expect(isDlpDraftDirty(saved, emptyLegacyDeclaration)).toBe(false);

    const editedDeclaration = structuredClone(saved);
    editedDeclaration.aiDeclaration =
      "Declaration of AI Use (DO 003, s. 2026 Annex A): Reviewed by teacher.";
    expect(isDlpDraftDirty(saved, editedDeclaration)).toBe(true);
  });
});

describe("isLeavingActiveLesson", () => {
  it("returns false when not editing a saved lesson or when toggling edit/markdown view on the same lesson", () => {
    expect(
      isLeavingActiveLesson({ workspace: "library" }, { workspace: "dll" }),
    ).toBe(false);
    expect(
      isLeavingActiveLesson({ workspace: "dll" }, { workspace: "library" }),
    ).toBe(false);
    expect(
      isLeavingActiveLesson(
        { workspace: "dll", lessonId: "dll-1", viewMode: "edit" },
        { workspace: "dll", lessonId: "dll-1", viewMode: "markdown" },
      ),
    ).toBe(false);
    expect(
      isLeavingActiveLesson(
        { workspace: "dlp", lessonId: "dlp-1", viewMode: "markdown" },
        { workspace: "dlp", lessonId: "dlp-1", viewMode: "edit" },
      ),
    ).toBe(false);
  });

  it("returns true when navigating away from an active saved DLL or DLP to Library, fresh Builder, another lesson, or another workspace", () => {
    expect(
      isLeavingActiveLesson(
        { workspace: "dll", lessonId: "dll-1", viewMode: "edit" },
        { workspace: "library" },
      ),
    ).toBe(true);
    expect(
      isLeavingActiveLesson(
        { workspace: "dll", lessonId: "dll-1", viewMode: "edit" },
        { workspace: "dll" },
      ),
    ).toBe(true);
    expect(
      isLeavingActiveLesson(
        { workspace: "dll", lessonId: "dll-1", viewMode: "edit" },
        { workspace: "dll", lessonId: "dll-2", viewMode: "edit" },
      ),
    ).toBe(true);
    expect(
      isLeavingActiveLesson(
        { workspace: "dlp", lessonId: "dlp-1", viewMode: "edit" },
        { workspace: "dll", lessonId: "dll-parent", viewMode: "edit" },
      ),
    ).toBe(true);
    expect(
      isLeavingActiveLesson(
        { workspace: "dlp", lessonId: "dlp-1", viewMode: "edit" },
        { workspace: "quiz" },
      ),
    ).toBe(true);
  });
});

describe("shouldResetCreationFormOnRouteChange", () => {
  it("returns true only when transitioning from an active lesson ID into create mode", () => {
    expect(shouldResetCreationFormOnRouteChange("dll-1", "create")).toBe(true);
    expect(shouldResetCreationFormOnRouteChange("dlp-42", "create")).toBe(true);
    expect(shouldResetCreationFormOnRouteChange(undefined, "create")).toBe(false);
    expect(shouldResetCreationFormOnRouteChange("   ", "create")).toBe(false);
    expect(shouldResetCreationFormOnRouteChange("dll-1", "open")).toBe(false);
    expect(shouldResetCreationFormOnRouteChange("dll-1", "loading")).toBe(false);
    expect(shouldResetCreationFormOnRouteChange("dll-1", "missing")).toBe(false);
  });
});

describe("createFreshDllCreationFormState", () => {
  it("builds a clean DLL creation state using the first saved Class Section", () => {
    const state = createFreshDllCreationFormState([
      { gradeLevel: 7, sectionName: "Rizal" },
      { gradeLevel: 8, sectionName: "Narra" },
    ]);

    expect(state).toEqual({
      lessonTitle: "",
      gradeAndSection: "Grade 7 - Rizal",
      references: "",
      classroomContext: {
        periodMinutes: 60,
        facility: "standard-classroom",
        modality: "face-to-face",
      },
      referenceSourceLabel: "",
      referenceText: "",
      promptNotes: "",
      sessionConfigs: createInitialDllSessionConfigs(),
      pickedCompetencyId: "",
    });
  });

  it("preserves an explicit DllLaunchTarget competency on Session 1", () => {
    const state = createFreshDllCreationFormState([], {
      competencyId: "g7-ict-q1-lc1",
    });

    expect(state.gradeAndSection).toBe("");
    expect(state.pickedCompetencyId).toBe("g7-ict-q1-lc1");
    expect(state.sessionConfigs[0]?.competencyIds).toEqual(["g7-ict-q1-lc1"]);
  });
});

describe("createFreshDlpCreationFormState", () => {
  it("resets DLP creation fields to scratch mode with default Class Section and DLL", () => {
    const state = createFreshDlpCreationFormState(
      [{ gradeLevel: 8, sectionName: "Narra" }],
      [{ id: "dll-1" }, { id: "dll-2" }],
    );

    expect(state).toEqual({
      builderMode: "scratch",
      deriveDllId: "dll-1",
      deriveSessionNumber: 1,
      lessonTitle: "",
      gradeAndSection: "Grade 8 - Narra",
      references: "",
      classroomContext: {
        periodMinutes: 60,
        facility: "standard-classroom",
        modality: "face-to-face",
      },
      referenceSourceLabel: "",
      referenceText: "",
      promptNotes: "",
      selectedCompetencyIds: [],
      pickedCompetencyId: "",
    });
  });

  it("preserves derive launchTarget without clobbering builderMode, parent DLL, or Session", () => {
    const state = createFreshDlpCreationFormState(
      [{ gradeLevel: 8, sectionName: "Narra" }],
      [{ id: "dll-1" }, { id: "dll-9" }],
      { mode: "derive", dllId: "dll-9", sessionNumber: 4 },
    );

    expect(state).toEqual({
      builderMode: "derive",
      deriveDllId: "dll-9",
      deriveSessionNumber: 4,
      lessonTitle: "",
      gradeAndSection: "Grade 8 - Narra",
      references: "",
      classroomContext: {
        periodMinutes: 60,
        facility: "standard-classroom",
        modality: "face-to-face",
      },
      referenceSourceLabel: "",
      referenceText: "",
      promptNotes: "",
      selectedCompetencyIds: [],
      pickedCompetencyId: "",
    });
  });

  it("preserves scratch launchTarget competency selection cleanly", () => {
    const state = createFreshDlpCreationFormState(
      [],
      [{ id: "dll-1" }],
      { mode: "scratch", competencyId: "g11-shs-core-q1-lc2" },
    );

    expect(state.builderMode).toBe("scratch");
    expect(state.selectedCompetencyIds).toEqual(["g11-shs-core-q1-lc2"]);
    expect(state.pickedCompetencyId).toBe("g11-shs-core-q1-lc2");
  });
});
