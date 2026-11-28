import {
  FORMATIVE_ASSESSMENT_LABELS,
  buildFallbackObjectives,
  cleanObjectiveBullets,
  dedupeOrdered,
  formatClassroomContextPromptBlock,
  formatClassroomContextSummary,
  formatCompetencyLines,
  formatLearningAreas,
  formatPeriodDuration,
  formatReferenceMaterialPromptBlock,
  hasMatchingCompetencyIds,
  inferAssessmentTypeFromText,
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
  type BlueprintActivityOption,
  type ClassroomContext,
  type CurriculumCompetency,
  type DailyLessonLog,
  type DailyLessonPlan,
  type DlpActivityPair,
  type DlpLessonBlueprint,
  type DllSessionPlan,
  type FormativeAssessmentType,
  type PlanDlpInput,
  type ReferenceMaterial,
  type SessionNumber,
  type TleComponent,
} from "./types";

export class DlpValidationError extends Error {}
export class DlpNotFoundError extends Error {}

/** Built-in DepEd DO 016, s. 2026 System Instructions for Step 1 single-session DLP Lesson Blueprint planning. */
export const DLP_PLAN_SYSTEM_INSTRUCTION = `You are a Philippine DepEd MATATAG (Grades 7–12: TLE, Grade 12 Technical-Professional electives, and Grade 11 SHS Core) instructional design partner creating an editable single-session Lesson Blueprint for a Daily Lesson Plan (DLP) grounded in DepEd Order No. 016, s. 2026 (ILAW Framework and the 7 Learning Design Principles), the MATATAG Instructional Design Framework (4Is: Inclusive, Ideational, Integrative, Innovative; 4Cs: Context, Connection, Collaboration, Creativity; 4Es: Engage, Explore, Experience, Empathize), and DepEd Order No. 8, s. 2015 (Classroom Assessment).

Core Planning Rules:
- Produce a clear, teacher-editable single-session Lesson Blueprint—never full lesson prose—so the teacher reviews and approves core instructional decisions before full DLP generation (DO 016, s. 2026 & DO 003, s. 2026 teacher agency).
- Learning Objectives: Propose exactly 3 bulleted SMART Learning Objectives (each line starting with "• ") ordered Cognitive → Psychomotor → Affective with measurable criteria. NEVER include domain-label prefixes ("Cognitive:", "Psychomotor:", "Affective:").
- Activity Options (Learning Experience): Propose 2–3 concrete, classroom-realistic activity options fitting the Classroom Context (period length, facility/equipment, modality) and Reference Material. Actively adapt Budget of Work (BoW) Suggested Activities when provided ("source": "bow"); when BoW columns are absent or empty, design authentic MATATAG TLE / Grade 12 Tech-Pro / Grade 11 SHS Core alternatives ("source": "authentic"). Mark exactly ONE option "recommended": true.
- Formative Assessment Options (DO 8, s. 2015): Provide ALL 5 Formative Assessment types ("exit-ticket", "checklist", "demo-rubric", "worksheet", "short-quiz"), each with a concise 1-line "preview" tailored to the session's objectives. Mark exactly ONE best-fit option "recommended": true based on the session's dominant target (never blindly default to a quiz).
- Strict DLL → DLP Fidelity (when deriving from a parent DLL Session): Preserve the parent DLL Session's Learning Objectives verbatim, keep the parent DLL Session's chosen activity as the primary recommended activity, keep the parent DLL Session's chosen Formative Assessment type as the recommended assessment, and honor its key Learning Resources without drifting.
- Respond ONLY with valid JSON matching the schema in the user prompt.`;

/** Built-in DepEd DO 016, s. 2026 / MATATAG ILAW Framework System Instructions for classroom-ready single-session DLP generation. */
export const DLP_SYSTEM_INSTRUCTION = `You are a Philippine DepEd MATATAG (Grades 7–12: TLE, Grade 12 Technical-Professional electives, and Grade 11 SHS Core) instructional designer generating a demonstration-teaching, classroom-ready single-session Daily Lesson Plan (DLP) strictly anchored on DepEd Order No. 016, s. 2026 (ILAW Framework and the seven Learning Design Principles), the MATATAG Instructional Design Framework (IDF: 4Is — Inclusive, Ideational, Integrative, Innovative; 4Cs — Context, Connection, Collaboration, Creativity; 4Es — Engage, Explore, Experience, Empathize), and DepEd Order No. 8, s. 2015 (Classroom Assessment).

Core Rules:
- Use strict ILAW Framework structure and terminology (Intentions, Learning Experience, Assessing Learning, Ways Forward). Never use 4As, 5Es, or DepEd DO 42 headers.
- Follow the 2-column Teacher's Activity / Student's Activity pairing (teacherActivity / studentActivity) mirrored line-by-line across Learning Experience, Assessing Learning, and Ways Forward.
- Apply relevant DO 016 Learning Design Principles naturally: (1) make objectives clear for learners, (2) guide learners before independent practice, (3) check learners' well-being, understanding, and mastery, (4) connect new concepts to past competencies, (5) encourage collaboration, (6) invite reflection on relevance, and (7) ensure inclusion for varied abilities, learning styles, and contexts.
- Minute-by-Minute Period-Matched Pacing: Include explicit minute-by-minute time allocations (e.g., "(10 min)") across Pre-Lesson, Lesson Flow (with timed sub-phases), and Assessing Learning that sum cleanly to the chosen Classroom Context period length (including 45-minute, 60-minute, 90-minute, and 120-minute / 2-hour lab or shop blocks).
- Ground the lesson in Philippine Grades 7–12 classroom authenticity (DepEd MATATAG TLE, Grade 12 Technical-Professional electives, and Grade 11 SHS Core): concrete technical teaching points grounded in the Curriculum Guide, Budget of Work (BoW), and Reference Material; hands-on and collaborative tasks; explicit OHS/PPE safety checks where applicable; realistic Classroom Context constraints; and Philippine localization.
- Budget of Work Adaptation & Authentic Fallback: Actively adapt BoW Suggested Activities into Learning Experience and BoW Suggested Performance Tasks into Assessing Learning and/or Ways Forward when present. When a BoW record leaves those columns empty, design authentic MATATAG TLE or SHS Core tasks fitted to Classroom Context.
- Strict Approved Lesson Blueprint & DLL → DLP Fidelity: Whenever an Approved Lesson Blueprint or parent DLL Session lock is supplied in the user prompt, strictly preserve its Learning Objectives verbatim, expand its chosen Learning Experience activity without drifting, build Assessing Learning around its chosen Formative Assessment type, and preserve its key Learning Resources.
- 1-to-1 Constructive Alignment: Every Learning Objective must be explicitly taught in Learning Experience and directly measured in Formative Assessment.
- Omit Learner Context and Reflections completely (both remain blank for manual teacher completion). Never copy Classroom Context, Reference Material, or Prompt Notes into Learner Context.
- Respect per-lesson teacher Prompt Notes (such as localized scenarios, equipment rotations, or specific constraints).
- Respond ONLY with valid JSON matching the schema in the user prompt.

Section Formatting Rules (Demonstration-Teaching Standard):
- Learning Objectives: Always write 3 bulleted SMART objectives (each starting with "• " on its own line) ordered Cognitive → Psychomotor → Affective with measurable criteria. Do not include domain-label prefixes (no "Cognitive:", "Psychomotor:", or "Affective:"). Copy verbatim from the Approved Lesson Blueprint or parent DLL Session when supplied.
- Pre-Lesson (include minute allocation): Teacher's Activity starts with Philippine classroom opening routine (greet students, ask a student to lead the prayer, check attendance), conducts a brief learner well-being check, presents a titled motivation hook with a quoted guide question connecting to prior knowledge, and explicitly presents the 3 bulleted Learning Objectives verbatim; Student's Activity mirrors every step line-by-line with expected student responses.
- Lesson Flow (include minute allocations per sub-phase): Organize Teacher's Activity into named, timed instructional phases weaving relevant DO 016 Learning Design Principles and MATATAG IDF (4Is/4Cs/4Es): (a) concrete key teaching points grounded in CG, BoW, and Reference Material; (b) teacher guide questions paired with expected student responses in Student's Activity; (c) teacher modeling followed by step-by-step guided and collaborative hands-on procedures with explicit OHS/PPE safety checks where applicable; and (d) learner share-back, constructive feedback, and a quoted synthesis takeaway. Student's Activity mirrors every phase line-by-line.
- Learning Resources: Write separate "• " bulleted lists for Teacher's Activity (teacher aids/equipment) and Student's Activity (learner materials) ensuring available, inclusive primary materials (preserving key parent DLL resources when derived) PLUS an explicit emergency/offline alternative (e.g., print/chalkboard/no-power backup for Education in Emergencies readiness).
- Opportunities for Integration and Contextualization: Write 1 concise Philippine, real-world, cross-disciplinary, or technology connection in Teacher's Activity (or "N/A" if none fits naturally), and leave Student's Activity blank ("").
- Formative Assessment (include minute allocation): Follow DepEd Order No. 8, s. 2015 with varied objective-aligned formats (matching the Approved Lesson Blueprint or parent DLL Session's chosen type—Exit Ticket, Observation / Skill Checklist, Performance / Demo Rubric, Activity Worksheet, or Short Quiz—or selecting the best fit for the objectives when called without a blueprint). Include: (a) ready-to-use assessment items, prompts, or rubric criteria aligned to all 3 Learning Objectives; (b) a complete Answer Key or scoring criteria in Teacher's Activity; (c) explicit ways for learners to ask for guidance/help-seeking and receive ongoing feedback; and (d) appropriate learner accommodations (e.g., varied response formats, small-group options, visual/auditory supports). Student's Activity pairs learner completion, feedback/help-seeking, and accommodation steps.
- Extended Learning Opportunities: Write 1 concise out-of-class home or community prompt in Teacher's Activity (drawing on BoW Suggested Performance Tasks where fitting), and leave Student's Activity blank ("").`;

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

interface AiDlpBlueprintPayload {
  lessonTitle?: unknown;
  references?: unknown;
  progressionFocus?: unknown;
  learningObjectives?: unknown;
  activityOptions?: unknown;
  assessmentOptions?: unknown;
  recommendedAssessmentType?: unknown;
}

export interface ResolvedDlpContext {
  gradeAndSection: string;
  learningAreas: string;
  components: TleComponent[];
  competencyIds: string[];
  learningCompetencies: string[];
  contentStandards: string[];
  performanceStandards: string[];
  competencies: CurriculumCompetency[];
  references: string;
  inheritedObjectives: string;
  inheritedClassroomContext?: ClassroomContext;
  inheritedReferenceMaterial?: ReferenceMaterial;
  sourceDllId?: string;
  sourceSessionNumber?: SessionNumber;
  derivedSession?: DllSessionPlan;
}

export interface ResolvedDlpLocks {
  lockedToParentSession: boolean;
  progressionFocus?: string;
  learningObjectives?: string;
  selectedActivityTitle?: string;
  selectedActivitySummary?: string;
  selectedAssessmentType?: FormativeAssessmentType;
  selectedAssessmentLabel?: string;
  selectedAssessmentPreview?: string;
  inheritedLearningResources?: string;
}

function summarizeSingleLine(text: string, maxLen = 180): string {
  const single = text.replace(/\s+/g, " ").trim();
  if (!single) return "";
  return single.length > maxLen ? `${single.slice(0, maxLen - 1).trimEnd()}…` : single;
}

function extractActivityTitleFromFlow(lessonFlow: string): string {
  const single = lessonFlow.replace(/\s+/g, " ").trim();
  if (!single) return "";
  const colonIdx = single.indexOf(":");
  if (colonIdx > 3 && colonIdx <= 80) {
    return single.slice(0, colonIdx).trim();
  }
  const sentenceEnd = single.search(/[.!?]\s/);
  if (sentenceEnd > 3 && sentenceEnd <= 80) {
    return single.slice(0, sentenceEnd).trim();
  }
  return single.length > 72 ? `${single.slice(0, 71).trimEnd()}…` : single;
}

/** Extracts deterministic parent DLL Session locks so derived DLPs never drift. */
export function resolveDerivedSessionLocks(
  session: DllSessionPlan,
  competencies: CurriculumCompetency[],
): {
  progressionFocus: string;
  learningObjectives: string;
  activityTitle: string;
  activitySummary: string;
  assessmentType: FormativeAssessmentType;
  assessmentPreview: string;
  learningResources: string;
} {
  const primaryTopic = competencies[0]?.contentTopic.trim() || "Parent DLL Session";
  const activityTitle =
    session.selectedActivityTitle?.trim() ||
    extractActivityTitleFromFlow(session.lessonFlow) ||
    `Session ${session.sessionNumber} Activity: ${primaryTopic}`;
  const activitySummary =
    session.selectedActivitySummary?.trim() ||
    summarizeSingleLine(session.lessonFlow) ||
    `Expand parent DLL Session ${session.sessionNumber} learning experience for ${primaryTopic}.`;

  const assessmentType: FormativeAssessmentType =
    session.selectedAssessmentType &&
    FORMATIVE_ASSESSMENT_TYPES.includes(session.selectedAssessmentType)
      ? session.selectedAssessmentType
      : (inferAssessmentTypeFromText(session.formativeAssessment) ?? "exit-ticket");

  const assessmentPreview =
    session.selectedAssessmentPreview?.trim() ||
    summarizeSingleLine(session.formativeAssessment) ||
    `${FORMATIVE_ASSESSMENT_LABELS[assessmentType]} aligned to Session ${session.sessionNumber} objectives.`;

  const progressionFocus =
    session.progressionFocus?.trim() ||
    `Expanded demonstration teaching plan for DLL Session ${session.sessionNumber}`;

  return {
    progressionFocus,
    learningObjectives: session.learningObjectives.trim(),
    activityTitle,
    activitySummary,
    assessmentType,
    assessmentPreview,
    learningResources: session.learningResources.trim(),
  };
}

/** Verifies that a DLP Lesson Blueprint matches the current request mode, source DLL session, and competencies. */
export function isMatchingDlpBlueprint(
  blueprint: DlpLessonBlueprint | undefined,
  resolved: ResolvedDlpContext,
): blueprint is DlpLessonBlueprint {
  if (!blueprint) return false;
  if (resolved.derivedSession) {
    return (
      blueprint.mode === "derive" &&
      blueprint.sourceDllId === resolved.sourceDllId &&
      blueprint.sourceSessionNumber === resolved.sourceSessionNumber &&
      hasMatchingCompetencyIds(blueprint.competencyIds, resolved.competencyIds)
    );
  }
  return (
    blueprint.mode === "scratch" &&
    hasMatchingCompetencyIds(blueprint.competencyIds, resolved.competencyIds)
  );
}

/** Resolves effective locked instructional choices for DLP generation (strict parent DLL lock in derive mode; teacher-approved blueprint in scratch mode). */
export function resolveDlpGenerationLocks(params: {
  resolved: ResolvedDlpContext;
  blueprint?: DlpLessonBlueprint;
}): ResolvedDlpLocks {
  const { resolved } = params;
  const blueprint = isMatchingDlpBlueprint(params.blueprint, resolved)
    ? params.blueprint
    : undefined;

  if (resolved.derivedSession) {
    const parentLocks = resolveDerivedSessionLocks(
      resolved.derivedSession,
      resolved.competencies,
    );
    const bpAssessmentPreview = blueprint?.assessmentOptions.find(
      (opt) => opt.type === parentLocks.assessmentType,
    )?.preview.trim();

    return {
      lockedToParentSession: true,
      progressionFocus:
        blueprint?.progressionFocus.trim() || parentLocks.progressionFocus,
      learningObjectives: parentLocks.learningObjectives,
      selectedActivityTitle: parentLocks.activityTitle,
      selectedActivitySummary: parentLocks.activitySummary,
      selectedAssessmentType: parentLocks.assessmentType,
      selectedAssessmentLabel: FORMATIVE_ASSESSMENT_LABELS[parentLocks.assessmentType],
      selectedAssessmentPreview:
        parentLocks.assessmentPreview || bpAssessmentPreview || undefined,
      ...(parentLocks.learningResources
        ? { inheritedLearningResources: parentLocks.learningResources }
        : {}),
    };
  }

  if (!blueprint) {
    return { lockedToParentSession: false };
  }

  const activity =
    blueprint.activityOptions.find((opt) => opt.id === blueprint.selectedActivityId) ??
    blueprint.activityOptions.find((opt) => opt.recommended) ??
    blueprint.activityOptions[0];

  const chosenType =
    blueprint.selectedAssessmentType &&
    FORMATIVE_ASSESSMENT_TYPES.includes(blueprint.selectedAssessmentType)
      ? blueprint.selectedAssessmentType
      : (blueprint.assessmentOptions.find((opt) => opt.recommended)?.type ??
        blueprint.assessmentOptions[0]?.type);

  const assessment = chosenType
    ? blueprint.assessmentOptions.find((opt) => opt.type === chosenType)
    : undefined;

  const progressionFocus = blueprint.progressionFocus.trim() || undefined;
  const learningObjectives = blueprint.learningObjectives.trim()
    ? cleanObjectiveBullets(blueprint.learningObjectives)
    : undefined;
  const selectedActivityTitle = activity?.title.trim() || undefined;
  const selectedActivitySummary = activity?.summary.trim() || undefined;
  const selectedAssessmentLabel = chosenType
    ? (assessment?.label.trim() || FORMATIVE_ASSESSMENT_LABELS[chosenType])
    : undefined;
  const selectedAssessmentPreview = assessment?.preview.trim() || undefined;

  return {
    lockedToParentSession: false,
    ...(progressionFocus ? { progressionFocus } : {}),
    ...(learningObjectives ? { learningObjectives } : {}),
    ...(selectedActivityTitle ? { selectedActivityTitle } : {}),
    ...(selectedActivitySummary ? { selectedActivitySummary } : {}),
    ...(chosenType ? { selectedAssessmentType: chosenType } : {}),
    ...(selectedAssessmentLabel ? { selectedAssessmentLabel } : {}),
    ...(selectedAssessmentPreview ? { selectedAssessmentPreview } : {}),
  };
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

  const components = dedupeOrdered(competencies.map((c) => c.component));
  return {
    gradeAndSection: trimmedGrade,
    learningAreas: formatLearningAreas(components),
    components,
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
    learningAreas: formatLearningAreas(components) || dll.learningAreas,
    components,
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
    ...(dll.classroomContext ? { inheritedClassroomContext: dll.classroomContext } : {}),
    ...(dll.referenceMaterial ? { inheritedReferenceMaterial: dll.referenceMaterial } : {}),
    sourceDllId: dll.id,
    sourceSessionNumber: session.sessionNumber,
    derivedSession: session,
  };
}

/** Builds the Step 1 Lesson Blueprint planning prompt for a single-session DLP (scratch or derive). */
export function buildDlpPlanPrompt(params: {
  lessonTitle?: string;
  gradeAndSection: string;
  learningAreas: string;
  references?: string;
  classroomContext?: ClassroomContext;
  referenceMaterial?: ReferenceMaterial;
  promptNotes?: string;
  competencies: CurriculumCompetency[];
  learningCompetencies: string[];
  derivedSession?: DllSessionPlan;
}): string {
  const classroomContextBlock = formatClassroomContextPromptBlock(
    params.classroomContext,
  );
  const referenceMaterialBlock = formatReferenceMaterialPromptBlock(
    params.referenceMaterial,
  );
  const promptNotes = params.promptNotes?.trim();
  const compSection =
    params.competencies.length > 0
      ? formatCompetencyLines(params.competencies)
      : params.learningCompetencies.map((c) => `- ${c}`).join("\n");

  const emptyBowNotes = params.competencies
    .filter((c) => !c.budgetOfWork?.suggestedActivities.trim())
    .map(
      (c) =>
        `- BoW Fallback Note: "${c.contentTopic}" has no Budget of Work Suggested Activities; design authentic MATATAG/TLE or SHS Core alternatives realistic for the Classroom Context.`,
    );

  const parentLocks = params.derivedSession
    ? resolveDerivedSessionLocks(params.derivedSession, params.competencies)
    : undefined;

  const derivedLockBlock =
    params.derivedSession && parentLocks
      ? [
          `Derived from Parent DLL Session ${params.derivedSession.sessionNumber} (STRICTLY LOCKED — do not drift):`,
          parentLocks.learningObjectives
            ? `- Locked Learning Objectives (preserve verbatim):\n${parentLocks.learningObjectives}`
            : "",
          `- Locked Primary Learning Experience Activity (mark recommended: true): ${parentLocks.activityTitle} — ${parentLocks.activitySummary}`,
          `- Locked Formative Assessment Type (mark recommended: true): ${parentLocks.assessmentType} (${FORMATIVE_ASSESSMENT_LABELS[parentLocks.assessmentType]}) — ${parentLocks.assessmentPreview}`,
          parentLocks.learningResources
            ? `- Inherited Key Learning Resources: ${parentLocks.learningResources}`
            : "",
          params.derivedSession.preLesson
            ? `- Parent Pre-Lesson: ${params.derivedSession.preLesson}`
            : "",
          params.derivedSession.lessonFlow
            ? `- Parent Lesson Flow: ${params.derivedSession.lessonFlow}`
            : "",
          params.derivedSession.formativeAssessment
            ? `- Parent Formative Assessment: ${params.derivedSession.formativeAssessment}`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "";

  return [
    "Create an editable single-session Lesson Blueprint for a DepEd MATATAG Daily Lesson Plan (DLP) aligned with DepEd Order No. 016, s. 2026 (ILAW Framework + 7 Learning Design Principles), MATATAG IDF (4Is/4Cs/4Es), and DepEd Order No. 8, s. 2015.",
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
    "Target Learning Competencies & Standards:",
    compSection,
    ...(emptyBowNotes.length > 0 ? ["", ...emptyBowNotes] : []),
    derivedLockBlock ? `\n${derivedLockBlock}` : "",
    "",
    "Respond ONLY with valid JSON matching this schema:",
    JSON.stringify(
      {
        lessonTitle: "string",
        references: "string",
        progressionFocus: "string (short focus label for this single-session DLP)",
        learningObjectives:
          "• <Cognitive SMART objective>\\n• <Psychomotor SMART objective>\\n• <Affective SMART objective>",
        activityOptions: [
          {
            id: "dlp-act-1",
            title: "string",
            summary: "1-sentence concrete classroom/lab activity description",
            source: "bow | authentic",
            recommended: true,
          },
          {
            id: "dlp-act-2",
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
      null,
      2,
    ),
    "Mark exactly ONE activityOption and ONE assessmentOption as recommended: true.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Parses structured DLP Lesson Blueprint JSON from the AI adapter. */
export function parseAiDlpBlueprintPayload(rawText: string): AiDlpBlueprintPayload {
  return parseAiJsonObject(
    rawText,
    "Daily Lesson Plan Blueprint",
    (msg) => new DlpValidationError(msg),
  ) as AiDlpBlueprintPayload;
}

/** Assembles and normalizes a single-session DLP Lesson Blueprint guaranteeing all contract invariants and strict parent DLL locking in derive mode. */
export function assembleDlpBlueprint(params: {
  input: PlanDlpInput;
  resolved: ResolvedDlpContext;
  aiPayload: AiDlpBlueprintPayload;
}): DlpLessonBlueprint {
  const { input, resolved, aiPayload } = params;
  const fallbackTitle = resolved.derivedSession
    ? `${resolved.learningAreas} — Session ${resolved.derivedSession.sessionNumber} (${resolved.gradeAndSection})`
    : `${resolved.learningAreas} (${resolved.gradeAndSection})`;

  const lessonTitle =
    input.lessonTitle?.trim() ||
    (typeof aiPayload.lessonTitle === "string" && aiPayload.lessonTitle.trim()) ||
    fallbackTitle;

  const references = resolveLessonReferences(
    resolved.references,
    aiPayload.references,
    resolved.competencies,
  );

  const primaryTopic =
    resolved.competencies[0]?.contentTopic.trim() || "the target topic";

  if (resolved.derivedSession) {
    const locks = resolveDerivedSessionLocks(
      resolved.derivedSession,
      resolved.competencies,
    );
    const lockedId = `dll-s${resolved.derivedSession.sessionNumber}-locked`;
    const normalizedAiActs = normalizeBlueprintActivityOptions({
      rawOptions: aiPayload.activityOptions,
      idPrefix: `dlp-s${resolved.derivedSession.sessionNumber}`,
      competencies: resolved.competencies,
    });
    const normalizedTitle = locks.activityTitle.trim().toLowerCase();
    const matchingAiOption = normalizedAiActs.options.find(
      (opt) => opt.title.trim().toLowerCase() === normalizedTitle,
    );
    const hasBowActivities = resolved.competencies.some((c) =>
      Boolean(c.budgetOfWork?.suggestedActivities.trim()),
    );
    const lockedSource: BlueprintActivityOption["source"] =
      hasBowActivities &&
      (matchingAiOption?.source === "bow" ||
        /\bbow\b|budget of work/i.test(locks.activityTitle))
        ? "bow"
        : "derived";

    const supplemental: BlueprintActivityOption[] = normalizedAiActs.options
      .filter((opt) => opt.title.trim().toLowerCase() !== normalizedTitle)
      .slice(0, 2)
      .map((opt) => ({ ...opt, recommended: false }));

    const activityOptions: BlueprintActivityOption[] = [
      {
        id: lockedId,
        title: locks.activityTitle,
        summary: locks.activitySummary,
        source: lockedSource,
        recommended: true,
      },
      ...supplemental,
    ];

    const normalizedAssessments = normalizeBlueprintAssessmentOptions({
      rawOptions: aiPayload.assessmentOptions,
      recommendedTypeHint: locks.assessmentType,
      competencies: resolved.competencies,
      defaultRecommended: locks.assessmentType,
    });

    const assessmentOptions = normalizedAssessments.options.map((opt) => ({
      ...opt,
      preview:
        opt.type === locks.assessmentType
          ? locks.assessmentPreview || opt.preview
          : opt.preview,
      recommended: opt.type === locks.assessmentType,
    }));

    const learningObjectives =
      locks.learningObjectives ||
      (typeof aiPayload.learningObjectives === "string"
        ? cleanObjectiveBullets(aiPayload.learningObjectives)
        : "") ||
      buildFallbackObjectives(primaryTopic);

    return {
      mode: "derive",
      ...(resolved.sourceDllId ? { sourceDllId: resolved.sourceDllId } : {}),
      ...(resolved.sourceSessionNumber
        ? { sourceSessionNumber: resolved.sourceSessionNumber }
        : {}),
      lessonTitle,
      references,
      competencyIds: [...resolved.competencyIds],
      components: [...resolved.components],
      progressionFocus:
        (typeof aiPayload.progressionFocus === "string" &&
          aiPayload.progressionFocus.trim()) ||
        locks.progressionFocus,
      learningObjectives,
      activityOptions,
      selectedActivityId: lockedId,
      assessmentOptions,
      selectedAssessmentType: locks.assessmentType,
      ...(locks.learningResources
        ? { inheritedLearningResources: locks.learningResources }
        : {}),
      lockedToParentSession: true,
    };
  }

  const rawObjectives =
    typeof aiPayload.learningObjectives === "string"
      ? cleanObjectiveBullets(aiPayload.learningObjectives)
      : "";
  const learningObjectives =
    rawObjectives || buildFallbackObjectives(primaryTopic);

  const normalizedActivities = normalizeBlueprintActivityOptions({
    rawOptions: aiPayload.activityOptions,
    idPrefix: "dlp",
    competencies: resolved.competencies,
  });

  const normalizedAssessments = normalizeBlueprintAssessmentOptions({
    rawOptions: aiPayload.assessmentOptions,
    recommendedTypeHint: aiPayload.recommendedAssessmentType,
    competencies: resolved.competencies,
    defaultRecommended: "exit-ticket",
  });

  const progressionFocus =
    (typeof aiPayload.progressionFocus === "string" &&
      aiPayload.progressionFocus.trim()) ||
    `${primaryTopic} — Focused Single-Session Demonstration`;

  return {
    mode: "scratch",
    lessonTitle,
    references,
    competencyIds: [...resolved.competencyIds],
    components: [...resolved.components],
    progressionFocus,
    learningObjectives,
    activityOptions: normalizedActivities.options,
    selectedActivityId: normalizedActivities.selectedActivityId,
    assessmentOptions: normalizedAssessments.options,
    selectedAssessmentType: normalizedAssessments.selectedAssessmentType,
    lockedToParentSession: false,
  };
}

/** Builds the AI generation prompt for a single-session DLP with paired activities, period-matched pacing, and locked blueprint/parent DLL decisions. */
export function buildDlpPrompt(params: {
  lessonTitle?: string;
  gradeAndSection: string;
  learningAreas: string;
  references?: string;
  classroomContext?: ClassroomContext;
  referenceMaterial?: ReferenceMaterial;
  promptNotes?: string;
  competencies: CurriculumCompetency[];
  learningCompetencies: string[];
  derivedSession?: DllSessionPlan;
  blueprint?: DlpLessonBlueprint;
  locks?: ResolvedDlpLocks;
}): string {
  const classroomContextBlock = formatClassroomContextPromptBlock(
    params.classroomContext,
  );
  const referenceMaterialBlock = formatReferenceMaterialPromptBlock(
    params.referenceMaterial,
  );
  const promptNotes = params.promptNotes?.trim();
  const compSection =
    params.competencies.length > 0
      ? formatCompetencyLines(params.competencies)
      : params.learningCompetencies.map((c) => `- ${c}`).join("\n");

  const effectivePeriodMinutes = params.classroomContext?.periodMinutes ?? 60;
  const pacingDirective = `Time Allocation Requirement: Distribute explicit minute-by-minute time budgets across Pre-Lesson, Lesson Flow (broken into timed phases), and Assessing Learning so they sum cleanly to ${formatPeriodDuration(effectivePeriodMinutes)}.`;

  const locks = params.locks;
  const hasLocks =
    locks &&
    Boolean(
      locks.learningObjectives ||
        locks.selectedActivityTitle ||
        locks.selectedAssessmentLabel ||
        locks.inheritedLearningResources,
    );

  const lockedBlueprintBlock = hasLocks
    ? [
        locks.lockedToParentSession
          ? "Approved Lesson Blueprint & Parent DLL Session Lock (STRICTLY LOCKED — expand faithfully without drifting):"
          : "Approved Lesson Blueprint (STRICTLY LOCKED — follow teacher-approved choices):",
        locks.progressionFocus ? `- Session Focus: ${locks.progressionFocus}` : "",
        locks.learningObjectives
          ? `- Approved Learning Objectives (copy verbatim):\n${locks.learningObjectives}`
          : "",
        locks.selectedActivityTitle
          ? `- Chosen Learning Experience Activity: ${locks.selectedActivityTitle}${locks.selectedActivitySummary ? ` — ${locks.selectedActivitySummary}` : ""}`
          : "",
        locks.selectedAssessmentLabel
          ? `- Chosen Formative Assessment (${locks.selectedAssessmentType}): ${locks.selectedAssessmentLabel}${locks.selectedAssessmentPreview ? ` — ${locks.selectedAssessmentPreview}` : ""}`
          : "",
        locks.inheritedLearningResources
          ? `- Key Learning Resources to Preserve (plus emergency/offline backup):\n${locks.inheritedLearningResources}`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "";

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

  const effectiveTitle =
    params.blueprint?.lessonTitle.trim() || params.lessonTitle?.trim() || "";
  const effectiveRefs =
    params.blueprint?.references.trim() || params.references?.trim() || "";

  const pairSchema = {
    teacherActivity: "string",
    studentActivity: "string",
  };

  return [
    "Generate a demonstration-teaching, classroom-ready single-session (No. of Sessions: 1) DepEd MATATAG (Grades 7–12: TLE, Grade 12 Technical-Professional electives, and Grade 11 SHS Core) Daily Lesson Plan (DLP) following DepEd Order No. 016, s. 2026 (ILAW Framework + 7 Learning Design Principles), MATATAG IDF (4Is/4Cs/4Es), and DepEd Order No. 8, s. 2015.",
    `Learning Area/s: ${params.learningAreas}`,
    `Grade Level and Section: ${params.gradeAndSection}`,
    effectiveTitle ? `Requested Lesson Title: ${effectiveTitle}` : "",
    effectiveRefs ? `Requested References: ${effectiveRefs}` : "",
    classroomContextBlock,
    pacingDirective,
    referenceMaterialBlock,
    promptNotes
      ? `Teacher Prompt Notes (extra instructions beyond Classroom Context; never copy into Learner Context):\n${promptNotes}`
      : "",
    "",
    "Target Learning Competencies & Standards:",
    compSection,
    lockedBlueprintBlock ? `\n${lockedBlueprintBlock}` : "",
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
    "Every row under Learning Experience, Assessing Learning, and Ways Forward (Extended Learning Opportunities) must split Teacher's Activity and Student's Activity. Include explicit minute-by-minute pacing, opening routine + well-being check + verbatim objectives, concrete teaching points, guide questions with expected student answers, OHS/PPE checks where applicable, emergency/offline backup resources, and ready-to-use assessment items/rubric with Answer Key, help-seeking ways, and learner accommodations. Do not include Learner Context or Reflections.",
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

  const classroomContext = normalizeClassroomContext(
    dlp.classroomContext,
    (msg) => new DlpValidationError(msg),
  );
  const referenceMaterial = normalizeReferenceMaterial(dlp.referenceMaterial);
  const { classroomContext: _c, referenceMaterial: _r, ...rest } = dlp;
  void _c;
  void _r;

  return {
    ...rest,
    lessonTitle,
    learningAreas,
    gradeAndSection,
    references: dlp.references.trim(),
    ...(classroomContext ? { classroomContext } : {}),
    ...(referenceMaterial ? { referenceMaterial } : {}),
    ...(typeof dlp.aiDeclaration === "string"
      ? { aiDeclaration: dlp.aiDeclaration.trim() }
      : {}),
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
    ...(dlp.classroomContext
      ? [`- **Classroom Context:** ${formatClassroomContextSummary(dlp.classroomContext)}`]
      : []),
    ...(dlp.sourceDllId
      ? [`- **Derived From:** ${dlp.sourceDllId} (Session ${dlp.sourceSessionNumber})`]
      : []),
    ...(dlp.aiDeclaration?.trim()
      ? [`- **Declaration of AI Use:** ${dlp.aiDeclaration.trim()}`]
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
