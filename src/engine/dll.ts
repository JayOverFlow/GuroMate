import {
  dedupeOrdered,
  formatCompetencyLines,
  parseAiJsonObject,
} from "./lessonHelpers";
import {
  SESSION_NUMBERS,
  type CurriculumCompetency,
  type DailyLessonLog,
  type DllSessionConfig,
  type DllSessionPlan,
  type GenerateDllInput,
  type SessionNumber,
  type TleComponent,
} from "./types";

export class DllValidationError extends Error {}
export class DllNotFoundError extends Error {}

/** Built-in DepEd MATATAG / ILAW Framework System Instructions for 5-Session DLL generation. */
export const DLL_SYSTEM_INSTRUCTION = `You are a Philippine DepEd MATATAG (Grades 7–12: TLE, Grade 12 Technical-Professional electives, and Grade 11 SHS Core) instructional designer generating a 5-Session Daily Lesson Log (DLL) using the ILAW Framework.

Core Rules:
- Use strict ILAW Framework terminology (Intentions, Learning Experience, Assessing Learning, Ways Forward). Never use 4As, 5Es, or DepEd DO 42 headers.
- Ground every instructional Session in Philippine Grades 7–12 classroom authenticity (DepEd MATATAG TLE, Grade 12 Technical-Professional electives, and Grade 11 SHS Core): hands-on and collaborative tasks, OSH/PPE safety practices where relevant, Philippine localization, and alignment with the provided Curriculum Guide and Budget of Work (BoW).
- Whenever Budget of Work (BoW) metadata is present on a target Learning Competency, actively adapt its Suggested Activities into Learning Experience (Pre-Lesson and Lesson Flow) and its Suggested Performance Tasks into Assessing Learning (Formative Assessment) and/or Ways Forward (Extended Learning Opportunities), while respecting the BoW term/week pacing.
- Omit Learner Context and Reflections completely (both remain blank for manual teacher completion). Never copy Prompt Notes into Learner Context.
- Respect per-lesson teacher Prompt Notes (such as pacing, equipment constraints, or custom assessment formats); Prompt Notes override default section formats and BoW defaults when specified.
- For non-instructional Sessions, follow the user prompt's brief note rule.
- Respond ONLY with valid JSON matching the schema in the user prompt.

Section Formatting Rules for Every Instructional Session:
- Learning Objectives: Always write 3 bulleted SMART objectives (each starting with "• " on its own line) ordered Cognitive → Psychomotor → Affective with measurable criteria. Do not include domain-label prefixes (no "Cognitive:", "Psychomotor:", or "Affective:").
- Pre-Lesson: Start with a titled hook in the format Pre-lesson activity: “<Title>” followed by 1–2 concise sentences.
- Lesson Flow: Start with a short activity title followed by 1–2 concise sentences describing the main collaborative or hands-on task (adapting BoW Suggested Activities when provided, unless overridden by Prompt Notes).
- Learning Resources: Write a short "• " bulleted list starting with presentation/visual aids followed by accessible classroom or shop activity materials.
- Opportunities for Integration and Contextualization: Write 1 concise Philippine, cross-disciplinary, or technology connection, or "N/A" if none fits naturally.
- Formative Assessment: Default to a 5-item multiple-choice quiz (titled + 1 concise sentence) aligned to the Session's Learning Objectives, or adapt BoW Suggested Performance Tasks when appropriate for performance-based sessions, unless overridden by Prompt Notes.
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

/** Validates 5-session config and resolves Curriculum Guide competencies per session. */
export function resolveDllSessions(
  input: GenerateDllInput,
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

/** Builds the AI generation prompt combining Curriculum Guide, Budget of Work, and Prompt Notes. */
export function buildDllPrompt(params: {
  lessonTitle?: string;
  gradeAndSection: string;
  learningAreas: string;
  references?: string;
  promptNotes?: string;
  orderedConfigs: DllSessionConfig[];
  sessionCompetencies: Map<SessionNumber, CurriculumCompetency[]>;
}): string {
  const sessionLines = params.orderedConfigs.map((cfg) => {
    if (cfg.mode === "non-instructional") {
      const reason = cfg.nonInstructionalReason?.trim() || "Non-instructional / Holiday";
      return `Session ${cfg.sessionNumber}: NON-INSTRUCTIONAL (${reason}). Leave instructional fields brief or note "${reason}".`;
    }
    const comps = params.sessionCompetencies.get(cfg.sessionNumber) ?? [];
    const compDetails = formatCompetencyLines(comps);
    return `Session ${cfg.sessionNumber} (Instructional):\n${compDetails}`;
  });

  const promptNotes = params.promptNotes?.trim();

  return [
    "Generate a 5-Session DepEd MATATAG (Grades 7–12: TLE, Grade 12 Technical-Professional electives, and Grade 11 SHS Core) Daily Lesson Log (DLL) following the ILAW Framework.",
    `Learning Area/s: ${params.learningAreas}`,
    `Grade Level and Section: ${params.gradeAndSection}`,
    params.lessonTitle?.trim() ? `Requested Lesson Title: ${params.lessonTitle.trim()}` : "",
    params.references?.trim() ? `Requested References: ${params.references.trim()}` : "",
    promptNotes
      ? `Teacher Prompt Notes (use to guide pacing, equipment, and activities; never copy into Learner Context):\n${promptNotes}`
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

/** Builds normalized 5-session plans from AI output, keeping Reflections and Learner Context blank. */
export function assembleGeneratedSessions(
  orderedConfigs: DllSessionConfig[],
  sessionCompetencies: Map<SessionNumber, CurriculumCompetency[]>,
  aiSessions: AiSessionPayload[] | undefined,
): [DllSessionPlan, DllSessionPlan, DllSessionPlan, DllSessionPlan, DllSessionPlan] {
  const aiBySession = new Map<number, AiSessionPayload>();
  if (Array.isArray(aiSessions)) {
    for (const entry of aiSessions) {
      if (typeof entry.sessionNumber === "number") {
        aiBySession.set(entry.sessionNumber, entry);
      }
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
    return {
      sessionNumber: cfg.sessionNumber,
      mode: "instructional" as const,
      competencyIds: comps.map((c) => c.id),
      components,
      learningObjectives: str(ai.learningObjectives),
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

  return {
    ...dll,
    lessonTitle,
    learningAreas,
    gradeAndSection,
    references: dll.references.trim(),
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
        : session.components.join(", ");
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
