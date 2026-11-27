import type {
  BudgetOfWorkInfo,
  CurriculumCompetency,
  TleComponent,
} from "./types";

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
