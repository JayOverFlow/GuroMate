import {
  dedupeOrdered,
  formatCompetencyLines,
  parseAiJsonObject,
} from "./lessonHelpers";
import {
  SESSION_NUMBERS,
  type CurriculumCompetency,
  type DailyLessonLog,
  type DailyLessonPlan,
  type DlpActivityPair,
  type DllSessionPlan,
  type SessionNumber,
} from "./types";

export class DlpValidationError extends Error {}
export class DlpNotFoundError extends Error {}

interface AiActivityPairPayload {
  teacherActivity?: unknown;
  studentActivity?: unknown;
}

export interface AiDlpPayload {
  lessonTitle?: unknown;
  references?: unknown;
  learningObjectives?: unknown;
  preLesson?: AiActivityPairPayload;
  lessonFlow?: AiActivityPairPayload;
  learningResources?: AiActivityPairPayload;
  integrationAndContextualization?: AiActivityPairPayload;
  formativeAssessment?: AiActivityPairPayload;
  extendedLearningOpportunities?: AiActivityPairPayload;
}

export interface ResolvedDlpContext {
  gradeAndSection: string;
  learningAreas: string;
  competencyIds: string[];
  learningCompetencies: string[];
  contentStandards: string[];
  performanceStandards: string[];
  competencies: CurriculumCompetency[];
  references: string;
  inheritedObjectives: string;
  sourceDllId?: string;
  sourceSessionNumber?: SessionNumber;
  derivedSession?: DllSessionPlan;
}

/** Resolves scratch DLP competencies from the Curriculum Catalog. */
export function resolveScratchDlpContext(
  competencyIds: string[],
  gradeAndSection: string,
  references: string | undefined,
  competencyMap: Map<string, CurriculumCompetency>,
): ResolvedDlpContext {
  const trimmedGrade = gradeAndSection.trim();
  if (!trimmedGrade) {
    throw new DlpValidationError("Grade Level and Section is required.");
  }
  const ids = dedupeOrdered(competencyIds.map((id) => id.trim()).filter(Boolean));
  if (ids.length === 0) {
    throw new DlpValidationError("At least one Learning Competency is required.");
  }

  const competencies: CurriculumCompetency[] = [];
  for (const id of ids) {
    const comp = competencyMap.get(id);
    if (!comp) {
      throw new DlpValidationError(`Learning Competency not found: ${id}`);
    }
    competencies.push(comp);
  }

  return {
    gradeAndSection: trimmedGrade,
    learningAreas: dedupeOrdered(competencies.map((c) => c.component)).join(", "),
    competencyIds: ids,
    learningCompetencies: dedupeOrdered(competencies.map((c) => c.learningCompetency)),
    contentStandards: dedupeOrdered(competencies.map((c) => c.contentStandard)),
    performanceStandards: dedupeOrdered(competencies.map((c) => c.performanceStandard)),
    competencies,
    references: references?.trim() ?? "",
    inheritedObjectives: "",
  };
}

/** Resolves an active DLL Session into DLP intentions and competency context. */
export function resolveDerivedDlpContext(
  dll: DailyLessonLog,
  sessionNumber: SessionNumber,
  references: string | undefined,
  competencyMap: Map<string, CurriculumCompetency>,
): ResolvedDlpContext {
  if (!SESSION_NUMBERS.includes(sessionNumber)) {
    throw new DlpValidationError(`Invalid Session number: ${String(sessionNumber)}.`);
  }
  const session = dll.sessions.find((s) => s.sessionNumber === sessionNumber);
  if (!session) {
    throw new DlpValidationError(`Session ${sessionNumber} not found in Daily Lesson Log.`);
  }
  if (session.mode !== "instructional") {
    throw new DlpValidationError(
      `Cannot derive a Daily Lesson Plan from non-instructional Session ${sessionNumber}.`,
    );
  }

  const competencies = session.competencyIds
    .map((id) => competencyMap.get(id))
    .filter((c): c is CurriculumCompetency => Boolean(c));

  const components =
    competencies.length > 0
      ? dedupeOrdered(competencies.map((c) => c.component))
      : session.components;

  return {
    gradeAndSection: dll.gradeAndSection,
    learningAreas: components.join(", ") || dll.learningAreas,
    competencyIds: [...session.competencyIds],
    learningCompetencies:
      competencies.length > 0
        ? dedupeOrdered(competencies.map((c) => c.learningCompetency))
        : [...dll.intentions.learningCompetencies],
    contentStandards:
      competencies.length > 0
        ? dedupeOrdered(competencies.map((c) => c.contentStandard))
        : [...dll.intentions.contentStandards],
    performanceStandards:
      competencies.length > 0
        ? dedupeOrdered(competencies.map((c) => c.performanceStandard))
        : [...dll.intentions.performanceStandards],
    competencies,
    references: references?.trim() || dll.references,
    inheritedObjectives: session.learningObjectives.trim(),
    sourceDllId: dll.id,
    sourceSessionNumber: session.sessionNumber,
    derivedSession: session,
  };
}

/** Builds the AI generation prompt for a single-session DLP with paired activities. */
export function buildDlpPrompt(params: {
  lessonTitle?: string;
  gradeAndSection: string;
  learningAreas: string;
  references?: string;
  promptNotes?: string;
  competencies: CurriculumCompetency[];
  learningCompetencies: string[];
  derivedSession?: DllSessionPlan;
}): string {
  const promptNotes = params.promptNotes?.trim();
  const compSection =
    params.competencies.length > 0
      ? formatCompetencyLines(params.competencies)
      : params.learningCompetencies.map((c) => `- ${c}`).join("\n");

  const sessionContext = params.derivedSession
    ? [
        `Derived from DLL Session ${params.derivedSession.sessionNumber}:`,
        params.derivedSession.learningObjectives
          ? `- Learning Objectives: ${params.derivedSession.learningObjectives}`
          : "",
        params.derivedSession.preLesson
          ? `- Pre-Lesson: ${params.derivedSession.preLesson}`
          : "",
        params.derivedSession.lessonFlow
          ? `- Lesson Flow: ${params.derivedSession.lessonFlow}`
          : "",
        params.derivedSession.learningResources
          ? `- Learning Resources: ${params.derivedSession.learningResources}`
          : "",
        params.derivedSession.integrationAndContextualization
          ? `- Integration and Contextualization: ${params.derivedSession.integrationAndContextualization}`
          : "",
        params.derivedSession.formativeAssessment
          ? `- Formative Assessment: ${params.derivedSession.formativeAssessment}`
          : "",
        params.derivedSession.extendedLearningOpportunities
          ? `- Extended Learning Opportunities: ${params.derivedSession.extendedLearningOpportunities}`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const pairSchema = {
    teacherActivity: "string",
    studentActivity: "string",
  };

  return [
    "Generate a single-session (No. of Sessions: 1) DepEd MATATAG TLE Daily Lesson Plan (DLP) following the ILAW Framework.",
    `Learning Area/s: ${params.learningAreas}`,
    `Grade Level and Section: ${params.gradeAndSection}`,
    params.lessonTitle?.trim() ? `Requested Lesson Title: ${params.lessonTitle.trim()}` : "",
    params.references?.trim() ? `Requested References: ${params.references.trim()}` : "",
    promptNotes
      ? `Teacher Prompt Notes (use to guide pacing, equipment, and activities; never copy into Learner Context):\n${promptNotes}`
      : "",
    "",
    "Target Learning Competencies & Standards:",
    compSection,
    sessionContext ? `\n${sessionContext}` : "",
    "",
    "Respond ONLY with valid JSON matching this schema:",
    JSON.stringify(
      {
        lessonTitle: "string",
        references: "string",
        learningObjectives: "string",
        preLesson: pairSchema,
        lessonFlow: pairSchema,
        learningResources: pairSchema,
        integrationAndContextualization: pairSchema,
        formativeAssessment: pairSchema,
        extendedLearningOpportunities: pairSchema,
      },
      null,
      2,
    ),
    "Every row under Learning Experience, Assessing Learning, and Ways Forward (Extended Learning Opportunities) must split Teacher's Activity and Student's Activity. Do not include Learner Context or Reflections.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Parses structured JSON from the AI adapter, stripping optional code fences. */
export function parseAiDlpPayload(rawText: string): AiDlpPayload {
  return parseAiJsonObject(
    rawText,
    "Daily Lesson Plan",
    (msg) => new DlpValidationError(msg),
  ) as AiDlpPayload;
}

export function normalizeActivityPair(pair: AiActivityPairPayload | undefined): DlpActivityPair {
  return {
    teacherActivity:
      typeof pair?.teacherActivity === "string" ? pair.teacherActivity.trim() : "",
    studentActivity:
      typeof pair?.studentActivity === "string" ? pair.studentActivity.trim() : "",
  };
}

/** Normalizes and validates an edited Daily Lesson Plan before persistence. */
export function normalizeEditedDlp(dlp: DailyLessonPlan): DailyLessonPlan {
  const lessonTitle = dlp.lessonTitle.trim();
  if (!lessonTitle) {
    throw new DlpValidationError("Lesson Title is required.");
  }
  const learningAreas = dlp.learningAreas.trim();
  if (!learningAreas) {
    throw new DlpValidationError("Learning Area/s is required.");
  }
  const gradeAndSection = dlp.gradeAndSection.trim();
  if (!gradeAndSection) {
    throw new DlpValidationError("Grade Level and Section is required.");
  }

  return {
    ...dlp,
    lessonTitle,
    learningAreas,
    gradeAndSection,
    references: dlp.references.trim(),
    promptNotes: dlp.promptNotes.trim(),
    intentions: {
      learningCompetencies: dlp.intentions.learningCompetencies
        .map((c) => c.trim())
        .filter(Boolean),
      contentStandards: dlp.intentions.contentStandards
        .map((c) => c.trim())
        .filter(Boolean),
      performanceStandards: dlp.intentions.performanceStandards
        .map((c) => c.trim())
        .filter(Boolean),
      learningObjectives: dlp.intentions.learningObjectives.trim(),
      learnerContext: dlp.intentions.learnerContext.trim(),
    },
    preLesson: normalizeActivityPair(dlp.preLesson),
    lessonFlow: normalizeActivityPair(dlp.lessonFlow),
    learningResources: normalizeActivityPair(dlp.learningResources),
    integrationAndContextualization: normalizeActivityPair(
      dlp.integrationAndContextualization,
    ),
    formativeAssessment: normalizeActivityPair(dlp.formativeAssessment),
    extendedLearningOpportunities: normalizeActivityPair(
      dlp.extendedLearningOpportunities,
    ),
    reflections: normalizeActivityPair(dlp.reflections),
    updatedAt: new Date().toISOString(),
  };
}

/** Renders a Daily Lesson Plan into ILAW Framework Markdown with paired activities. */
export function renderDlpMarkdown(dlp: DailyLessonPlan): string {
  const sections: ReadonlyArray<{
    heading: string;
    rows: ReadonlyArray<{ label: string; pair: DlpActivityPair }>;
  }> = [
    {
      heading: "## Learning Experience",
      rows: [
        { label: "### Pre-Lesson", pair: dlp.preLesson },
        { label: "### Lesson Flow", pair: dlp.lessonFlow },
        { label: "### Learning Resources", pair: dlp.learningResources },
        {
          label: "### Opportunities for Integration and Contextualization",
          pair: dlp.integrationAndContextualization,
        },
      ],
    },
    {
      heading: "## Assessing Learning",
      rows: [{ label: "### Formative Assessment", pair: dlp.formativeAssessment }],
    },
    {
      heading: "## Ways Forward",
      rows: [
        {
          label: "### Extended Learning Opportunities",
          pair: dlp.extendedLearningOpportunities,
        },
      ],
    },
  ];

  const lines: string[] = [
    `# ${dlp.lessonTitle || "Daily Lesson Plan"}`,
    "",
    `- **Learning Area/s:** ${dlp.learningAreas}`,
    `- **Grade Level and Section:** ${dlp.gradeAndSection}`,
    "- **No. of Sessions:** 1",
    `- **References:** ${dlp.references || "—"}`,
    ...(dlp.sourceDllId
      ? [`- **Derived From:** ${dlp.sourceDllId} (Session ${dlp.sourceSessionNumber})`]
      : []),
    "",
    "## Intentions",
    "",
    "### Learning Competencies",
    ...dlp.intentions.learningCompetencies.map((c) => `- ${c}`),
    "",
    "### Content Standards",
    ...dlp.intentions.contentStandards.map((c) => `- ${c}`),
    "",
    "### Performance Standards",
    ...dlp.intentions.performanceStandards.map((c) => `- ${c}`),
    "",
    "### Learning Objectives",
    dlp.intentions.learningObjectives || "—",
    "",
    "### Learner Context",
    dlp.intentions.learnerContext.trim() || "_(Left blank for manual completion)_",
    "",
  ];

  for (const section of sections) {
    lines.push(section.heading, "");
    for (const row of section.rows) {
      lines.push(
        row.label,
        `- **Teacher's Activity:** ${row.pair.teacherActivity || "—"}`,
        `- **Student's Activity:** ${row.pair.studentActivity || "—"}`,
        "",
      );
    }
  }

  lines.push(
    "### Reflections",
    `- **Teacher's Activity:** ${dlp.reflections.teacherActivity.trim() || "_(Left blank for manual completion)_"}`,
    `- **Student's Activity:** ${dlp.reflections.studentActivity.trim() || "_(Left blank for manual completion)_"}`,
    "",
  );

  return lines.join("\n");
}
