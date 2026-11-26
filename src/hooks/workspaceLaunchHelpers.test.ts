import { describe, expect, it } from "vitest";
import {
  applyDllLaunchTarget,
  applyDlpLaunchTarget,
  applyQuizLaunchTarget,
  createInitialDllSessionConfigs,
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
