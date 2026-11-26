import {
  dedupeOrdered,
  formatCompetencyLines,
  parseAiJsonObject,
} from "./lessonHelpers";
import {
  QUIZ_QUESTION_TYPES,
  SESSION_NUMBERS,
  type CurriculumCompetency,
  type DailyLessonLog,
  type DailyLessonPlan,
  type Quiz,
  type QuizItem,
  type QuizItemCounts,
  type QuizQuestionType,
  type QuizSection,
  type QuizSource,
  type SessionNumber,
} from "./types";

export class QuizValidationError extends Error {}
export class QuizNotFoundError extends Error {}

export const QUIZ_SECTION_META: Record<
  QuizQuestionType,
  { title: string; defaultDirections: string }
> = {
  multipleChoice: {
    title: "Multiple Choice",
    defaultDirections: "Choose the letter of the best answer.",
  },
  trueFalse: {
    title: "True or False",
    defaultDirections: "Write True if the statement is correct and False if it is not.",
  },
  identification: {
    title: "Identification",
    defaultDirections: "Identify the term or concept described in each item.",
  },
  essayRubric: {
    title: "Essay / Performance Task",
    defaultDirections: "Answer clearly and concisely based on the rubric.",
  },
};

export const ROMAN_PARTS = ["I", "II", "III", "IV"] as const;
const CHOICE_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

export interface ResolvedQuizContext {
  gradeAndSection: string;
  learningAreas: string;
  source: QuizSource;
  competencyIds: string[];
  learningCompetencies: string[];
  competencies: CurriculumCompetency[];
  lessonContextText?: string;
}

export function validateQuizItemCounts(itemCounts: QuizItemCounts): QuizItemCounts {
  const normalized: QuizItemCounts = {
    multipleChoice: 0,
    trueFalse: 0,
    identification: 0,
    essayRubric: 0,
  };
  let total = 0;
  for (const type of QUIZ_QUESTION_TYPES) {
    const raw = itemCounts[type];
    if (!Number.isInteger(raw) || raw < 0 || raw > 50) {
      throw new QuizValidationError(
        `Invalid item count for ${QUIZ_SECTION_META[type].title}.`,
      );
    }
    normalized[type] = raw;
    total += raw;
  }
  if (total < 1) {
    throw new QuizValidationError("At least one quiz item is required.");
  }
  return normalized;
}

export function resolveStandaloneQuizContext(
  competencyIds: string[],
  gradeAndSection: string,
  competencyMap: Map<string, CurriculumCompetency>,
): ResolvedQuizContext {
  const trimmedGrade = gradeAndSection.trim();
  if (!trimmedGrade) {
    throw new QuizValidationError("Grade Level and Section is required.");
  }
  const ids = dedupeOrdered(competencyIds.map((id) => id.trim()).filter(Boolean));
  if (ids.length === 0) {
    throw new QuizValidationError("At least one Learning Competency is required.");
  }
  const competencies: CurriculumCompetency[] = [];
  for (const id of ids) {
    const comp = competencyMap.get(id);
    if (!comp) {
      throw new QuizValidationError(`Learning Competency not found: ${id}`);
    }
    competencies.push(comp);
  }
  return {
    gradeAndSection: trimmedGrade,
    learningAreas: dedupeOrdered(competencies.map((c) => c.component)).join(", "),
    source: { kind: "standalone", competencyIds: ids },
    competencyIds: ids,
    learningCompetencies: dedupeOrdered(
      competencies.map((c) => c.learningCompetency),
    ),
    competencies,
  };
}

export function resolveDllSessionQuizContext(
  dll: DailyLessonLog,
  sessionNumber: SessionNumber,
  competencyMap: Map<string, CurriculumCompetency>,
): ResolvedQuizContext {
  if (!SESSION_NUMBERS.includes(sessionNumber)) {
    throw new QuizValidationError(`Invalid Session number: ${String(sessionNumber)}.`);
  }
  const session = dll.sessions.find((s) => s.sessionNumber === sessionNumber);
  if (!session) {
    throw new QuizValidationError(`Session ${sessionNumber} not found in Daily Lesson Log.`);
  }
  if (session.mode !== "instructional") {
    throw new QuizValidationError(
      `Cannot create a Quiz from non-instructional Session ${sessionNumber}.`,
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
    source: { kind: "dll", dllId: dll.id, sessionNumber: session.sessionNumber },
    competencyIds: [...session.competencyIds],
    learningCompetencies:
      competencies.length > 0
        ? dedupeOrdered(competencies.map((c) => c.learningCompetency))
        : [...dll.intentions.learningCompetencies],
    competencies,
    lessonContextText: [
      `DLL "${dll.lessonTitle}" — Session ${session.sessionNumber}`,
      session.learningObjectives ? `Learning Objectives: ${session.learningObjectives}` : "",
      session.lessonFlow ? `Lesson Flow: ${session.lessonFlow}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function resolveDlpQuizContext(
  dlp: DailyLessonPlan,
  competencyMap: Map<string, CurriculumCompetency>,
): ResolvedQuizContext {
  const competencies = dlp.competencyIds
    .map((id) => competencyMap.get(id))
    .filter((c): c is CurriculumCompetency => Boolean(c));
  return {
    gradeAndSection: dlp.gradeAndSection,
    learningAreas: dlp.learningAreas,
    source: { kind: "dlp", dlpId: dlp.id },
    competencyIds: [...dlp.competencyIds],
    learningCompetencies:
      competencies.length > 0
        ? dedupeOrdered(competencies.map((c) => c.learningCompetency))
        : [...dlp.intentions.learningCompetencies],
    competencies,
    lessonContextText: [
      `DLP "${dlp.lessonTitle}"`,
      dlp.intentions.learningObjectives
        ? `Learning Objectives: ${dlp.intentions.learningObjectives}`
        : "",
      dlp.lessonFlow.teacherActivity
        ? `Teacher's Activity: ${dlp.lessonFlow.teacherActivity}`
        : "",
      dlp.lessonFlow.studentActivity
        ? `Student's Activity: ${dlp.lessonFlow.studentActivity}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function buildQuizPrompt(params: {
  context: ResolvedQuizContext;
  title?: string;
  promptNotes?: string;
  itemCounts: QuizItemCounts;
}): string {
  const { context } = params;
  const requestedParts = QUIZ_QUESTION_TYPES.filter(
    (type) => params.itemCounts[type] > 0,
  ).map((type) => `- ${type} (${QUIZ_SECTION_META[type].title}): ${params.itemCounts[type]} items`);

  const compSection =
    context.competencies.length > 0
      ? formatCompetencyLines(context.competencies)
      : context.learningCompetencies.map((c) => `- ${c}`).join("\n");

  const promptNotes = params.promptNotes?.trim();

  return [
    "Generate a DepEd MATATAG (Grades 7–12: TLE, Grade 12 Technical-Professional electives, and Grade 11 SHS Core) printable formative Quiz with a complete Answer Key.",
    "When Budget of Work (BoW) metadata is present on target Learning Competencies, align items with the BoW term/week pacing and Suggested Activities, and adapt BoW Suggested Performance Tasks for Essay / Performance Task items and rubrics; Teacher Prompt Notes override these defaults when specified.",
    `Learning Area/s: ${context.learningAreas}`,
    `Grade Level and Section: ${context.gradeAndSection}`,
    params.title?.trim() ? `Requested Quiz Title: ${params.title.trim()}` : "",
    promptNotes ? `Teacher Prompt Notes:\n${promptNotes}` : "",
    "",
    "Target Learning Competencies:",
    compSection,
    context.lessonContextText ? `\nLinked Lesson Context:\n${context.lessonContextText}` : "",
    "",
    "Requested Question Sections and Exact Item Counts:",
    ...requestedParts,
    "",
    "Respond ONLY with valid JSON matching this schema:",
    JSON.stringify(
      {
        title: "string",
        sections: [
          {
            type: "multipleChoice | trueFalse | identification | essayRubric",
            directions: "string",
            items: [
              {
                prompt: "string",
                choices: ["string (4 choices for multipleChoice only)"],
                answer: "string",
                rubric: "string (for essayRubric only)",
              },
            ],
          },
        ],
      },
      null,
      2,
    ),
  ]
    .filter(Boolean)
    .join("\n");
}

interface AiQuizItemPayload {
  prompt?: unknown;
  choices?: unknown;
  answer?: unknown;
  rubric?: unknown;
}

interface AiQuizSectionPayload {
  type?: unknown;
  directions?: unknown;
  items?: unknown;
}

export interface AiQuizPayload {
  title?: unknown;
  sections?: unknown;
}

export function parseAiQuizPayload(rawText: string): AiQuizPayload {
  return parseAiJsonObject(
    rawText,
    "Formative Quiz",
    (msg) => new QuizValidationError(msg),
  ) as AiQuizPayload;
}

export function assembleGeneratedQuizSections(
  itemCounts: QuizItemCounts,
  rawSections: unknown,
): QuizSection[] {
  const sectionList = Array.isArray(rawSections)
    ? (rawSections as AiQuizSectionPayload[])
    : [];
  const byType = new Map<QuizQuestionType, AiQuizSectionPayload>();
  for (const entry of sectionList) {
    if (
      entry &&
      typeof entry.type === "string" &&
      QUIZ_QUESTION_TYPES.includes(entry.type as QuizQuestionType) &&
      !byType.has(entry.type as QuizQuestionType)
    ) {
      byType.set(entry.type as QuizQuestionType, entry);
    }
  }

  const sections: QuizSection[] = [];
  for (const type of QUIZ_QUESTION_TYPES) {
    const count = itemCounts[type];
    if (count <= 0) continue;

    const meta = QUIZ_SECTION_META[type];
    const raw = byType.get(type);
    const rawItems = Array.isArray(raw?.items)
      ? (raw.items as AiQuizItemPayload[])
      : [];

    const items: QuizItem[] = rawItems
      .slice(0, count)
      .map((item, idx): QuizItem | null => {
        const prompt = typeof item?.prompt === "string" ? item.prompt.trim() : "";
        if (!prompt) return null;
        const answer = typeof item?.answer === "string" ? item.answer.trim() : "";
        const choices =
          type === "multipleChoice" && Array.isArray(item.choices)
            ? item.choices
                .map((c) => (typeof c === "string" ? c.trim() : ""))
                .filter(Boolean)
            : undefined;
        const rubric =
          type === "essayRubric" && typeof item.rubric === "string"
            ? item.rubric.trim()
            : undefined;
        return {
          id: `${type}-${idx + 1}`,
          prompt,
          ...(choices ? { choices } : {}),
          answer,
          ...(rubric ? { rubric } : {}),
        };
      })
      .filter((item): item is QuizItem => item !== null);

    if (items.length === 0) {
      throw new QuizValidationError(
        `AI did not generate valid items for ${meta.title}.`,
      );
    }
    const directions =
      typeof raw?.directions === "string" && raw.directions.trim()
        ? raw.directions.trim()
        : meta.defaultDirections;

    sections.push({
      type,
      title: meta.title,
      directions,
      items,
    });
  }

  if (sections.length === 0) {
    throw new QuizValidationError("AI did not generate any valid quiz items.");
  }
  return sections;
}

export function formatChoiceLabel(choice: string, index: number): string {
  const letter = CHOICE_LETTERS[index] ?? String.fromCharCode(65 + index);
  const trimmed = choice.trim();
  return /^[A-F][.)]\s+/i.test(trimmed) ? trimmed : `${letter}. ${trimmed}`;
}

function formatStudentSectionLines(quiz: Quiz, markdown: boolean): string[] {
  const lines: string[] = [];
  quiz.sections.forEach((section, sIdx) => {
    const roman = ROMAN_PARTS[sIdx] ?? String(sIdx + 1);
    lines.push(
      markdown ? `## Part ${roman}. ${section.title}` : `Part ${roman}. ${section.title}`,
    );
    if (markdown) lines.push("");
    if (section.directions) {
      lines.push(
        markdown
          ? `_Directions: ${section.directions}_`
          : `Directions: ${section.directions}`,
      );
      if (markdown) lines.push("");
    }
    section.items.forEach((item, iIdx) => {
      lines.push(`${iIdx + 1}. ${item.prompt}`);
      if (section.type === "multipleChoice" && item.choices) {
        item.choices.forEach((choice, cIdx) => {
          lines.push(`   ${formatChoiceLabel(choice, cIdx)}`);
        });
      }
      if (section.type === "essayRubric" && item.rubric) {
        lines.push(markdown ? `   _Rubric: ${item.rubric}_` : `   Rubric: ${item.rubric}`);
      }
    });
    lines.push("");
  });
  return lines;
}

/** Renders a Quiz into formatted Markdown with student sections and Answer Key. */
export function renderQuizMarkdown(quiz: Quiz): string {
  const lines: string[] = [
    `# ${quiz.title || "Formative Quiz"}`,
    "",
    `- **Learning Area/s:** ${quiz.learningAreas}`,
    `- **Grade Level and Section:** ${quiz.gradeAndSection}`,
    "- **Name:** ________________________",
    "- **Date:** ________________",
    "- **Score:** ________",
    "",
    ...formatStudentSectionLines(quiz, true),
    "## Answer Key",
    "",
  ];

  quiz.sections.forEach((section, sIdx) => {
    const roman = ROMAN_PARTS[sIdx] ?? String(sIdx + 1);
    lines.push(`### Part ${roman}. ${section.title}`);
    section.items.forEach((item, iIdx) => {
      const rubricSuffix =
        item.rubric && section.type === "essayRubric"
          ? ` (Rubric: ${item.rubric})`
          : "";
      lines.push(`${iIdx + 1}. ${item.answer || "—"}${rubricSuffix}`);
    });
    lines.push("");
  });

  return lines.join("\n");
}

/** Normalizes and validates an inline-edited Quiz before persistence. */
export function normalizeEditedQuiz(quiz: Quiz): Quiz {
  const title = quiz.title.trim();
  if (!title) {
    throw new QuizValidationError("Quiz Title is required.");
  }
  const learningAreas = quiz.learningAreas.trim();
  if (!learningAreas) {
    throw new QuizValidationError("Learning Area/s is required.");
  }
  const gradeAndSection = quiz.gradeAndSection.trim();
  if (!gradeAndSection) {
    throw new QuizValidationError("Grade Level and Section is required.");
  }

  const sections: QuizSection[] = quiz.sections.map((section) => {
    const items = section.items.map((item, idx) => {
      const prompt = item.prompt.trim();
      if (!prompt) {
        throw new QuizValidationError(
          `Question prompt is required in ${section.title} item ${idx + 1}.`,
        );
      }
      const choices =
        section.type === "multipleChoice" && Array.isArray(item.choices)
          ? item.choices.map((c) => c.trim()).filter(Boolean)
          : undefined;
      const rubric =
        section.type === "essayRubric" && typeof item.rubric === "string"
          ? item.rubric.trim()
          : undefined;
      return {
        id: item.id || `${section.type}-${idx + 1}`,
        prompt,
        ...(choices ? { choices } : {}),
        answer: item.answer.trim(),
        ...(rubric ? { rubric } : {}),
      };
    });
    return {
      ...section,
      title: section.title.trim() || QUIZ_SECTION_META[section.type].title,
      directions: section.directions.trim(),
      items,
    };
  });

  if (sections.every((s) => s.items.length === 0)) {
    throw new QuizValidationError("At least one quiz item is required.");
  }

  return {
    ...quiz,
    title,
    learningAreas,
    gradeAndSection,
    promptNotes: quiz.promptNotes.trim(),
    sections: sections.filter((s) => s.items.length > 0),
    updatedAt: new Date().toISOString(),
  };
}

/** Formats student-facing quiz sections (excluding Answer Key) for lesson sync. */
export function formatQuizForLesson(quiz: Quiz): string {
  return [
    `Formative Quiz: ${quiz.title}`,
    "",
    ...formatStudentSectionLines(quiz, false),
  ]
    .join("\n")
    .trim();
}
