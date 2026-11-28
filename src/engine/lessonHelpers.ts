import { AI_PROVIDER_MAP } from "./providers";
import {
  CLASSROOM_FACILITIES,
  DELIVERY_MODALITIES,
  FORMATIVE_ASSESSMENT_TYPES,
  MAX_PERIOD_MINUTES,
  MIN_PERIOD_MINUTES,
  type AiProviderSettings,
  type BlueprintActivityOption,
  type BlueprintAssessmentOption,
  type BudgetOfWorkInfo,
  type ClassroomContext,
  type ClassroomFacility,
  type CurriculumCompetency,
  type DeliveryModality,
  type FormativeAssessmentType,
  type ReferenceMaterial,
  type TeacherProfileSettings,
  type TleComponent,
} from "./types";

export const MAX_REFERENCE_MATERIAL_CHARS = 10_000;
export const MAX_REFERENCE_FILE_BYTES = 10 * 1024 * 1024;

export const DOMAIN_PREFIX_PATTERN =
  /^(?:[•\-*]\s*|\d+[.)]\s*)?(?:cognitive|psychomotor|affective)\s*(?:domain)?\s*[:\-–—]\s*/i;

export const ASSESSMENT_TYPE_PATTERNS: Record<FormativeAssessmentType, RegExp> = {
  "exit-ticket":
    /\b(exit\s*ticket|exit\s*slip|reflection\s*slip|3-2-1|one-minute\s+paper)\b/i,
  checklist: /\b(checklist|observation|skill\s+check)\b/i,
  "demo-rubric":
    /\b(rubric|performance\s*\/?\s*demo|performance\s+task|demonstration\s+(?:rubric|criteria)|scoring\s+criteria)\b/i,
  worksheet: /\b(worksheet|activity\s+sheet|graphic\s+organizer|practice\s+sheet)\b/i,
  "short-quiz":
    /\b(quiz|multiple[- ]choice|identification|true\s+or\s+false|matching\s+type|short\s+answer)\b/i,
};

const ASSESSMENT_INFERENCE_ORDER: ReadonlyArray<FormativeAssessmentType> = [
  "demo-rubric",
  "checklist",
  "worksheet",
  "short-quiz",
  "exit-ticket",
];

/** Infers a DO 8, s. 2015 Formative Assessment type from free text, or undefined if none matches. */
export function inferAssessmentTypeFromText(
  text: string,
): FormativeAssessmentType | undefined {
  for (const type of ASSESSMENT_INFERENCE_ORDER) {
    if (ASSESSMENT_TYPE_PATTERNS[type].test(text)) {
      return type;
    }
  }
  return undefined;
}

/** Builds a fallback 3-bullet SMART Learning Objectives list when AI omits objectives during planning. */
export function buildFallbackObjectives(topic: string): string {
  const cleanTopic = topic.trim() || "the target topic";
  return [
    `• Explain the core concepts and principles of ${cleanTopic} accurately.`,
    `• Demonstrate a guided practical task applying ${cleanTopic} following safety standards.`,
    `• Express appreciation for responsible, collaborative practices in ${cleanTopic}.`,
  ].join("\n");
}

/** Checks whether two Learning Competency ID lists represent the same set of competencies. */
export function hasMatchingCompetencyIds(
  a: readonly string[],
  b: readonly string[],
): boolean {
  const normA = dedupeOrdered(a.map((id) => id.trim()).filter(Boolean));
  const normB = dedupeOrdered(b.map((id) => id.trim()).filter(Boolean));
  if (normA.length !== normB.length) return false;
  const setB = new Set(normB);
  return normA.every((id) => setB.has(id));
}

export const DEFAULT_CLASSROOM_CONTEXT: ClassroomContext = {
  periodMinutes: 60,
  facility: "standard-classroom",
  modality: "face-to-face",
};

export const CLASSROOM_FACILITY_LABELS: Record<ClassroomFacility, string> = {
  "standard-classroom": "Standard Classroom (no lab/shop)",
  "computer-lab": "Computer Lab (PCs / workstations)",
  "shop-workshop": "Shop / Workshop (tools & workbenches)",
  "kitchen-home-economics": "Home Economics / Kitchen Lab",
  "agri-farm-site": "Agri-Fishery / Farm / Garden Site",
  "limited-resources": "Limited / Offline Classroom (no projector/power)",
};

export const DELIVERY_MODALITY_LABELS: Record<DeliveryModality, string> = {
  "face-to-face": "Face-to-Face",
  blended: "Blended",
  "modular-offline": "Modular / Offline",
};

export const FORMATIVE_ASSESSMENT_LABELS: Record<
  FormativeAssessmentType,
  string
> = {
  "exit-ticket": "Exit Ticket",
  checklist: "Observation / Skill Checklist",
  "demo-rubric": "Performance / Demo Rubric",
  worksheet: "Activity Worksheet",
  "short-quiz": "Short Quiz",
};

const FORMATIVE_ASSESSMENT_DEFAULT_PREVIEWS: Record<
  FormativeAssessmentType,
  (topic: string) => string
> = {
  "exit-ticket": (topic) =>
    `Quick 3-prompt check on key takeaways and questions about ${topic}.`,
  checklist: (topic) =>
    `Teacher and peer observation checklist verifying safe, accurate steps for ${topic}.`,
  "demo-rubric": (topic) =>
    `3-criterion rubric scoring hands-on execution, accuracy, and safety on ${topic}.`,
  worksheet: (topic) =>
    `Structured practice sheet applying ${topic} concepts to a Philippine classroom scenario.`,
  "short-quiz": (topic) =>
    `Brief objective check (3–5 items) verifying mastery of core ${topic} concepts.`,
};

/** Removes accidental Cognitive:/Psychomotor:/Affective: domain prefixes from bulleted objectives. */
export function cleanObjectiveBullets(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      const withoutBullet = trimmed.replace(/^(?:[•\-*]\s*|\d+[.)]\s*)/, "");
      const withoutPrefix = withoutBullet.replace(DOMAIN_PREFIX_PATTERN, "");
      return `• ${withoutPrefix.trim()}`;
    })
    .filter(Boolean)
    .join("\n");
}

function normalizeSingleLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export interface RawBlueprintActivityOption {
  id?: unknown;
  title?: unknown;
  summary?: unknown;
  source?: unknown;
  recommended?: unknown;
}

export interface RawBlueprintAssessmentOption {
  type?: unknown;
  label?: unknown;
  preview?: unknown;
  recommended?: unknown;
}

function nextUniqueActivityId(idPrefix: string, usedIds: Set<string>): string {
  let index = 1;
  while (usedIds.has(`${idPrefix}-act-${index}`)) {
    index += 1;
  }
  return `${idPrefix}-act-${index}`;
}

/** Normalizes 2–3 concrete Lesson Blueprint activity options and guarantees exactly one recommended pick. */
export function normalizeBlueprintActivityOptions(params: {
  rawOptions: unknown;
  idPrefix: string;
  competencies: CurriculumCompetency[];
}): { options: BlueprintActivityOption[]; selectedActivityId: string } {
  const parsed: BlueprintActivityOption[] = [];
  const usedIds = new Set<string>();

  if (Array.isArray(params.rawOptions)) {
    for (const item of params.rawOptions) {
      if (parsed.length >= 3) break;
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const raw = item as RawBlueprintActivityOption;
      const title =
        typeof raw.title === "string" ? normalizeSingleLine(raw.title) : "";
      if (!title) continue;
      const summary =
        typeof raw.summary === "string" ? normalizeSingleLine(raw.summary) : "";
      const rawId =
        typeof raw.id === "string" ? normalizeSingleLine(raw.id) : "";
      const id =
        rawId && !usedIds.has(rawId)
          ? rawId
          : nextUniqueActivityId(params.idPrefix, usedIds);
      usedIds.add(id);
      const source =
        raw.source === "bow" || raw.source === "authentic"
          ? raw.source
          : undefined;
      parsed.push({
        id,
        title,
        summary: summary || `Collaborative guided task applying ${title}.`,
        ...(source ? { source } : {}),
        recommended: raw.recommended === true,
      });
    }
  }

  const primaryComp = params.competencies[0];
  const topic = primaryComp?.contentTopic.trim() || "the target competency";
  const bowSuggested =
    primaryComp?.budgetOfWork?.suggestedActivities.trim() ?? "";

  const fallbacks: Array<Omit<BlueprintActivityOption, "id" | "recommended">> = [
    bowSuggested
      ? {
          title: `Adapted BoW Activity: ${topic}`,
          summary: normalizeSingleLine(bowSuggested).slice(0, 180),
          source: "bow",
        }
      : {
          title: `Guided Concept & Case Exploration: ${topic}`,
          summary: `Small-group Philippine workplace scenario unpacking core concepts and tools for ${topic}.`,
          source: "authentic",
        },
    {
      title: `Hands-On Guided Practice: ${topic}`,
      summary: `Step-by-step teacher modeling followed by collaborative station practice applying ${topic}.`,
      source: "authentic",
    },
  ];

  for (const fallback of fallbacks) {
    if (parsed.length >= 2) break;
    const id = nextUniqueActivityId(params.idPrefix, usedIds);
    usedIds.add(id);
    parsed.push({
      id,
      ...fallback,
      recommended: false,
    });
  }

  let recIndex = parsed.findIndex((opt) => opt.recommended);
  if (recIndex === -1) recIndex = 0;

  const options = parsed.map((opt, idx) => ({
    ...opt,
    recommended: idx === recIndex,
  }));

  return {
    options,
    selectedActivityId: options[recIndex]?.id ?? "",
  };
}

/** Normalizes all 5 Formative Assessment options in canonical order and guarantees exactly one recommended pick. */
export function normalizeBlueprintAssessmentOptions(params: {
  rawOptions: unknown;
  recommendedTypeHint?: unknown;
  competencies: CurriculumCompetency[];
  defaultRecommended?: FormativeAssessmentType;
}): {
  options: BlueprintAssessmentOption[];
  selectedAssessmentType: FormativeAssessmentType;
} {
  const byType = new Map<
    FormativeAssessmentType,
    { preview: string; recommended: boolean }
  >();
  let firstRecommended: FormativeAssessmentType | undefined;

  if (Array.isArray(params.rawOptions)) {
    for (const item of params.rawOptions) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const raw = item as RawBlueprintAssessmentOption;
      if (
        typeof raw.type !== "string" ||
        !FORMATIVE_ASSESSMENT_TYPES.includes(
          raw.type as FormativeAssessmentType,
        )
      ) {
        continue;
      }
      const type = raw.type as FormativeAssessmentType;
      const preview =
        typeof raw.preview === "string"
          ? normalizeSingleLine(raw.preview)
          : "";
      const recommended = raw.recommended === true;
      if (recommended && !firstRecommended) {
        firstRecommended = type;
      }
      if (!byType.has(type)) {
        byType.set(type, { preview, recommended });
      }
    }
  }

  if (
    !firstRecommended &&
    typeof params.recommendedTypeHint === "string" &&
    FORMATIVE_ASSESSMENT_TYPES.includes(
      params.recommendedTypeHint as FormativeAssessmentType,
    )
  ) {
    firstRecommended = params.recommendedTypeHint as FormativeAssessmentType;
  }

  const chosenRecommended: FormativeAssessmentType =
    firstRecommended ?? params.defaultRecommended ?? "exit-ticket";
  const topic =
    params.competencies[0]?.contentTopic.trim() || "the session objectives";

  const options: BlueprintAssessmentOption[] = FORMATIVE_ASSESSMENT_TYPES.map(
    (type) => {
      const existing = byType.get(type);
      return {
        type,
        label: FORMATIVE_ASSESSMENT_LABELS[type],
        preview:
          existing?.preview ||
          FORMATIVE_ASSESSMENT_DEFAULT_PREVIEWS[type](topic),
        recommended: type === chosenRecommended,
      };
    },
  );

  return {
    options,
    selectedAssessmentType: chosenRecommended,
  };
}

export function formatPeriodDuration(minutes: number): string {
  if (minutes === 120) return "120 minutes (2 hrs)";
  if (minutes > 60 && minutes % 60 === 0) {
    return `${minutes} minutes (${minutes / 60} hrs)`;
  }
  return `${minutes} minutes`;
}

export function formatPeriodPresetLabel(minutes: number): string {
  return minutes === 120 ? "2 hrs (120 min)" : `${minutes} min`;
}

export function formatClassroomContextSummary(ctx: ClassroomContext): string {
  const duration = ctx.periodMinutes === 120 ? "2 hrs (120 min)" : `${ctx.periodMinutes} min`;
  return [
    duration,
    CLASSROOM_FACILITY_LABELS[ctx.facility],
    DELIVERY_MODALITY_LABELS[ctx.modality],
  ].join(" · ");
}

export function normalizeClassroomContext(
  ctx: ClassroomContext | undefined,
  createError: (message: string) => Error,
): ClassroomContext | undefined {
  if (ctx === undefined) return undefined;
  const periodMinutes = Number(ctx.periodMinutes);
  if (
    !Number.isInteger(periodMinutes) ||
    periodMinutes < MIN_PERIOD_MINUTES ||
    periodMinutes > MAX_PERIOD_MINUTES
  ) {
    throw createError(
      `Classroom Context period length must be a whole number between ${MIN_PERIOD_MINUTES} and ${MAX_PERIOD_MINUTES} minutes.`,
    );
  }
  if (!CLASSROOM_FACILITIES.includes(ctx.facility)) {
    throw createError(
      `Invalid Classroom Context facility: ${String(ctx.facility)}.`,
    );
  }
  if (!DELIVERY_MODALITIES.includes(ctx.modality)) {
    throw createError(
      `Invalid Classroom Context delivery modality: ${String(ctx.modality)}.`,
    );
  }
  return {
    periodMinutes,
    facility: ctx.facility,
    modality: ctx.modality,
  };
}

export function normalizeReferenceMaterial(
  ref: ReferenceMaterial | undefined,
): ReferenceMaterial | undefined {
  if (!ref) return undefined;
  const trimmedText = ref.text.replace(/\r\n?/g, "\n").trim();
  if (!trimmedText) return undefined;
  const boundedText =
    trimmedText.length > MAX_REFERENCE_MATERIAL_CHARS
      ? trimmedText.slice(0, MAX_REFERENCE_MATERIAL_CHARS).trimEnd()
      : trimmedText;
  const sourceLabel = ref.sourceLabel?.trim();
  return sourceLabel ? { sourceLabel, text: boundedText } : { text: boundedText };
}

export function formatClassroomContextPromptBlock(
  ctx: ClassroomContext | undefined,
): string {
  if (!ctx) return "";
  return [
    "Classroom Context (use to pace activities and choose realistic tools/facilities; never copy into Learner Context):",
    `- Period Length: ${formatPeriodDuration(ctx.periodMinutes)}`,
    `- Facility / Equipment: ${CLASSROOM_FACILITY_LABELS[ctx.facility]}`,
    `- Delivery Modality: ${DELIVERY_MODALITY_LABELS[ctx.modality]}`,
  ].join("\n");
}

export function formatReferenceMaterialPromptBlock(
  ref: ReferenceMaterial | undefined,
): string {
  if (!ref || !ref.text.trim()) return "";
  const label = ref.sourceLabel?.trim() ? ` (${ref.sourceLabel.trim()})` : "";
  return [
    `Reference Material${label} (ground technical facts, procedures, tools, and safety practices in this excerpt; never copy into Learner Context):`,
    ref.text.trim(),
  ].join("\n");
}

const LEGACY_AI_DECLARATION =
  "This lesson plan was developed using AI and subsequently reviewed for accuracy and alignment with curriculum standards.";

export const DEFAULT_AI_DECLARATION_TEMPLATE =
  "Declaration of AI Use (DepEd Order No. 003, s. 2026, Annex A): {aiTool} was used solely as an auxiliary drafting aid under teacher direction. All lesson content was critically reviewed, edited, and validated by the teacher against DepEd curriculum standards and learner needs, and no confidential learner information or personal data was shared with the AI platform.";

/** Formats the active AI provider and model for DO 003, s. 2026 Annex A disclosure. */
export function formatAiToolLabel(
  aiSettings?: AiProviderSettings,
  responseModel?: string,
): string {
  const model = responseModel?.trim() || aiSettings?.modelId.trim() || "";
  const providerLabel = aiSettings
    ? (AI_PROVIDER_MAP.get(aiSettings.aiProvider)?.label ?? aiSettings.aiProvider)
    : "";

  if (providerLabel && model) return `${providerLabel} (${model})`;
  if (model) return model;
  if (providerLabel) return `${providerLabel} AI`;
  return "An AI drafting tool";
}

/** Composes a DO 003, s. 2026 Annex A Declaration of AI Use from a template and active AI configuration. */
export function composeAiDeclaration(params: {
  template?: string;
  aiSettings?: AiProviderSettings;
  responseModel?: string;
}): string {
  const rawTemplate = params.template?.trim() ?? "";
  const baseTemplate =
    !rawTemplate || rawTemplate === LEGACY_AI_DECLARATION
      ? DEFAULT_AI_DECLARATION_TEMPLATE
      : rawTemplate;

  const toolLabel = formatAiToolLabel(params.aiSettings, params.responseModel);
  return baseTemplate.replace(/\{aiTool\}/g, toolLabel);
}

/** Resolves the Declaration of AI Use injected into Table 0 Row 7 on .docx export. */
export function resolveExportAiDeclaration(
  lessonAiDeclaration: string | undefined,
  profile: TeacherProfileSettings,
  aiSettings?: AiProviderSettings,
): string {
  const perLesson = lessonAiDeclaration?.trim();
  if (perLesson) {
    return perLesson;
  }
  return composeAiDeclaration({
    template: profile.aiDeclaration,
    aiSettings,
  });
}

export function formatComponentLabel(component: TleComponent): string {
  return component === "SHS_CORE" ? "SHS Core" : component;
}

export function formatLearningAreas(components: readonly TleComponent[]): string {
  return dedupeOrdered([...components]).map(formatComponentLabel).join(", ");
}

export function parseLearningAreaComponents(
  learningAreas: string,
): TleComponent[] {
  const parts = learningAreas
    .split(/[,;/|]+/)
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);

  const mapped: TleComponent[] = [];
  for (const token of parts) {
    if (token === "ICT") mapped.push("ICT");
    else if (token === "AFA") mapped.push("AFA");
    else if (token === "FCS") mapped.push("FCS");
    else if (token === "IA") mapped.push("IA");
    else if (token === "SHS_CORE" || token === "SHS CORE") {
      mapped.push("SHS_CORE");
    }
  }
  return dedupeOrdered(mapped);
}

export function dedupeOrdered<T>(items: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

function formatBowLines(bow: BudgetOfWorkInfo): string[] {
  const pacing = [
    bow.term.trim(),
    bow.weekRange.trim() ? `Week ${bow.weekRange.trim()}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const header = pacing ? `  Budget of Work (${pacing}):` : "  Budget of Work:";
  const details = [
    bow.suggestedActivities.trim()
      ? `    Suggested Activities: ${bow.suggestedActivities.trim()}`
      : "",
    bow.suggestedPerformanceTasks.trim()
      ? `    Suggested Performance Tasks: ${bow.suggestedPerformanceTasks.trim()}`
      : "",
    bow.sourceDocument?.trim()
      ? `    Source Document: ${bow.sourceDocument.trim()}`
      : "",
  ].filter(Boolean);

  if (details.length > 0) {
    return [header, ...details];
  }
  return pacing ? [header] : [];
}

export function formatCompetencyLines(competencies: CurriculumCompetency[]): string {
  return competencies
    .map((c) => {
      const parts = [
        `- [${formatComponentLabel(c.component)}${c.sector ? ` / ${c.sector}` : ""}] Topic: ${c.contentTopic}`,
        c.contentSubTopics.length > 0
          ? `  Sub-topics: ${c.contentSubTopics.join("; ")}`
          : "",
        `  Learning Competency: ${c.learningCompetency}`,
        `  Content Standard: ${c.contentStandard}`,
        `  Performance Standard: ${c.performanceStandard}`,
        ...(c.budgetOfWork ? formatBowLines(c.budgetOfWork) : []),
        c.customNotes ? `  Teacher Competency Notes: ${c.customNotes}` : "",
      ];
      return parts.filter(Boolean).join("\n");
    })
    .join("\n");
}

/** Resolves lesson references: preserves explicit teacher references; otherwise includes BoW sourceDocument citation(s). */
export function resolveLessonReferences(
  explicitReferences: string | undefined,
  aiReferences: unknown,
  competencies: CurriculumCompetency[],
): string {
  const trimmedExplicit = explicitReferences?.trim() ?? "";
  if (trimmedExplicit) {
    return trimmedExplicit;
  }

  const aiRef = typeof aiReferences === "string" ? aiReferences.trim() : "";
  const bowSources = dedupeOrdered(
    competencies
      .map((c) => c.budgetOfWork?.sourceDocument?.trim() ?? "")
      .filter(Boolean),
  );

  if (bowSources.length === 0) {
    return aiRef;
  }
  if (!aiRef) {
    return bowSources.join("; ");
  }

  const aiRefLower = aiRef.toLowerCase();
  const missingSources = bowSources.filter(
    (src) => !aiRefLower.includes(src.toLowerCase()),
  );
  return missingSources.length > 0
    ? [aiRef, ...missingSources].join("; ")
    : aiRef;
}

export function parseAiJsonObject(
  rawText: string,
  label: string,
  createError: (message: string) => Error,
): Record<string, unknown> {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw createError(`AI response was not valid JSON for ${label} generation.`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw createError("AI response must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}
