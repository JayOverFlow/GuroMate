import type { CurriculumCompetency } from "./types";

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

export function formatCompetencyLines(competencies: CurriculumCompetency[]): string {
  return competencies
    .map((c) => {
      const parts = [
        `- [${c.component}${c.sector ? ` / ${c.sector}` : ""}] Topic: ${c.contentTopic}`,
        c.contentSubTopics.length > 0
          ? `  Sub-topics: ${c.contentSubTopics.join("; ")}`
          : "",
        `  Learning Competency: ${c.learningCompetency}`,
        `  Content Standard: ${c.contentStandard}`,
        `  Performance Standard: ${c.performanceStandard}`,
        c.budgetOfWork
          ? `  Budget of Work (${c.budgetOfWork.term}, Week ${c.budgetOfWork.weekRange}): Suggested Activities: ${c.budgetOfWork.suggestedActivities} | Suggested Performance Tasks: ${c.budgetOfWork.suggestedPerformanceTasks}`
          : "",
        c.customNotes ? `  Teacher Competency Notes: ${c.customNotes}` : "",
      ];
      return parts.filter(Boolean).join("\n");
    })
    .join("\n");
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
