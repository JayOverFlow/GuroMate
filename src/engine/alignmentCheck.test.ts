import { describe, expect, it } from "vitest";
import {
  evaluateDllAlignment,
  evaluateDlpAlignment,
  extractSectionAllocatedMinutes,
} from "./alignmentCheck";
import type {
  DailyLessonLog,
  DailyLessonPlan,
  DllLessonBlueprint,
  DllSessionPlan,
} from "./types";

function makeCompliantDllSession(
  sessionNumber: 1 | 2 | 3 | 4 | 5,
  overrides: Partial<DllSessionPlan> = {},
): DllSessionPlan {
  return {
    sessionNumber,
    mode: "instructional",
    competencyIds: ["cg-g7-ict-q1-01"],
    components: ["ICT"],
    selectedActivityTitle: `ICT Station ${sessionNumber}`,
    selectedAssessmentType: "checklist",
    learningObjectives: [
      `• Identify key ICT sector roles for Session ${sessionNumber} with 90% accuracy.`,
      `• Demonstrate safe workstation inspection steps for Session ${sessionNumber}.`,
      `• Show responsible digital citizenship during group work in Session ${sessionNumber}.`,
    ].join("\n"),
    preLesson: `Pre-lesson activity: “Tech Check ${sessionNumber}” — Check learner well-being and share objectives.`,
    lessonFlow: `ICT Station ${sessionNumber}: Model steps, guide pairs through hands-on tasks, and invite reflection.`,
    learningResources:
      "• Slides and workstation checklist\n• Emergency/offline backup: Printed visual cards and chalkboard diagram",
    integrationAndContextualization:
      "Connect to local barangay computer shop operations.",
    formativeAssessment:
      "Observation / Skill Checklist measuring all 3 objectives. Learners raise green/yellow/red help cards to ask for guidance and teacher feedback. Accommodations: oral explanation option, small-group pairing, and visual cue cards.",
    extendedLearningOpportunities:
      "Interview a community worker about safe ICT tool habits.",
    reflections: "",
    ...overrides,
  };
}

function makeCompliantDll(overrides: Partial<DailyLessonLog> = {}): DailyLessonLog {
  return {
    id: "dll-test0001",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lessonTitle: "ICT Sectors and Safe Practices",
    learningAreas: "ICT",
    gradeAndSection: "Grade 7 - Rizal",
    references: "MATATAG TLE 7 ICT CG & BoW",
    classroomContext: {
      periodMinutes: 60,
      facility: "computer-lab",
      modality: "face-to-face",
    },
    promptNotes: "",
    intentions: {
      learningCompetencies: ["analyze the various sectors of ICT"],
      contentStandards: ["The learners demonstrate an understanding of ICT sectors."],
      performanceStandards: ["The learners convert number systems."],
      learnerContext: "",
    },
    sessions: [
      makeCompliantDllSession(1),
      makeCompliantDllSession(2),
      makeCompliantDllSession(3),
      makeCompliantDllSession(4),
      makeCompliantDllSession(5, {
        mode: "non-instructional",
        competencyIds: [],
        components: [],
        nonInstructionalReason: "School Holiday",
        learningObjectives: "School Holiday",
        preLesson: "",
        lessonFlow: "",
        learningResources: "",
        integrationAndContextualization: "",
        formativeAssessment: "",
        extendedLearningOpportunities: "",
      }),
    ],
    ...overrides,
  };
}

function makeCompliantDlp(overrides: Partial<DailyLessonPlan> = {}): DailyLessonPlan {
  return {
    id: "dlp-test0001",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    competencyIds: ["cg-g7-ict-q1-01"],
    lessonTitle: "2-Hour T568B Cable Crimping Lab",
    learningAreas: "ICT",
    gradeAndSection: "Grade 7 - Rizal",
    references: "MATATAG TLE 7 ICT CG & BoW",
    classroomContext: {
      periodMinutes: 120,
      facility: "computer-lab",
      modality: "face-to-face",
    },
    selectedActivityTitle: "Paired Workstation Crimping Lab",
    selectedAssessmentType: "demo-rubric",
    promptNotes: "",
    intentions: {
      learningCompetencies: ["analyze the various sectors of ICT"],
      contentStandards: ["The learners demonstrate an understanding of ICT sectors."],
      performanceStandards: ["The learners perform safe cable termination."],
      learningObjectives: [
        "• Identify the 8-wire T568B color sequence with 100% accuracy.",
        "• Terminate a straight-through RJ45 cable observing OHS/PPE checks.",
        "• Demonstrate cooperative safety habits during paired lab work.",
      ].join("\n"),
      learnerContext: "",
    },
    preLesson: {
      teacherActivity:
        "(15 min) Greet class, lead prayer, check attendance and learner well-being, present motivation hook, and share Learning Objectives verbatim.",
      studentActivity:
        "(15 min) Participate in routine, share well-being check-in, answer hook, and read objectives aloud.",
    },
    lessonFlow: {
      teacherActivity:
        "(85 min) Present T568B teaching points (20 min); guide questions and safety demonstration (15 min); supervise Paired Workstation Crimping Lab with OHS/PPE checks (40 min); facilitate share-back and synthesis (10 min).",
      studentActivity:
        "(85 min) Take notes, answer guide questions, wear safety eyewear, complete paired crimping steps, and share takeaways.",
    },
    learningResources: {
      teacherActivity:
        "• RJ45 crimping tool, LAN tester, slides\n• Emergency/offline backup: Printed color-code wall chart and chalkboard wiring diagram",
      studentActivity:
        "• UTP cable, RJ45 connectors, printed guide\n• Emergency/offline backup: Paper color-sequence strip cards",
    },
    integrationAndContextualization: {
      teacherActivity: "Connect to barangay internet café cabling standards.",
      studentActivity: "",
    },
    formativeAssessment: {
      teacherActivity:
        "(20 min) Performance / Demo Rubric scoring T568B accuracy, OHS/PPE compliance, and continuity test with scoring key. Circulate for ongoing feedback and respond to raised help cards. Accommodations: paired peer-assisted execution, visual pinout card, and oral explanation option.",
      studentActivity:
        "(20 min) Demonstrate cable testing using the rubric, raise help cards when seeking guidance, and use accommodations as needed.",
    },
    extendedLearningOpportunities: {
      teacherActivity: "Sketch a safe cable management plan for a home desk.",
      studentActivity: "",
    },
    reflections: {
      teacherActivity: "",
      studentActivity: "",
    },
    ...overrides,
  };
}

describe("DO 016 Deterministic Alignment Check", () => {
  it("passes all hard and soft checks for a compliant 5-Session DLL (ignoring non-instructional sessions)", () => {
    const dll = makeCompliantDll();
    const result = evaluateDllAlignment(dll);

    expect(result.structuralValid).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.autoRepaired).toBe(false);
    expect(result.items.every((item) => item.severity === "pass")).toBe(true);
    expect(result.items.map((item) => item.code)).toEqual([
      "structure",
      "objectives",
      "emergency-resources",
      "formative-support",
    ]);
  });

  it("flags hard structural completeness errors on DLL instructional sessions missing core ILAW sections", () => {
    const dll = makeCompliantDll();
    dll.sessions[1] = makeCompliantDllSession(2, {
      lessonFlow: "",
      formativeAssessment: "   ",
    });

    const result = evaluateDllAlignment(dll);

    expect(result.structuralValid).toBe(false);
    expect(result.passed).toBe(false);
    const structErrors = result.items.filter(
      (item) => item.code === "structure" && item.severity === "error",
    );
    expect(structErrors).toHaveLength(1);
    expect(structErrors[0]?.sessionNumber).toBe(2);
    expect(structErrors[0]?.message).toMatch(/Lesson Flow/i);
    expect(structErrors[0]?.message).toMatch(/Formative Assessment/i);
  });

  it("flags DLL soft DO 016 warnings for non-3-bullet or domain-prefixed objectives, blueprint drift, missing emergency backups, and missing formative feedback/accommodations", () => {
    const dll = makeCompliantDll();
    dll.sessions[0] = makeCompliantDllSession(1, {
      learningObjectives:
        "• Cognitive: Identify ICT sectors.\n• Psychomotor: Sort ICT jobs.",
      learningResources: "• Projector, PowerPoint slides, laptops",
      formativeAssessment: "Answer a 5-item multiple choice quiz.",
    });

    const blueprint: DllLessonBlueprint = {
      lessonTitle: dll.lessonTitle,
      references: dll.references,
      sessions: dll.sessions.map((s) => ({
        sessionNumber: s.sessionNumber,
        mode: s.mode,
        competencyIds: s.competencyIds,
        components: s.components,
        progressionFocus: "Stage",
        learningObjectives:
          s.sessionNumber === 1
            ? "• Explain ICT sectors.\n• Classify local ICT tools.\n• Value ethical ICT use."
            : s.learningObjectives,
        activityOptions: [],
        selectedActivityId: "",
        assessmentOptions: [],
      })) as unknown as DllLessonBlueprint["sessions"],
    };

    const result = evaluateDllAlignment(dll, { blueprint });

    expect(result.structuralValid).toBe(true);
    expect(result.passed).toBe(false);
    expect(
      result.items.some(
        (i) => i.code === "objectives" && i.severity === "warning" && /3/.test(i.message),
      ),
    ).toBe(true);
    expect(
      result.items.some(
        (i) =>
          i.code === "objectives" &&
          i.severity === "warning" &&
          /domain/i.test(i.message),
      ),
    ).toBe(true);
    expect(
      result.items.some(
        (i) =>
          i.code === "objectives" &&
          i.severity === "warning" &&
          /blueprint/i.test(i.message),
      ),
    ).toBe(true);
    expect(
      result.items.some(
        (i) =>
          i.code === "emergency-resources" &&
          i.severity === "warning" &&
          /Session 1/i.test(i.message),
      ),
    ).toBe(true);
    expect(
      result.items.some(
        (i) =>
          i.code === "formative-support" &&
          i.severity === "warning" &&
          /feedback|help-seeking/i.test(i.message),
      ),
    ).toBe(true);
    expect(
      result.items.some(
        (i) =>
          i.code === "formative-support" &&
          i.severity === "warning" &&
          /accommodation/i.test(i.message),
      ),
    ).toBe(true);
  });

  it("extracts DLP section allocated minutes accurately without double-counting outer totals and sub-phase sums", () => {
    expect(
      extractSectionAllocatedMinutes(
        "(15 min) Opening routine, well-being check, hook, and objectives.",
      ),
    ).toBe(15);
    expect(
      extractSectionAllocatedMinutes(
        "(85 min) Key points (20 min); demo (15 min); hands-on lab (40 min); synthesis (10 min).",
      ),
    ).toBe(85);
    expect(
      extractSectionAllocatedMinutes(
        "Phase 1: Mini-Lecture (10 min)\nPhase 2: Guided Lab (20 min)\nPhase 3: Synthesis (10 min)",
      ),
    ).toBe(40);
    expect(
      extractSectionAllocatedMinutes(
        "Guide learners during this 60-minute period without explicit tags.",
      ),
    ).toBeNull();
  });

  it("passes all hard and soft checks for a compliant 2-hour DLP with paired activities and blank student cells on Integration/Extended", () => {
    const dlp = makeCompliantDlp();
    const result = evaluateDlpAlignment(dlp);

    expect(result.structuralValid).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.items.every((item) => item.severity === "pass")).toBe(true);
    expect(result.items.map((item) => item.code)).toEqual([
      "structure",
      "objectives",
      "emergency-resources",
      "formative-support",
      "dlp-pacing",
    ]);
  });

  it("flags DLP hard structural error when paired Student's Activity or core section is missing", () => {
    const dlp = makeCompliantDlp({
      lessonFlow: {
        teacherActivity: "(85 min) Demonstrate wiring steps.",
        studentActivity: "",
      },
      extendedLearningOpportunities: {
        teacherActivity: "",
        studentActivity: "",
      },
    });

    const result = evaluateDlpAlignment(dlp);

    expect(result.structuralValid).toBe(false);
    expect(result.passed).toBe(false);
    const structErr = result.items.find(
      (i) => i.code === "structure" && i.severity === "error",
    );
    expect(structErr).toBeDefined();
    expect(structErr?.message).toMatch(/Lesson Flow \(Student's Activity\)/i);
    expect(structErr?.message).toMatch(/Extended Learning Opportunities/i);
  });

  it("flags DLP period-time mismatch and derived DLL -> DLP fidelity drift cleanly", () => {
    const parentSession = makeCompliantDllSession(2, {
      selectedActivityTitle: "Paired Workstation Crimping Lab",
      selectedAssessmentType: "demo-rubric",
    });

    const driftedDlp = makeCompliantDlp({
      sourceDllId: "dll-parent01",
      sourceSessionNumber: 2,
      classroomContext: {
        periodMinutes: 60,
        facility: "computer-lab",
        modality: "face-to-face",
      },
      selectedActivityTitle: "Unrelated Lecture Discussion",
      selectedAssessmentType: "short-quiz",
      intentions: {
        learningCompetencies: ["analyze the various sectors of ICT"],
        contentStandards: ["CS"],
        performanceStandards: ["PS"],
        learningObjectives: [
          "• Completely different objective one.",
          "• Completely different objective two.",
          "• Completely different objective three.",
        ].join("\n"),
        learnerContext: "",
      },
      preLesson: {
        teacherActivity: "(10 min) Routine and hook.",
        studentActivity: "(10 min) Respond.",
      },
      lessonFlow: {
        teacherActivity: "(25 min) Pure lecture on unrelated topic.",
        studentActivity: "(25 min) Listen to lecture.",
      },
      formativeAssessment: {
        teacherActivity:
          "(10 min) 5-item multiple-choice quiz with help cards and visual accommodations.",
        studentActivity: "(10 min) Answer quiz.",
      },
    });

    const result = evaluateDlpAlignment(driftedDlp, { parentSession });

    expect(result.structuralValid).toBe(true);
    expect(result.passed).toBe(false);
    const pacingWarn = result.items.find((i) => i.code === "dlp-pacing");
    expect(pacingWarn?.severity).toBe("warning");
    expect(pacingWarn?.message).toContain("45");
    expect(pacingWarn?.message).toContain("60");

    const fidelityWarn = result.items.find((i) => i.code === "dll-dlp-fidelity");
    expect(fidelityWarn?.severity).toBe("warning");
    expect(fidelityWarn?.message).toMatch(/Learning Objectives/i);
    expect(fidelityWarn?.message).toMatch(/Paired Workstation Crimping Lab/i);
    expect(fidelityWarn?.message).toMatch(/Performance \/ Demo Rubric/i);
  });
});
