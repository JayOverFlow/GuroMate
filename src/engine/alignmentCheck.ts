import { resolveDerivedSessionLocks } from "./dlp";
import {
  ASSESSMENT_TYPE_PATTERNS,
  DEFAULT_CLASSROOM_CONTEXT,
  DOMAIN_PREFIX_PATTERN,
  FORMATIVE_ASSESSMENT_LABELS,
  cleanObjectiveBullets,
  hasMatchingCompetencyIds,
  inferAssessmentTypeFromText,
} from "./lessonHelpers";
import type {
  AlignmentCheckItem,
  AlignmentCheckResult,
  DailyLessonLog,
  DailyLessonPlan,
  DllLessonBlueprint,
  DllSessionPlan,
  DlpLessonBlueprint,
  SessionNumber,
} from "./types";

const EMERGENCY_RESOURCE_PATTERN =
  /\b(emergency|emergencies|offline|backup|back-up|fallback|alternative|alternatives|no[- ]power|power outage|brownout|blackout|contingency|no[- ]internet|without internet|without power|without projector|printed?\s+(?:backup|copy|copies|handout|handouts|cards?|sheets?|worksheets?)|chalkboard\s+(?:backup|alternative|diagram)|manila\s+paper\s+(?:backup|alternative))\b/i;

const FEEDBACK_HELP_SEEKING_PATTERN =
  /\b(feedback|help[- ]seeking|help\s+cards?|traffic[- ]light|raise\s+(?:a\s+)?(?:hand|card)|ask\s+(?:for\s+)?(?:guidance|help|support|clarification|questions?)|seek(?:ing)?\s+(?:guidance|help|support)|check[- ]in|teacher\s+(?:circulation|roaming|coaching|conferencing|guidance)|peer\s+(?:coaching|feedback|support|review)|guided\s+prompting|clarifying\s+questions?)\b/i;

const ACCOMMODATION_PATTERN =
  /\b(accommodat(?:ion|ions|e|ing)|differentiated|differentiation|varied\s+response|oral\s+(?:response|option|explanation)|visual\s+(?:support|supports|aid|aids|cue|cues|card|cards)|auditory\s+(?:support|supports|aid|aids)|small[- ]group|extended\s+time|extra\s+time|bilingual|tagalog|filipino|scaffolding|scaffolded|large[- ]print|peer[- ]assisted|buddy\s+system|assistive|inclusive\s+(?:option|format|support)|demonstrate\s+orally|sentence\s+starters?)\b/i;

const STOP_WORDS = new Set([
  "with",
  "from",
  "into",
  "that",
  "this",
  "their",
  "about",
  "using",
  "session",
  "activity",
  "guided",
  "hands",
  "lesson",
  "based",
]);

const RESOURCE_BOILERPLATE_WORDS = new Set([
  ...STOP_WORDS,
  "emergency",
  "emergencies",
  "offline",
  "backup",
  "fallback",
  "alternative",
  "alternatives",
  "resource",
  "resources",
  "material",
  "materials",
  "learning",
  "classroom",
  "teacher",
  "student",
  "students",
  "learners",
  "learner",
  "printed",
  "primary",
  "available",
  "inclusive",
  "equipment",
  "tools",
  "tool",
  "items",
  "supplies",
  "none",
]);

const ACCOMMODATION_DURATION_AFTER =
  /^\s*(?:extra|extended|additional|more)\s+time\b|^\s*(?:period|class|session|block|lab\s+period|shop\s+period)\b/i;

const ACCOMMODATION_DURATION_BEFORE =
  /\b(?:extra|extended|additional)\s+(?:time\s*(?:of\s*)?)?$/i;

function splitNonEmptyLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeObjectivesForCompare(raw: string): string {
  return cleanObjectiveBullets(raw)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function extractSignificantWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
}

function textReflectsTitle(text: string, title: string): boolean {
  const cleanTitle = title.trim().toLowerCase();
  if (!cleanTitle) return true;
  const lowerText = text.toLowerCase();
  if (lowerText.includes(cleanTitle)) return true;

  const keywords = extractSignificantWords(cleanTitle);
  if (keywords.length === 0) return true;
  const matched = keywords.filter((word) => lowerText.includes(word)).length;
  return matched >= Math.ceil(keywords.length * 0.5);
}

function extractKeyResourceKeywords(parentResources: string): string[] {
  const seen = new Set<string>();
  const words = parentResources
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !RESOURCE_BOILERPLATE_WORDS.has(w));
  const out: string[] = [];
  for (const word of words) {
    if (!seen.has(word)) {
      seen.add(word);
      out.push(word);
    }
  }
  return out;
}

interface TimeMatch {
  minutes: number;
  index: number;
  endIndex: number;
}

const DURATION_BODY =
  "(?:(\\d+(?:\\.\\d+)?)\\s*(?:hrs?|hours?)(?:\\s*(\\d+)\\s*(?:mins?|minutes?))?|(\\d+)\\s*-?\\s*(?:mins?|minutes?)\\b)";

const STRUCTURAL_DURATION_PATTERN = new RegExp(
  [
    `[\\(\\[]\\s*${DURATION_BODY}\\s*[\\)\\]]`,
    `\\b(?:time|duration|pacing|allotment|total)\\s*[:\\-–—]\\s*${DURATION_BODY}`,
    `(?:^|[\\n;])\\s*(?:[•\\-*]\\s*)?${DURATION_BODY}\\s*[:\\-–—]`,
  ].join("|"),
  "gi",
);

/**
 * Deterministically extracts structural allocated minutes for a single DLP section.
 * Matches structural phase/section timing allocations (parenthesized `(10 mins)`, labeled `Time: 10 mins`,
 * or heading/bullet prefixes like `10 minutes —`) while ignoring incidental prose durations inside
 * learner accommodations (e.g., `"5 minutes extra time"`, `"10 minutes extended time"`).
 */
export function extractSectionAllocatedMinutes(text: string): number | null {
  if (!text.trim()) return null;

  const matches: TimeMatch[] = [];
  for (const match of text.matchAll(STRUCTURAL_DURATION_PATTERN)) {
    const idx = match.index ?? 0;
    const endIdx = idx + match[0].length;
    const before = text.slice(Math.max(0, idx - 28), idx);
    const after = text.slice(endIdx, endIdx + 32);
    if (
      ACCOMMODATION_DURATION_BEFORE.test(before) ||
      ACCOMMODATION_DURATION_AFTER.test(after)
    ) {
      continue;
    }

    const rawHours = match[1] ?? match[4] ?? match[7];
    const rawExtraMins = match[2] ?? match[5] ?? match[8];
    const rawMins = match[3] ?? match[6] ?? match[9];
    let minutes = 0;
    if (rawHours !== undefined) {
      minutes =
        Math.round(Number(rawHours) * 60) +
        (rawExtraMins ? Number(rawExtraMins) : 0);
    } else if (rawMins !== undefined) {
      minutes = Number(rawMins);
    }
    if (Number.isFinite(minutes) && minutes > 0) {
      matches.push({
        minutes,
        index: idx,
        endIndex: endIdx,
      });
    }
  }

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0]!.minutes;

  const first = matches[0]!;
  const restSum = matches.slice(1).reduce((acc, m) => acc + m.minutes, 0);
  const prefixBeforeFirst = text.slice(0, first.index).trim();
  const isLeadingHeader =
    prefixBeforeFirst.length <= 28 && !/[.!?]/.test(prefixBeforeFirst);

  if (isLeadingHeader && first.minutes === restSum) {
    return first.minutes;
  }

  const last = matches[matches.length - 1]!;
  const prevSum = matches.slice(0, -1).reduce((acc, m) => acc + m.minutes, 0);
  const lastSpan = text.slice(Math.max(0, last.index - 20), last.endIndex);
  if (/\btotal\b/i.test(lastSpan) && last.minutes === prevSum) {
    return last.minutes;
  }

  return matches.reduce((acc, m) => acc + m.minutes, 0);
}

function formatSessionList(sessions: SessionNumber[]): string {
  return sessions.map((n) => `Session ${n}`).join(", ");
}

function finalizeResult(
  items: AlignmentCheckItem[],
  autoRepaired: boolean,
): AlignmentCheckResult {
  const structuralValid = items.every((item) => item.severity !== "error");
  const passed = items.every((item) => item.severity === "pass");
  return {
    passed,
    structuralValid,
    autoRepaired,
    checkedAt: new Date().toISOString(),
    items,
  };
}

const DLL_REQUIRED_SESSION_FIELDS: ReadonlyArray<{
  key: keyof Pick<
    DllSessionPlan,
    | "learningObjectives"
    | "preLesson"
    | "lessonFlow"
    | "learningResources"
    | "formativeAssessment"
    | "extendedLearningOpportunities"
  >;
  label: string;
}> = [
  { key: "learningObjectives", label: "Learning Objectives" },
  { key: "preLesson", label: "Pre-Lesson" },
  { key: "lessonFlow", label: "Lesson Flow" },
  { key: "learningResources", label: "Learning Resources" },
  { key: "formativeAssessment", label: "Formative Assessment" },
  { key: "extendedLearningOpportunities", label: "Extended Learning Opportunities" },
];

export interface EvaluateDllAlignmentOptions {
  blueprint?: DllLessonBlueprint;
  autoRepaired?: boolean;
}

/** Pure, deterministic DO 016, s. 2026 Alignment Check for a 5-Session Daily Lesson Log (DLL). */
export function evaluateDllAlignment(
  dll: DailyLessonLog,
  options: EvaluateDllAlignmentOptions = {},
): AlignmentCheckResult {
  const items: AlignmentCheckItem[] = [];
  const instructionalSessions = dll.sessions.filter(
    (s) => s.mode === "instructional",
  );

  // 1. Hard Structural Completeness
  const structuralErrors: AlignmentCheckItem[] = [];
  if (instructionalSessions.length === 0) {
    structuralErrors.push({
      code: "structure",
      label: "ILAW Structural Completeness",
      severity: "error",
      message: "At least one instructional Session with core ILAW sections is required.",
    });
  } else {
    for (const session of instructionalSessions) {
      const missing = DLL_REQUIRED_SESSION_FIELDS.filter(
        (field) => !session[field.key].trim(),
      ).map((field) => field.label);
      if (missing.length > 0) {
        structuralErrors.push({
          code: "structure",
          label: "ILAW Structural Completeness",
          severity: "error",
          sessionNumber: session.sessionNumber,
          message: `Session ${session.sessionNumber} is missing required ILAW fields: ${missing.join(", ")}.`,
        });
      }
    }
  }

  if (structuralErrors.length > 0) {
    items.push(...structuralErrors);
  } else {
    items.push({
      code: "structure",
      label: "ILAW Structural Completeness",
      severity: "pass",
      message:
        "All instructional Sessions include complete core ILAW sections.",
    });
  }

  // 2. Soft Check: 3-Bullet SMART Learning Objectives (+ Approved Lesson Blueprint alignment)
  const blueprintBySession = new Map<
    SessionNumber,
    { learningObjectives: string; competencyIds: string[] }
  >();
  if (options.blueprint) {
    for (const bpSession of options.blueprint.sessions) {
      if (bpSession.mode === "instructional" && bpSession.learningObjectives.trim()) {
        blueprintBySession.set(bpSession.sessionNumber, {
          learningObjectives: bpSession.learningObjectives,
          competencyIds: bpSession.competencyIds,
        });
      }
    }
  }

  const objectiveWarnings: AlignmentCheckItem[] = [];
  for (const session of instructionalSessions) {
    const lines = splitNonEmptyLines(session.learningObjectives);
    if (lines.length !== 3) {
      objectiveWarnings.push({
        code: "objectives",
        label: "Learning Objectives (3-Bullet SMART)",
        severity: "warning",
        sessionNumber: session.sessionNumber,
        message: `Session ${session.sessionNumber} has ${lines.length} objective line${lines.length === 1 ? "" : "s"} instead of 3 bulleted SMART Learning Objectives.`,
      });
    }
    if (lines.some((line) => DOMAIN_PREFIX_PATTERN.test(line))) {
      objectiveWarnings.push({
        code: "objectives",
        label: "Learning Objectives (No Domain Prefixes)",
        severity: "warning",
        sessionNumber: session.sessionNumber,
        message: `Session ${session.sessionNumber} includes a domain-label prefix (Cognitive/Psychomotor/Affective); remove domain prefixes per DO 016 format.`,
      });
    }
    const expectedBp = blueprintBySession.get(session.sessionNumber);
    if (
      expectedBp &&
      hasMatchingCompetencyIds(expectedBp.competencyIds, session.competencyIds) &&
      normalizeObjectivesForCompare(session.learningObjectives) !==
        normalizeObjectivesForCompare(expectedBp.learningObjectives)
    ) {
      objectiveWarnings.push({
        code: "objectives",
        label: "Blueprint Objective Alignment",
        severity: "warning",
        sessionNumber: session.sessionNumber,
        message: `Session ${session.sessionNumber} Learning Objectives differ from the approved Lesson Blueprint.`,
      });
    }
  }

  if (objectiveWarnings.length > 0) {
    items.push(...objectiveWarnings);
  } else {
    items.push({
      code: "objectives",
      label: "Learning Objectives (3-Bullet SMART)",
      severity: "pass",
      message: options.blueprint
        ? "All instructional Sessions preserve 3 SMART Learning Objectives aligned to the approved Lesson Blueprint."
        : "All instructional Sessions include 3 SMART Learning Objectives without domain-label prefixes.",
    });
  }

  // 3. Soft Check: Emergency / Offline Resource Alternatives
  const missingEmergencySessions = instructionalSessions
    .filter((s) => !EMERGENCY_RESOURCE_PATTERN.test(s.learningResources))
    .map((s) => s.sessionNumber);

  if (missingEmergencySessions.length > 0) {
    items.push({
      code: "emergency-resources",
      label: "Emergency / Offline Resources",
      severity: "warning",
      ...(missingEmergencySessions.length === 1
        ? { sessionNumber: missingEmergencySessions[0] }
        : {}),
      message: `${formatSessionList(missingEmergencySessions)} Learning Resources do not mention an emergency or offline backup (e.g., print, chalkboard, or no-power alternative).`,
    });
  } else {
    items.push({
      code: "emergency-resources",
      label: "Emergency / Offline Resources",
      severity: "pass",
      message:
        "All instructional Sessions include an emergency or offline resource alternative.",
    });
  }

  // 4. Soft Check: Formative Feedback/Help-Seeking Cues & Learner Accommodations
  const missingFeedbackSessions = instructionalSessions
    .filter((s) => !FEEDBACK_HELP_SEEKING_PATTERN.test(s.formativeAssessment))
    .map((s) => s.sessionNumber);
  const missingAccommodationSessions = instructionalSessions
    .filter((s) => !ACCOMMODATION_PATTERN.test(s.formativeAssessment))
    .map((s) => s.sessionNumber);

  if (
    missingFeedbackSessions.length === 0 &&
    missingAccommodationSessions.length === 0
  ) {
    items.push({
      code: "formative-support",
      label: "Formative Feedback & Accommodations",
      severity: "pass",
      message:
        "All instructional Sessions include feedback/help-seeking cues and learner accommodations.",
    });
  } else {
    if (missingFeedbackSessions.length > 0) {
      items.push({
        code: "formative-support",
        label: "Formative Feedback & Help-Seeking",
        severity: "warning",
        ...(missingFeedbackSessions.length === 1
          ? { sessionNumber: missingFeedbackSessions[0] }
          : {}),
        message: `${formatSessionList(missingFeedbackSessions)} Formative Assessment lacks explicit learner help-seeking or ongoing feedback cues.`,
      });
    }
    if (missingAccommodationSessions.length > 0) {
      items.push({
        code: "formative-support",
        label: "Learner Accommodations",
        severity: "warning",
        ...(missingAccommodationSessions.length === 1
          ? { sessionNumber: missingAccommodationSessions[0] }
          : {}),
        message: `${formatSessionList(missingAccommodationSessions)} Formative Assessment lacks learner accommodations (e.g., varied response formats, small-group options, or visual/auditory supports).`,
      });
    }
  }

  return finalizeResult(items, Boolean(options.autoRepaired));
}

export interface EvaluateDlpAlignmentOptions {
  blueprint?: DlpLessonBlueprint;
  parentSession?: DllSessionPlan;
  autoRepaired?: boolean;
}

/** Pure, deterministic DO 016, s. 2026 Alignment Check for a single-session Daily Lesson Plan (DLP). */
export function evaluateDlpAlignment(
  dlp: DailyLessonPlan,
  options: EvaluateDlpAlignmentOptions = {},
): AlignmentCheckResult {
  const items: AlignmentCheckItem[] = [];

  // 1. Hard Structural Completeness (paired Teacher/Student rows + core sections)
  const missingFields: string[] = [];
  if (!dlp.intentions.learningObjectives.trim()) {
    missingFields.push("Learning Objectives");
  }
  const requiredPairs: ReadonlyArray<{
    label: string;
    pair: { teacherActivity: string; studentActivity: string };
  }> = [
    { label: "Pre-Lesson", pair: dlp.preLesson },
    { label: "Lesson Flow", pair: dlp.lessonFlow },
    { label: "Learning Resources", pair: dlp.learningResources },
    { label: "Formative Assessment", pair: dlp.formativeAssessment },
  ];
  for (const row of requiredPairs) {
    if (!row.pair.teacherActivity.trim()) {
      missingFields.push(`${row.label} (Teacher's Activity)`);
    }
    if (!row.pair.studentActivity.trim()) {
      missingFields.push(`${row.label} (Student's Activity)`);
    }
  }
  if (!dlp.extendedLearningOpportunities.teacherActivity.trim()) {
    missingFields.push("Extended Learning Opportunities (Teacher's Activity)");
  }

  if (missingFields.length > 0) {
    items.push({
      code: "structure",
      label: "ILAW Paired Structure",
      severity: "error",
      message: `Missing required DLP fields: ${missingFields.join(", ")}.`,
    });
  } else {
    items.push({
      code: "structure",
      label: "ILAW Paired Structure",
      severity: "pass",
      message:
        "All core ILAW sections and paired Teacher/Student activities are populated.",
    });
  }

  // 2. Soft Check: 3-Bullet SMART Learning Objectives (+ Approved Blueprint alignment)
  const objectiveLines = splitNonEmptyLines(dlp.intentions.learningObjectives);
  const objectiveIssues: string[] = [];
  if (objectiveLines.length !== 3) {
    objectiveIssues.push(
      `Found ${objectiveLines.length} objective line${objectiveLines.length === 1 ? "" : "s"} instead of 3 bulleted SMART Learning Objectives.`,
    );
  }
  if (objectiveLines.some((line) => DOMAIN_PREFIX_PATTERN.test(line))) {
    objectiveIssues.push(
      "Contains a domain-label prefix (Cognitive/Psychomotor/Affective); remove domain prefixes per DO 016 format.",
    );
  }
  if (
    options.blueprint?.learningObjectives.trim() &&
    !options.parentSession &&
    normalizeObjectivesForCompare(dlp.intentions.learningObjectives) !==
      normalizeObjectivesForCompare(options.blueprint.learningObjectives)
  ) {
    objectiveIssues.push(
      "Learning Objectives differ from the approved Lesson Blueprint.",
    );
  }

  if (objectiveIssues.length > 0) {
    items.push({
      code: "objectives",
      label: "Learning Objectives (3-Bullet SMART)",
      severity: "warning",
      message: objectiveIssues.join(" "),
    });
  } else {
    items.push({
      code: "objectives",
      label: "Learning Objectives (3-Bullet SMART)",
      severity: "pass",
      message: options.blueprint
        ? "Includes 3 SMART Learning Objectives aligned to the approved Lesson Blueprint."
        : "Includes 3 SMART Learning Objectives without domain-label prefixes.",
    });
  }

  // 3. Soft Check: Emergency / Offline Resource Alternatives
  const combinedResources = `${dlp.learningResources.teacherActivity}\n${dlp.learningResources.studentActivity}`;
  if (!EMERGENCY_RESOURCE_PATTERN.test(combinedResources)) {
    items.push({
      code: "emergency-resources",
      label: "Emergency / Offline Resources",
      severity: "warning",
      message:
        "Learning Resources do not mention an emergency or offline backup (e.g., print, chalkboard, or no-power alternative).",
    });
  } else {
    items.push({
      code: "emergency-resources",
      label: "Emergency / Offline Resources",
      severity: "pass",
      message:
        "Learning Resources include an emergency or offline alternative.",
    });
  }

  // 4. Soft Check: Formative Feedback/Help-Seeking Cues & Learner Accommodations
  const combinedAssessment = `${dlp.formativeAssessment.teacherActivity}\n${dlp.formativeAssessment.studentActivity}`;
  const hasFeedback = FEEDBACK_HELP_SEEKING_PATTERN.test(combinedAssessment);
  const hasAccommodations = ACCOMMODATION_PATTERN.test(combinedAssessment);

  if (hasFeedback && hasAccommodations) {
    items.push({
      code: "formative-support",
      label: "Formative Feedback & Accommodations",
      severity: "pass",
      message:
        "Formative Assessment includes feedback/help-seeking cues and learner accommodations.",
    });
  } else {
    if (!hasFeedback) {
      items.push({
        code: "formative-support",
        label: "Formative Feedback & Help-Seeking",
        severity: "warning",
        message:
          "Formative Assessment lacks explicit ways for learners to ask for guidance or receive ongoing feedback.",
      });
    }
    if (!hasAccommodations) {
      items.push({
        code: "formative-support",
        label: "Learner Accommodations",
        severity: "warning",
        message:
          "Formative Assessment lacks learner accommodations (e.g., varied response formats, small-group options, or visual/auditory supports).",
      });
    }
  }

  // 5. Soft Check: DLP Period-Length Pacing Total
  const targetMinutes =
    dlp.classroomContext?.periodMinutes ?? DEFAULT_CLASSROOM_CONTEXT.periodMinutes;
  const preMinutes =
    extractSectionAllocatedMinutes(dlp.preLesson.teacherActivity) ??
    extractSectionAllocatedMinutes(dlp.preLesson.studentActivity);
  const flowMinutes =
    extractSectionAllocatedMinutes(dlp.lessonFlow.teacherActivity) ??
    extractSectionAllocatedMinutes(dlp.lessonFlow.studentActivity);
  const assessMinutes =
    extractSectionAllocatedMinutes(dlp.formativeAssessment.teacherActivity) ??
    extractSectionAllocatedMinutes(dlp.formativeAssessment.studentActivity);

  if (preMinutes === null && flowMinutes === null && assessMinutes === null) {
    items.push({
      code: "dlp-pacing",
      label: "DLP Period Pacing",
      severity: "warning",
      message: `No explicit minute allocations found across Pre-Lesson, Lesson Flow, and Formative Assessment (target: ${targetMinutes} min).`,
    });
  } else {
    const totalMinutes =
      (preMinutes ?? 0) + (flowMinutes ?? 0) + (assessMinutes ?? 0);
    if (totalMinutes === targetMinutes) {
      items.push({
        code: "dlp-pacing",
        label: "DLP Period Pacing",
        severity: "pass",
        message: `Allocated minutes (${preMinutes ?? 0} + ${flowMinutes ?? 0} + ${assessMinutes ?? 0} = ${totalMinutes} min) match the ${targetMinutes}-minute Classroom Context period.`,
      });
    } else {
      items.push({
        code: "dlp-pacing",
        label: "DLP Period Pacing",
        severity: "warning",
        message: `Allocated minutes sum to ${totalMinutes} min (Pre-Lesson: ${preMinutes ?? 0}, Lesson Flow: ${flowMinutes ?? 0}, Assessing Learning: ${assessMinutes ?? 0}), expected ${targetMinutes} min for this Classroom Context.`,
      });
    }
  }

  // 6. Soft Check: Strict Derived DLL -> DLP Fidelity
  if (dlp.sourceDllId && options.parentSession) {
    const parent = options.parentSession;
    const parentLocks = resolveDerivedSessionLocks(parent, []);
    const driftIssues: string[] = [];

    if (
      parent.learningObjectives.trim() &&
      normalizeObjectivesForCompare(dlp.intentions.learningObjectives) !==
        normalizeObjectivesForCompare(parent.learningObjectives)
    ) {
      driftIssues.push(
        `Learning Objectives differ from parent DLL Session ${parent.sessionNumber}.`,
      );
    }

    const parentActivity =
      parent.selectedActivityTitle?.trim() || parent.lessonFlow.trim()
        ? parentLocks.activityTitle
        : "";
    if (parentActivity) {
      const dlpFlowCombined = `${dlp.lessonFlow.teacherActivity}\n${dlp.lessonFlow.studentActivity}`;
      const metaMismatch =
        Boolean(dlp.selectedActivityTitle?.trim()) &&
        dlp.selectedActivityTitle!.trim().toLowerCase() !==
          parentActivity.toLowerCase();
      if (metaMismatch || !textReflectsTitle(dlpFlowCombined, parentActivity)) {
        driftIssues.push(
          `Lesson Flow does not stay aligned with parent DLL Session ${parent.sessionNumber} chosen activity "${parentActivity}".`,
        );
      }
    }

    const parentAssessmentType =
      parent.selectedAssessmentType ??
      inferAssessmentTypeFromText(parent.formativeAssessment);
    if (parentAssessmentType) {
      const expectedLabel = FORMATIVE_ASSESSMENT_LABELS[parentAssessmentType];
      const metaMismatch =
        Boolean(dlp.selectedAssessmentType) &&
        dlp.selectedAssessmentType !== parentAssessmentType;
      const textMismatch = !ASSESSMENT_TYPE_PATTERNS[parentAssessmentType].test(
        combinedAssessment,
      );
      if (metaMismatch || textMismatch) {
        driftIssues.push(
          `Formative Assessment does not reflect parent DLL Session ${parent.sessionNumber} chosen type (${expectedLabel}).`,
        );
      }
    }

    if (parent.learningResources.trim()) {
      const parentResourceKeywords = extractKeyResourceKeywords(
        parent.learningResources,
      );
      if (parentResourceKeywords.length > 0) {
        const lowerResources = combinedResources.toLowerCase();
        const missingKeywords = parentResourceKeywords.filter(
          (kw) => !lowerResources.includes(kw),
        );
        const matchedCount = parentResourceKeywords.length - missingKeywords.length;
        const minExpected = Math.ceil(parentResourceKeywords.length * 0.35);
        if (matchedCount < minExpected) {
          const sampleMissing = missingKeywords.slice(0, 4).join(", ");
          driftIssues.push(
            `Learning Resources dropped key materials from parent DLL Session ${parent.sessionNumber} (missing: ${sampleMissing}).`,
          );
        }
      }
    }

    if (driftIssues.length > 0) {
      items.push({
        code: "dll-dlp-fidelity",
        label: "DLL → DLP Derivation Fidelity",
        severity: "warning",
        sessionNumber: parent.sessionNumber,
        message: driftIssues.join(" "),
      });
    } else {
      items.push({
        code: "dll-dlp-fidelity",
        label: "DLL → DLP Derivation Fidelity",
        severity: "pass",
        sessionNumber: parent.sessionNumber,
        message: `Derived DLP matches parent DLL Session ${parent.sessionNumber} Learning Objectives, activity, key Learning Resources, and Formative Assessment.`,
      });
    }
  }

  return finalizeResult(items, Boolean(options.autoRepaired));
}

/** Formats hard structural errors into a concise, actionable list for a single targeted AI repair call. */
export function summarizeStructuralErrors(result: AlignmentCheckResult): string[] {
  return result.items
    .filter((item) => item.severity === "error")
    .map((item) => item.message);
}
