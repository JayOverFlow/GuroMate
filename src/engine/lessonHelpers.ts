import { AI_PROVIDER_MAP } from "./providers";
import type {
  AiProviderSettings,
  BudgetOfWorkInfo,
  CurriculumCompetency,
  TeacherProfileSettings,
  TleComponent,
} from "./types";

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
