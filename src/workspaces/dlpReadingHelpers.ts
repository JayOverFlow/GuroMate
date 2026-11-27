import type { DailyLessonPlan, DlpActivityPair } from "../engine/types";

export interface DlpReadingRow {
  key: string;
  label: string;
  pair: DlpActivityPair;
  emptyPlaceholder?: string;
}

export interface DlpReadingSection {
  id: "learning-experience" | "assessing-learning" | "ways-forward";
  heading: string;
  rows: readonly DlpReadingRow[];
}

export function formatDlpSourceLabel(
  dlp: Pick<DailyLessonPlan, "sourceDllId" | "sourceSessionNumber">,
  sourceDllTitle?: string,
): string | null {
  if (!dlp.sourceDllId?.trim()) return null;

  const trimmedTitle = sourceDllTitle?.trim();
  if (trimmedTitle && dlp.sourceSessionNumber !== undefined) {
    return `Derived from ${trimmedTitle} · Session ${dlp.sourceSessionNumber}`;
  }
  if (trimmedTitle) {
    return `Derived from ${trimmedTitle}`;
  }
  if (dlp.sourceSessionNumber !== undefined) {
    return `Derived from Session ${dlp.sourceSessionNumber}`;
  }
  return "Derived from DLL";
}

export function buildDlpReadingSections(
  dlp: DailyLessonPlan,
): readonly DlpReadingSection[] {
  return [
    {
      id: "learning-experience",
      heading: "II. Learning Experience",
      rows: [
        { key: "preLesson", label: "Pre-Lesson", pair: dlp.preLesson },
        { key: "lessonFlow", label: "Lesson Flow", pair: dlp.lessonFlow },
        {
          key: "learningResources",
          label: "Learning Resources",
          pair: dlp.learningResources,
        },
        {
          key: "integrationAndContextualization",
          label: "Opportunities for Integration and Contextualization",
          pair: dlp.integrationAndContextualization,
        },
      ],
    },
    {
      id: "assessing-learning",
      heading: "III. Assessing Learning",
      rows: [
        {
          key: "formativeAssessment",
          label: "Formative Assessment",
          pair: dlp.formativeAssessment,
        },
      ],
    },
    {
      id: "ways-forward",
      heading: "IV. Ways Forward",
      rows: [
        {
          key: "extendedLearningOpportunities",
          label: "Extended Learning Opportunities",
          pair: dlp.extendedLearningOpportunities,
        },
        {
          key: "reflections",
          label: "Reflections",
          pair: dlp.reflections,
          emptyPlaceholder: "Left blank for manual completion",
        },
      ],
    },
  ];
}
