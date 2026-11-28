import {
  FORMATIVE_ASSESSMENT_LABELS,
  cleanObjectiveBullets,
  dedupeOrdered,
  formatClassroomContextPromptBlock,
  formatClassroomContextSummary,
  formatCompetencyLines,
  formatLearningAreas,
  formatReferenceMaterialPromptBlock,
  normalizeBlueprintActivityOptions,
  normalizeBlueprintAssessmentOptions,
  normalizeClassroomContext,
  normalizeReferenceMaterial,
  parseAiJsonObject,
  resolveLessonReferences,
} from "./lessonHelpers";
import {
  FORMATIVE_ASSESSMENT_TYPES,
  SESSION_NUMBERS,
  type ClassroomContext,
  type CurriculumCompetency,
  type DailyLessonLog,
  type DllLessonBlueprint,
  type DllSessionBlueprint,
  type DllSessionConfig,
  type DllSessionPlan,
  type FormativeAssessmentType,
  type PlanDllInput,
  type ReferenceMaterial,
  type SessionNumber,
  type TleComponent,
} from "./types";

export class DllValidationError extends Error {}
export class DllNotFoundError extends Error {}

/** Built-in DepEd DO 016, s. 2026 System Instructions for Step 1 DLL Lesson Blueprint planning. */
export const DLL_PLAN_SYSTEM_INSTRUCTION = `You are a Philippine DepEd MATATAG (Grades 7–12: TLE, Grade 12 Technical-Professional electives, and Grade 11 SHS Core) instructional design partner creating an editable 5-Session Lesson Blueprint grounded in DepEd Order No. 016, s. 2026 (ILAW Framework and the 7 Learning Design Principles), the MATATAG Instructional Design Framework (4Is: Inclusive, Ideational, Integrative, Innovative; 4Cs: Context, Connection, Collaboration, Creativity; 4Es: Engage, Explore, Experience, Empathize), and DepEd Order No. 8, s. 2015 (Classroom Assessment).

Core Planning Rules:
- Produce a clear, teacher-editable Lesson Blueprint—never full lesson prose—so the teacher reviews and approves key instructional decisions before full DLL generation (DO 016, s. 2026 & DO 003, s. 2026 teacher agency).
- Progressive Multi-Session Scaffolding: Whenever one Learning Competency spans multiple instructional Sessions, unpack it progressively across Sessions (e.g., Foundational Concepts → Guided Practice → Hands-on Application → Evaluation/Synthesis) so consecutive Sessions never repeat the same depth.
- Learning Objectives: For every instructional Session, propose exactly 3 bulleted SMART Learning Objectives (each line starting with "• ") ordered Cognitive → Psychomotor → Affective with measurable criteria. NEVER include domain-label prefixes ("Cognitive:", "Psychomotor:", "Affective:").
- Activity Options (Learning Experience): For every instructional Session, propose 2–3 concrete, classroom-realistic activity options fitting the Classroom Context (period length, facility/equipment, modality) and Reference Material. Actively adapt Budget of Work (BoW) Suggested Activities when provided ("source": "bow"); when BoW columns are absent or empty, design authentic MATATAG TLE / Grade 12 Tech-Pro / Grade 11 SHS Core alternatives ("source": "authentic"). Mark exactly ONE option "recommended": true.
- Formative Assessment Options (DO 8, s. 2015): For every instructional Session, provide ALL 5 Formative Assessment types ("exit-ticket", "checklist", "demo-rubric", "worksheet", "short-quiz"), each with a concise 1-line "preview" tailored to that Session's objectives. Mark exactly ONE best-fit option "recommended": true based on the Session's dominant performance/knowledge target (do not blindly default to a short quiz).
- Preserve non-instructional Sessions exactly as marked; do not invent instructional tasks for them.
- Respond ONLY with valid JSON matching the schema in the user prompt.`;

/** Built-in DepEd DO 016, s. 2026 / MATATAG ILAW Framework System Instructions for 5-Session DLL generation. */
export const DLL_SYSTEM_INSTRUCTION = `You are a Philippine DepEd MATATAG (Grades 7–12: TLE, Grade 12 Technical-Professional electives, and Grade 11 SHS Core) instructional designer generating a 5-Session Daily Lesson Log (DLL) strictly anchored on DepEd Order No. 016, s. 2026 (ILAW Framework and the seven Learning Design Principles), the MATATAG Instructional Design Framework (IDF: 4Is — Inclusive, Ideational, Integrative, Innovative; 4Cs — Context, Connection, Collaboration, Creativity; 4Es — Engage, Explore, Experience, Empathize), and DepEd Order No. 8, s. 2015 (Classroom Assessment).

Core Rules:
- Use strict ILAW Framework terminology (Intentions, Learning Experience, Assessing Learning, Ways Forward). Never use 4As, 5Es, or DepEd DO 42 headers.
- Apply relevant DO 016 Learning Design Principles naturally across Sessions: (1) make objectives clear for learners, (2) guide learners before independent practice, (3) check learners' well-being, understanding, and mastery, (4) connect new concepts to past competencies, (5) encourage collaboration, (6) invite reflection on relevance, and (7) ensure inclusion for varied abilities, learning styles, and contexts.
- Ground every instructional Session in Philippine Grades 7–12 classroom authenticity (DepEd MATATAG TLE, Grade 12 Technical-Professional electives, and Grade 11 SHS Core): hands-on and collaborative tasks, OSH/PPE safety practices where relevant, Philippine localization, Classroom Context constraints, Reference Material facts/procedures, and alignment with the Curriculum Guide and Budget of Work (BoW).
- Progressive Multi-Session Scaffolding: When one Learning Competency spans multiple Sessions, scaffold depth progressively across Sessions (foundational concepts → guided practice → hands-on application → performance/synthesis) so consecutive Sessions never repeat the same depth.
- Budget of Work Adaptation & Authentic Fallback: Actively adapt BoW Suggested Activities into Learning Experience and BoW Suggested Performance Tasks into Assessing Learning and/or Ways Forward when present. When a BoW record leaves Suggested Activities or Suggested Performance Tasks empty, design authentic MATATAG TLE or SHS Core tasks fitted to Classroom Context.
- Strict Approved Lesson Blueprint Locking: Whenever an Approved Lesson Blueprint is supplied in the user prompt, strictly preserve its approved Learning Objectives verbatim, build Lesson Flow around the teacher's chosen Learning Experience activity, and build Formative Assessment using the teacher's chosen Formative Assessment type and preview.
- 1-to-1 Constructive Alignment: Every Learning Objective must be explicitly taught in Learning Experience and directly measured in Formative Assessment.
- Omit Learner Context and Reflections completely (both remain blank for manual teacher completion). Never copy Classroom Context, Reference Material, or Prompt Notes into Learner Context.
- Respect per-lesson teacher Prompt Notes (such as localized scenarios or specific classroom constraints).
- For non-instructional Sessions, follow the user prompt's brief note rule.
- Respond ONLY with valid JSON matching the schema in the user prompt.

Section Formatting Rules for Every Instructional Session:
- Learning Objectives: Always write 3 bulleted SMART objectives (each starting with "• " on its own line) ordered Cognitive → Psychomotor → Affective with measurable criteria. Do not include domain-label prefixes (no "Cognitive:", "Psychomotor:", or "Affective:"). When an Approved Lesson Blueprint is provided, copy its approved objectives verbatim.
- Pre-Lesson: Start with a titled hook in the format Pre-lesson activity: “<Title>” followed by 1–2 concise sentences checking readiness/well-being, activating prior knowledge, and making the objectives clear.
- Lesson Flow: Start with a short activity title (matching the Approved Lesson Blueprint's chosen activity when provided) followed by 2–3 concise sentences weaving relevant DO 016 Learning Design Principles and MATATAG IDF (4Is/4Cs/4Es) from teacher modeling/guidance into collaborative or hands-on practice.
- Learning Resources: Write a short "• " bulleted list of available, inclusive primary classroom/shop materials PLUS an explicit emergency/offline alternative (e.g., print/chalkboard/no-power backup for Education in Emergencies readiness).
- Opportunities for Integration and Contextualization: Write 1 concise Philippine, cross-disciplinary, or technology connection, or "N/A" if none fits naturally.
- Formative Assessment: Follow DepEd Order No. 8, s. 2015 with varied objective-aligned formats (matching the Approved Lesson Blueprint's chosen type—Exit Ticket, Observation / Skill Checklist, Performance / Demo Rubric, Activity Worksheet, or Short Quiz—when provided, or selecting the best fit for the objectives when no blueprint is provided). Explicitly include (a) direct alignment to all 3 Learning Objectives, (b) ways for learners to ask for guidance/help-seeking and receive ongoing feedback, and (c) appropriate learner accommodations (e.g., varied response formats, small-group options, visual/auditory supports).
- Extended Learning Opportunities: Write 1 concise, practical out-of-class activity for home or community (drawing on BoW Suggested Performance Tasks where fitting).`;

interface AiSessionPayload {
  sessionNumber?: number;
  learningObjectives?: string;
  preLesson?: string;
  lessonFlow?: string;
  learningResources?: string;
  integrationAndContextualization?: string;
  formativeAssessment?: string;
  extendedLearningOpportunities?: string;
}

interface AiDllPayload {
  lessonTitle?: string;
  references?: string;
  sessions?: AiSessionPayload[];
}

interface AiBlueprintSessionPayload {
  sessionNumber?: number;
  progressionFocus?: string;
  learningObjectives?: string;
  activityOptions?: unknown;
  assessmentOptions?: unknown;
  recommendedAssessmentType?: unknown;
}

interface AiDllBlueprintPayload {
  lessonTitle?: string;
  references?: string;
  sessions?: AiBlueprintSessionPayload[];
}

interface SessionProgressionCue {
  summaryLabel: string;
  promptLines: string[];
  defaultAssessmentType: FormativeAssessmentType;
}

function describeProgressionStage(part: number, total: number): {
  stage: string;
  guidance: string;
  defaultAssessmentType: FormativeAssessmentType;
} {
  if (total <= 1) {
    return {
      stage: "Focused Single-Session Mastery",
      guidance:
        "Introduce core concepts, guide collaborative practice, and verify applied mastery within this Session.",
      defaultAssessmentType: "exit-ticket",
    };
  }
  if (total === 2) {
    return part === 1
      ? {
          stage: "Foundational Concepts & Guided Practice",
          guidance:
            "Build conceptual understanding, key vocabulary/tools, and teacher-guided practice.",
          defaultAssessmentType: "exit-ticket",
        }
      : {
          stage: "Hands-on Application & Synthesis",
          guidance:
            "Advance from Session 1 into independent or collaborative hands-on performance and synthesis.",
          defaultAssessmentType: "demo-rubric",
        };
  }
  if (part === 1) {
    return {
      stage: "Foundational Concepts & Orientation",
      guidance:
        "Establish foundational knowledge, safety/tool familiarity, and initial exploration.",
      defaultAssessmentType: "exit-ticket",
    };
  }
  if (part === total) {
    return {
      stage: "Independent Performance, Evaluation & Synthesis",
      guidance:
        "Culminate with authentic hands-on performance, peer/teacher evaluation, and reflection.",
      defaultAssessmentType: "demo-rubric",
    };
  }
  if (part === 2) {
    return {
      stage: "Guided Practice & Skill Building",
      guidance:
        "Build on prior Session concepts through modeled procedures and scaffolded pair/group practice.",
      defaultAssessmentType: "checklist",
    };
  }
  return {
    stage: "Applied Hands-on Practice & Refinement",
    guidance:
      "Deepen fluency through applied TLE/SHS tasks, troubleshooting, and guided refinement before culminating performance.",
    defaultAssessmentType: "worksheet",
  };
}

function computeSessionProgressionCues(
  orderedConfigs: DllSessionConfig[],
  sessionCompetencies: Map<SessionNumber, CurriculumCompetency[]>,
): Map<SessionNumber, SessionProgressionCue> {
  const occurrences = new Map<string, SessionNumber[]>();
  for (const cfg of orderedConfigs) {
    if (cfg.mode !== "instructional") continue;
    const comps = sessionCompetencies.get(cfg.sessionNumber) ?? [];
    for (const comp of comps) {
      const list = occurrences.get(comp.id) ?? [];
      list.push(cfg.sessionNumber);
      occurrences.set(comp.id, list);
    }
  }

  const cues = new Map<SessionNumber, SessionProgressionCue>();
  for (const cfg of orderedConfigs) {
    if (cfg.mode !== "instructional") continue;
    const comps = sessionCompetencies.get(cfg.sessionNumber) ?? [];
    const promptLines: string[] = [];
    let summaryLabel = comps[0]?.contentTopic.trim() || "Session Mastery";
    let defaultAssessmentType: FormativeAssessmentType = "exit-ticket";

    for (const comp of comps) {
      const sessionsForComp = occurrences.get(comp.id) ?? [cfg.sessionNumber];
      const total = sessionsForComp.length;
      const part = sessionsForComp.indexOf(cfg.sessionNumber) + 1;
      const stageInfo = describeProgressionStage(part, total);
      if (total > 1) {
        promptLines.push(
          `  Multi-Session Progression: Part ${part} of ${total} for "${comp.learningCompetency}" — ${stageInfo.stage}. ${stageInfo.guidance}`,
        );
        summaryLabel = `Part ${part} of ${total}: ${stageInfo.stage}`;
        defaultAssessmentType = stageInfo.defaultAssessmentType;
      } else {
        summaryLabel = `${comp.contentTopic.trim() || "Core Competency"} — ${stageInfo.stage}`;
      }

      const hasBowActivities = Boolean(
        comp.budgetOfWork?.suggestedActivities.trim(),
      );
      if (!hasBowActivities) {
        promptLines.push(
          `  BoW Fallback Note: "${comp.contentTopic}" has no Budget of Work Suggested Activities; design authentic MATATAG/TLE or SHS Core alternatives realistic for the Classroom Context.`,
        );
      }
    }

    cues.set(cfg.sessionNumber, {
      summaryLabel,
      promptLines,
      defaultAssessmentType,
    });
  }

  return cues;
}

/** Validates 5-session config and resolves Curriculum Guide competencies per session. */
export function resolveDllSessions(
  input: PlanDllInput,
  competencyMap: Map<string, CurriculumCompetency>,
): {
  gradeAndSection: string;
  orderedConfigs: DllSessionConfig[];
  sessionCompetencies: Map<SessionNumber, CurriculumCompetency[]>;
  components: TleComponent[];
  learningCompetencies: string[];
  contentStandards: string[];
  performanceStandards: string[];
} {
  const gradeAndSection = input.gradeAndSection.trim();
  if (!gradeAndSection) {
    throw new DllValidationError("Grade Level and Section is required.");
  }

  if (!Array.isArray(input.sessions) || input.sessions.length !== 5) {
    throw new DllValidationError(
      "Exactly 5 Sessions (Session 1 through Session 5) are required.",
    );
  }

  const bySession = new Map<SessionNumber, DllSessionConfig>();
  for (const cfg of input.sessions) {
    if (!SESSION_NUMBERS.includes(cfg.sessionNumber)) {
      throw new DllValidationError(
        `Invalid Session number: ${String(cfg.sessionNumber)}.`,
      );
    }
    if (bySession.has(cfg.sessionNumber)) {
      throw new DllValidationError(
        `Duplicate configuration for Session ${cfg.sessionNumber}.`,
      );
    }
    bySession.set(cfg.sessionNumber, cfg);
  }

  const orderedConfigs = SESSION_NUMBERS.map((n) => bySession.get(n)!);
  const sessionCompetencies = new Map<SessionNumber, CurriculumCompetency[]>();
  const allComponents: TleComponent[] = [];
  const allCompetencies: string[] = [];
  const allContentStandards: string[] = [];
  const allPerformanceStandards: string[] = [];

  let instructionalCount = 0;
  for (const cfg of orderedConfigs) {
    if (cfg.mode === "non-instructional") {
      sessionCompetencies.set(cfg.sessionNumber, []);
      continue;
    }

    const ids = dedupeOrdered(cfg.competencyIds.map((id) => id.trim()).filter(Boolean));
    if (ids.length === 0) {
      throw new DllValidationError(
        `Session ${cfg.sessionNumber} must assign at least one Learning Competency or be marked non-instructional.`,
      );
    }
    instructionalCount += 1;

    const resolved: CurriculumCompetency[] = [];
    for (const id of ids) {
      const comp = competencyMap.get(id);
      if (!comp) {
        throw new DllValidationError(
          `Learning Competency not found for Session ${cfg.sessionNumber}: ${id}`,
        );
      }
      resolved.push(comp);
      allComponents.push(comp.component);
      allCompetencies.push(comp.learningCompetency);
      allContentStandards.push(comp.contentStandard);
      allPerformanceStandards.push(comp.performanceStandard);
    }
    sessionCompetencies.set(cfg.sessionNumber, resolved);
  }

  if (instructionalCount === 0) {
    throw new DllValidationError(
      "At least one Session must be instructional with a Learning Competency.",
    );
  }

  return {
    gradeAndSection,
    orderedConfigs,
    sessionCompetencies,
    components: dedupeOrdered(allComponents),
    learningCompetencies: dedupeOrdered(allCompetencies),
    contentStandards: dedupeOrdered(allContentStandards),
    performanceStandards: dedupeOrdered(allPerformanceStandards),
  };
}

/** Builds the Step 1 Lesson Blueprint planning prompt for a 5-Session DLL. */
export function buildDllPlanPrompt(params: {
  lessonTitle?: string;
  gradeAndSection: string;
  learningAreas: string;
  references?: string;
  classroomContext?: ClassroomContext;
  referenceMaterial?: ReferenceMaterial;
  promptNotes?: string;
  orderedConfigs: DllSessionConfig[];
  sessionCompetencies: Map<SessionNumber, CurriculumCompetency[]>;
}): string {
  const progressionCues = computeSessionProgressionCues(
    params.orderedConfigs,
    params.sessionCompetencies,
  );

  const sessionLines = params.orderedConfigs.map((cfg) => {
    if (cfg.mode === "non-instructional") {
      const reason =
        cfg.nonInstructionalReason?.trim() || "Non-instructional / Holiday";
      return `Session ${cfg.sessionNumber}: NON-INSTRUCTIONAL (${reason}). Preserve as non-instructional without instructional tasks.`;
    }
    const comps = params.sessionCompetencies.get(cfg.sessionNumber) ?? [];
    const compDetails = formatCompetencyLines(comps);
    const cueLines = progressionCues.get(cfg.sessionNumber)?.promptLines ?? [];
    return [
      `Session ${cfg.sessionNumber} (Instructional):`,
      compDetails,
      ...cueLines,
    ]
      .filter(Boolean)
      .join("\n");
  });

  const classroomContextBlock = formatClassroomContextPromptBlock(
    params.classroomContext,
  );
  const referenceMaterialBlock = formatReferenceMaterialPromptBlock(
    params.referenceMaterial,
  );
  const promptNotes = params.promptNotes?.trim();

  return [
    "Create an editable 5-Session Lesson Blueprint for a DepEd MATATAG Daily Lesson Log (DLL) aligned with DepEd Order No. 016, s. 2026 (ILAW Framework + 7 Learning Design Principles), MATATAG IDF (4Is/4Cs/4Es), and DepEd Order No. 8, s. 2015.",
    `Learning Area/s: ${params.learningAreas}`,
    `Grade Level and Section: ${params.gradeAndSection}`,
    params.lessonTitle?.trim()
      ? `Requested Lesson Title: ${params.lessonTitle.trim()}`
      : "",
    params.references?.trim()
      ? `Requested References: ${params.references.trim()}`
      : "",
    classroomContextBlock,
    referenceMaterialBlock,
    promptNotes
      ? `Teacher Prompt Notes (extra instructions beyond Classroom Context; never copy into Learner Context):\n${promptNotes}`
      : "",
    "",
    "Session Assignments & Multi-Session Progression:",
    sessionLines.join("\n\n"),
    "",
    "Respond ONLY with valid JSON matching this schema:",
    JSON.stringify(
      {
        lessonTitle: "string",
        references: "string",
        sessions: [
          {
            sessionNumber: 1,
            progressionFocus: "string (short focus label for this session's scaffolding stage)",
            learningObjectives:
              "• <Cognitive SMART objective>\\n• <Psychomotor SMART objective>\\n• <Affective SMART objective>",
            activityOptions: [
              {
                id: "s1-act-1",
                title: "string",
                summary: "1-sentence concrete classroom/lab activity description",
                source: "bow | authentic",
                recommended: true,
              },
              {
                id: "s1-act-2",
                title: "string",
                summary: "1-sentence alternative concrete activity",
                source: "authentic",
                recommended: false,
              },
            ],
            assessmentOptions: FORMATIVE_ASSESSMENT_TYPES.map((type, idx) => ({
              type,
              preview: "1-line concrete preview tailored to this session's objectives",
              recommended: idx === 0,
            })),
          },
        ],
      },
      null,
      2,
    ),
    "Include every instructional Session (and omit or leave empty non-instructional Sessions). Mark exactly ONE activityOption and ONE assessmentOption as recommended: true per instructional Session.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Parses structured Lesson Blueprint JSON from the AI adapter. */
export function parseAiDllBlueprintPayload(
  rawText: string,
): AiDllBlueprintPayload {
  return parseAiJsonObject(
    rawText,
    "Daily Lesson Log Blueprint",
    (msg) => new DllValidationError(msg),
  ) as AiDllBlueprintPayload;
}

/** Assembles and normalizes a 5-session Lesson Blueprint guaranteeing all contract invariants. */
export function assembleDllBlueprint(params: {
  input: PlanDllInput;
  learningAreas: string;
  gradeAndSection: string;
  orderedConfigs: DllSessionConfig[];
  sessionCompetencies: Map<SessionNumber, CurriculumCompetency[]>;
  aiPayload: AiDllBlueprintPayload;
}): DllLessonBlueprint {
  const aiBySession = new Map<number, AiBlueprintSessionPayload>();
  if (Array.isArray(params.aiPayload.sessions)) {
    for (const entry of params.aiPayload.sessions) {
      if (typeof entry.sessionNumber === "number") {
        aiBySession.set(entry.sessionNumber, entry);
      }
    }
  }

  const progressionCues = computeSessionProgressionCues(
    params.orderedConfigs,
    params.sessionCompetencies,
  );

  const selectedCompetencies = params.orderedConfigs.flatMap(
    (cfg) => params.sessionCompetencies.get(cfg.sessionNumber) ?? [],
  );

  const fallbackTitle = `${params.learningAreas} (${params.gradeAndSection})`;
  const lessonTitle =
    params.input.lessonTitle?.trim() ||
    (typeof params.aiPayload.lessonTitle === "string" &&
      params.aiPayload.lessonTitle.trim()) ||
    fallbackTitle;

  const references = resolveLessonReferences(
    params.input.references,
    params.aiPayload.references,
    selectedCompetencies,
  );

  const sessions = params.orderedConfigs.map((cfg): DllSessionBlueprint => {
    const comps = params.sessionCompetencies.get(cfg.sessionNumber) ?? [];
    const components = dedupeOrdered(comps.map((c) => c.component));

    if (cfg.mode === "non-instructional") {
      const reason =
        cfg.nonInstructionalReason?.trim() || "Non-instructional / Holiday";
      return {
        sessionNumber: cfg.sessionNumber,
        mode: "non-instructional",
        competencyIds: [],
        components: [],
        nonInstructionalReason: reason,
        progressionFocus: "",
        learningObjectives: "",
        activityOptions: [],
        selectedActivityId: "",
        assessmentOptions: [],
      };
    }

    const ai = aiBySession.get(cfg.sessionNumber) ?? {};
    const cue = progressionCues.get(cfg.sessionNumber);
    const progressionFocus =
      (typeof ai.progressionFocus === "string" && ai.progressionFocus.trim()) ||
      cue?.summaryLabel ||
      "Session Mastery";

    const rawObjectives =
      typeof ai.learningObjectives === "string"
        ? cleanObjectiveBullets(ai.learningObjectives)
        : "";
    const primaryTopic = comps[0]?.contentTopic.trim() || "the target topic";
    const learningObjectives =
      rawObjectives ||
      [
        `• Explain the core concepts and principles of ${primaryTopic} accurately.`,
        `• Demonstrate a guided practical task applying ${primaryTopic} following safety standards.`,
        `• Express appreciation for responsible, collaborative practices in ${primaryTopic}.`,
      ].join("\n");

    const normalizedActivities = normalizeBlueprintActivityOptions({
      rawOptions: ai.activityOptions,
      idPrefix: `s${cfg.sessionNumber}`,
      competencies: comps,
    });

    const normalizedAssessments = normalizeBlueprintAssessmentOptions({
      rawOptions: ai.assessmentOptions,
      recommendedTypeHint: ai.recommendedAssessmentType,
      competencies: comps,
      defaultRecommended: cue?.defaultAssessmentType ?? "exit-ticket",
    });

    return {
      sessionNumber: cfg.sessionNumber,
      mode: "instructional",
      competencyIds: comps.map((c) => c.id),
      components,
      progressionFocus,
      learningObjectives,
      activityOptions: normalizedActivities.options,
      selectedActivityId: normalizedActivities.selectedActivityId,
      assessmentOptions: normalizedAssessments.options,
      selectedAssessmentType: normalizedAssessments.selectedAssessmentType,
    };
  }) as DllLessonBlueprint["sessions"];

  return {
    lessonTitle,
    references,
    sessions,
  };
}

function resolveBlueprintSessionSelections(bp: DllSessionBlueprint | undefined): {
  progressionFocus?: string;
  learningObjectives?: string;
  selectedActivityTitle?: string;
  selectedActivitySummary?: string;
  selectedAssessmentType?: FormativeAssessmentType;
  selectedAssessmentLabel?: string;
  selectedAssessmentPreview?: string;
} {
  if (!bp || bp.mode !== "instructional") return {};
  const activity =
    bp.activityOptions.find((opt) => opt.id === bp.selectedActivityId) ??
    bp.activityOptions.find((opt) => opt.recommended) ??
    bp.activityOptions[0];

  const chosenType =
    bp.selectedAssessmentType &&
    FORMATIVE_ASSESSMENT_TYPES.includes(bp.selectedAssessmentType)
      ? bp.selectedAssessmentType
      : (bp.assessmentOptions.find((opt) => opt.recommended)?.type ??
        bp.assessmentOptions[0]?.type);

  const assessment = chosenType
    ? bp.assessmentOptions.find((opt) => opt.type === chosenType)
    : undefined;

  const progressionFocus = bp.progressionFocus.trim() || undefined;
  const learningObjectives = bp.learningObjectives.trim()
    ? cleanObjectiveBullets(bp.learningObjectives)
    : undefined;
  const selectedActivityTitle = activity?.title.trim() || undefined;
  const selectedActivitySummary = activity?.summary.trim() || undefined;
  const selectedAssessmentType = chosenType;
  const selectedAssessmentLabel = chosenType
    ? (assessment?.label.trim() || FORMATIVE_ASSESSMENT_LABELS[chosenType])
    : undefined;
  const selectedAssessmentPreview = assessment?.preview.trim() || undefined;

  return {
    ...(progressionFocus ? { progressionFocus } : {}),
    ...(learningObjectives ? { learningObjectives } : {}),
    ...(selectedActivityTitle ? { selectedActivityTitle } : {}),
    ...(selectedActivitySummary ? { selectedActivitySummary } : {}),
    ...(selectedAssessmentType ? { selectedAssessmentType } : {}),
    ...(selectedAssessmentLabel ? { selectedAssessmentLabel } : {}),
    ...(selectedAssessmentPreview ? { selectedAssessmentPreview } : {}),
  };
}

/** Builds the AI generation prompt combining Curriculum Guide, Budget of Work, Classroom Context, Reference Material, Approved Lesson Blueprint, and Prompt Notes. */
export function buildDllPrompt(params: {
  lessonTitle?: string;
  gradeAndSection: string;
  learningAreas: string;
  references?: string;
  classroomContext?: ClassroomContext;
  referenceMaterial?: ReferenceMaterial;
  promptNotes?: string;
  orderedConfigs: DllSessionConfig[];
  sessionCompetencies: Map<SessionNumber, CurriculumCompetency[]>;
  blueprint?: DllLessonBlueprint;
}): string {
  const progressionCues = computeSessionProgressionCues(
    params.orderedConfigs,
    params.sessionCompetencies,
  );
  const blueprintBySession = new Map<SessionNumber, DllSessionBlueprint>();
  if (params.blueprint) {
    for (const bpSession of params.blueprint.sessions) {
      blueprintBySession.set(bpSession.sessionNumber, bpSession);
    }
  }

  const sessionLines = params.orderedConfigs.map((cfg) => {
    if (cfg.mode === "non-instructional") {
      const reason =
        cfg.nonInstructionalReason?.trim() || "Non-instructional / Holiday";
      return `Session ${cfg.sessionNumber}: NON-INSTRUCTIONAL (${reason}). Leave instructional fields brief or note "${reason}".`;
    }
    const comps = params.sessionCompetencies.get(cfg.sessionNumber) ?? [];
    const compDetails = formatCompetencyLines(comps);
    const cueLines = progressionCues.get(cfg.sessionNumber)?.promptLines ?? [];
    const bpSel = resolveBlueprintSessionSelections(
      blueprintBySession.get(cfg.sessionNumber),
    );
    const bpLines =
      params.blueprint && Object.keys(bpSel).length > 0
        ? [
            "  Approved Lesson Blueprint (LOCKED — follow strictly):",
            bpSel.progressionFocus
              ? `    Progression Focus: ${bpSel.progressionFocus}`
              : "",
            bpSel.learningObjectives
              ? `    Approved Learning Objectives (copy verbatim):\n${bpSel.learningObjectives}`
              : "",
            bpSel.selectedActivityTitle
              ? `    Chosen Learning Experience Activity: ${bpSel.selectedActivityTitle}${bpSel.selectedActivitySummary ? ` — ${bpSel.selectedActivitySummary}` : ""}`
              : "",
            bpSel.selectedAssessmentLabel
              ? `    Chosen Formative Assessment (${bpSel.selectedAssessmentType}): ${bpSel.selectedAssessmentLabel}${bpSel.selectedAssessmentPreview ? ` — ${bpSel.selectedAssessmentPreview}` : ""}`
              : "",
          ].filter(Boolean)
        : [];
    return [
      `Session ${cfg.sessionNumber} (Instructional):`,
      compDetails,
      ...cueLines,
      ...bpLines,
    ]
      .filter(Boolean)
      .join("\n");
  });

  const classroomContextBlock = formatClassroomContextPromptBlock(
    params.classroomContext,
  );
  const referenceMaterialBlock = formatReferenceMaterialPromptBlock(
    params.referenceMaterial,
  );
  const promptNotes = params.promptNotes?.trim();
  const effectiveTitle =
    params.blueprint?.lessonTitle.trim() || params.lessonTitle?.trim() || "";
  const effectiveRefs =
    params.blueprint?.references.trim() || params.references?.trim() || "";

  return [
    "Generate a 5-Session DepEd MATATAG (Grades 7–12: TLE, Grade 12 Technical-Professional electives, and Grade 11 SHS Core) Daily Lesson Log (DLL) following DepEd Order No. 016, s. 2026 (ILAW Framework + 7 Learning Design Principles), MATATAG IDF (4Is/4Cs/4Es), and DepEd Order No. 8, s. 2015.",
    `Learning Area/s: ${params.learningAreas}`,
    `Grade Level and Section: ${params.gradeAndSection}`,
    effectiveTitle ? `Requested Lesson Title: ${effectiveTitle}` : "",
    effectiveRefs ? `Requested References: ${effectiveRefs}` : "",
    classroomContextBlock,
    referenceMaterialBlock,
    promptNotes
      ? `Teacher Prompt Notes (extra instructions beyond Classroom Context; never copy into Learner Context):\n${promptNotes}`
      : "",
    params.blueprint
      ? "IMPORTANT: An Approved Lesson Blueprint is attached per instructional Session below. Strictly lock Learning Objectives, Lesson Flow activity, and Formative Assessment type to the teacher's approved choices."
      : "",
    "",
    "Session Assignments:",
    sessionLines.join("\n\n"),
    "",
    "Respond ONLY with valid JSON matching this schema:",
    JSON.stringify(
      {
        lessonTitle: "string",
        references: "string",
        sessions: [
          {
            sessionNumber: 1,
            learningObjectives: "string",
            preLesson: "string",
            lessonFlow: "string",
            learningResources: "string",
            integrationAndContextualization: "string",
            formativeAssessment: "string",
            extendedLearningOpportunities: "string",
          },
        ],
      },
      null,
      2,
    ),
    "Include all 5 sessions (sessionNumber 1 to 5). Do not include Learner Context or Reflections.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Parses structured JSON from the AI adapter, stripping optional code fences. */
export function parseAiDllPayload(rawText: string): AiDllPayload {
  return parseAiJsonObject(
    rawText,
    "Daily Lesson Log",
    (msg) => new DllValidationError(msg),
  ) as AiDllPayload;
}

/** Builds normalized 5-session plans from AI output, locking approved blueprint choices and keeping Reflections and Learner Context blank. */
export function assembleGeneratedSessions(
  orderedConfigs: DllSessionConfig[],
  sessionCompetencies: Map<SessionNumber, CurriculumCompetency[]>,
  aiSessions: AiSessionPayload[] | undefined,
  blueprint?: DllLessonBlueprint,
): [DllSessionPlan, DllSessionPlan, DllSessionPlan, DllSessionPlan, DllSessionPlan] {
  const aiBySession = new Map<number, AiSessionPayload>();
  if (Array.isArray(aiSessions)) {
    for (const entry of aiSessions) {
      if (typeof entry.sessionNumber === "number") {
        aiBySession.set(entry.sessionNumber, entry);
      }
    }
  }

  const bpBySession = new Map<SessionNumber, DllSessionBlueprint>();
  if (blueprint) {
    for (const bpSession of blueprint.sessions) {
      bpBySession.set(bpSession.sessionNumber, bpSession);
    }
  }

  const plans = orderedConfigs.map((cfg) => {
    const comps = sessionCompetencies.get(cfg.sessionNumber) ?? [];
    const components = dedupeOrdered(comps.map((c) => c.component));
    if (cfg.mode === "non-instructional") {
      const reason = cfg.nonInstructionalReason?.trim() || "Non-instructional / Holiday";
      return {
        sessionNumber: cfg.sessionNumber,
        mode: "non-instructional" as const,
        competencyIds: [],
        components: [],
        nonInstructionalReason: reason,
        learningObjectives: reason,
        preLesson: "",
        lessonFlow: "",
        learningResources: "",
        integrationAndContextualization: "",
        formativeAssessment: "",
        extendedLearningOpportunities: "",
        reflections: "",
      };
    }

    const ai = aiBySession.get(cfg.sessionNumber) ?? {};
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const bpSel = resolveBlueprintSessionSelections(
      bpBySession.get(cfg.sessionNumber),
    );
    return {
      sessionNumber: cfg.sessionNumber,
      mode: "instructional" as const,
      competencyIds: comps.map((c) => c.id),
      components,
      ...(bpSel.progressionFocus
        ? { progressionFocus: bpSel.progressionFocus }
        : {}),
      ...(bpSel.selectedActivityTitle
        ? { selectedActivityTitle: bpSel.selectedActivityTitle }
        : {}),
      ...(bpSel.selectedActivitySummary
        ? { selectedActivitySummary: bpSel.selectedActivitySummary }
        : {}),
      ...(bpSel.selectedAssessmentType
        ? { selectedAssessmentType: bpSel.selectedAssessmentType }
        : {}),
      ...(bpSel.selectedAssessmentPreview
        ? { selectedAssessmentPreview: bpSel.selectedAssessmentPreview }
        : {}),
      learningObjectives:
        bpSel.learningObjectives || str(ai.learningObjectives),
      preLesson: str(ai.preLesson),
      lessonFlow: str(ai.lessonFlow),
      learningResources: str(ai.learningResources),
      integrationAndContextualization: str(ai.integrationAndContextualization),
      formativeAssessment: str(ai.formativeAssessment),
      extendedLearningOpportunities: str(ai.extendedLearningOpportunities),
      reflections: "",
    };
  });

  return plans as [
    DllSessionPlan,
    DllSessionPlan,
    DllSessionPlan,
    DllSessionPlan,
    DllSessionPlan,
  ];
}

/** Normalizes and validates an edited Daily Lesson Log before persistence. */
export function normalizeEditedDll(dll: DailyLessonLog): DailyLessonLog {
  const lessonTitle = dll.lessonTitle.trim();
  if (!lessonTitle) {
    throw new DllValidationError("Lesson Title is required.");
  }
  const learningAreas = dll.learningAreas.trim();
  if (!learningAreas) {
    throw new DllValidationError("Learning Area/s is required.");
  }
  const gradeAndSection = dll.gradeAndSection.trim();
  if (!gradeAndSection) {
    throw new DllValidationError("Grade Level and Section is required.");
  }
  if (!Array.isArray(dll.sessions) || dll.sessions.length !== 5) {
    throw new DllValidationError("Exactly 5 Sessions are required.");
  }
  const sessions = dll.sessions.map((s, idx) => ({
    ...s,
    sessionNumber: SESSION_NUMBERS[idx]!,
    learningObjectives: s.learningObjectives.trim(),
    preLesson: s.preLesson.trim(),
    lessonFlow: s.lessonFlow.trim(),
    learningResources: s.learningResources.trim(),
    integrationAndContextualization: s.integrationAndContextualization.trim(),
    formativeAssessment: s.formativeAssessment.trim(),
    extendedLearningOpportunities: s.extendedLearningOpportunities.trim(),
    reflections: s.reflections.trim(),
  })) as DailyLessonLog["sessions"];

  const classroomContext = normalizeClassroomContext(
    dll.classroomContext,
    (msg) => new DllValidationError(msg),
  );
  const referenceMaterial = normalizeReferenceMaterial(dll.referenceMaterial);
  const { classroomContext: _c, referenceMaterial: _r, ...rest } = dll;
  void _c;
  void _r;

  return {
    ...rest,
    lessonTitle,
    learningAreas,
    gradeAndSection,
    references: dll.references.trim(),
    ...(classroomContext ? { classroomContext } : {}),
    ...(referenceMaterial ? { referenceMaterial } : {}),
    ...(typeof dll.aiDeclaration === "string"
      ? { aiDeclaration: dll.aiDeclaration.trim() }
      : {}),
    promptNotes: dll.promptNotes.trim(),
    intentions: {
      learningCompetencies: dll.intentions.learningCompetencies
        .map((c) => c.trim())
        .filter(Boolean),
      contentStandards: dll.intentions.contentStandards
        .map((c) => c.trim())
        .filter(Boolean),
      performanceStandards: dll.intentions.performanceStandards
        .map((c) => c.trim())
        .filter(Boolean),
      learnerContext: dll.intentions.learnerContext.trim(),
    },
    sessions,
    updatedAt: new Date().toISOString(),
  };
}

/** Renders a Daily Lesson Log into clean ILAW Framework Markdown. */
export function renderDllMarkdown(dll: DailyLessonLog): string {
  const lines: string[] = [
    `# ${dll.lessonTitle || "Daily Lesson Log"}`,
    "",
    `- **Learning Area/s:** ${dll.learningAreas}`,
    `- **Grade Level and Section:** ${dll.gradeAndSection}`,
    "- **No. of Sessions:** 5",
    `- **References:** ${dll.references || "—"}`,
    ...(dll.classroomContext
      ? [`- **Classroom Context:** ${formatClassroomContextSummary(dll.classroomContext)}`]
      : []),
    ...(dll.aiDeclaration?.trim()
      ? [`- **Declaration of AI Use:** ${dll.aiDeclaration.trim()}`]
      : []),
    "",
    "## Intentions",
    "",
    "### Learning Competencies",
    ...dll.intentions.learningCompetencies.map((c) => `- ${c}`),
    "",
    "### Content Standards",
    ...dll.intentions.contentStandards.map((c) => `- ${c}`),
    "",
    "### Performance Standards",
    ...dll.intentions.performanceStandards.map((c) => `- ${c}`),
    "",
    "### Learner Context",
    dll.intentions.learnerContext.trim() || "_(Left blank for manual completion)_",
    "",
    "## Sessions (ILAW Framework)",
    "",
  ];

  for (const session of dll.sessions) {
    const label =
      session.mode === "non-instructional"
        ? `Non-Instructional (${session.nonInstructionalReason || "Holiday"})`
        : formatLearningAreas(session.components);
    lines.push(`### Session ${session.sessionNumber}${label ? ` — ${label}` : ""}`);
    lines.push("");
    lines.push(`- **Learning Objectives:** ${session.learningObjectives || "—"}`);
    lines.push(`- **Pre-Lesson:** ${session.preLesson || "—"}`);
    lines.push(`- **Lesson Flow:** ${session.lessonFlow || "—"}`);
    lines.push(`- **Learning Resources:** ${session.learningResources || "—"}`);
    lines.push(
      `- **Opportunities for Integration and Contextualization:** ${session.integrationAndContextualization || "—"}`,
    );
    lines.push(`- **Formative Assessment:** ${session.formativeAssessment || "—"}`);
    lines.push(
      `- **Extended Learning Opportunities:** ${session.extendedLearningOpportunities || "—"}`,
    );
    lines.push(
      `- **Reflections:** ${session.reflections.trim() || "_(Left blank for manual completion)_"}`,
    );
    lines.push("");
  }

  return lines.join("\n");
}
