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
