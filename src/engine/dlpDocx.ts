import {
  applyTableUpdates,
  buildIntentionsStandardsCell,
  replaceCellText,
} from "./dllDocx";
import { resolveExportAiDeclaration } from "./lessonHelpers";
import type {
  AiProviderSettings,
  DailyLessonPlan,
  DlpActivityPair,
  TeacherProfileSettings,
} from "./types";

function mapActivityRow(
  rowIdx: number,
  pair: DlpActivityPair,
): Array<readonly [string, (tc: string) => string]> {
  return [
    [`${rowIdx}:1`, (tc: string) => replaceCellText(tc, pair.teacherActivity)],
    [`${rowIdx}:2`, (tc: string) => replaceCellText(tc, pair.studentActivity)],
  ];
}

/** Injects Daily Lesson Plan fields, paired activities, and signatories into `word/document.xml`. */
export function injectDlpIntoDocumentXml(
  documentXml: string,
  dlp: DailyLessonPlan,
  profile: TeacherProfileSettings,
  aiSettings?: AiProviderSettings,
): string {
  const aiDeclaration = resolveExportAiDeclaration(
    dlp.aiDeclaration,
    profile,
    aiSettings,
  );
  const tableUpdates: Array<Map<string, (tc: string) => string>> = [
    // Table 0: Header metadata
    new Map([
      ["0:1", (tc) => replaceCellText(tc, dlp.lessonTitle)],
      ["1:1", (tc) => replaceCellText(tc, dlp.learningAreas)],
      ["2:1", (tc) => replaceCellText(tc, profile.studentTeacherName)],
      ["3:1", (tc) => replaceCellText(tc, profile.cooperatingTeacherName)],
      ["4:1", (tc) => replaceCellText(tc, dlp.gradeAndSection)],
      ["5:1", (tc) => replaceCellText(tc, "1")],
      ["6:1", (tc) => replaceCellText(tc, dlp.references)],
      ["7:1", (tc) => replaceCellText(tc, aiDeclaration)],
    ]),
    // Table 1: Intentions (Standards, Learning Objectives, blank Learner Context)
    new Map([
      ["1:1", (tc) => buildIntentionsStandardsCell(tc, dlp.intentions)],
      ["2:1", (tc) => replaceCellText(tc, dlp.intentions.learningObjectives)],
      ["3:1", (tc) => replaceCellText(tc, "")],
    ]),
    // Table 2: Learning Experience (row 1 is Teacher's / Student's Activity header)
    new Map([
      ...mapActivityRow(2, dlp.preLesson),
      ...mapActivityRow(3, dlp.lessonFlow),
      ...mapActivityRow(4, dlp.learningResources),
      ...mapActivityRow(5, dlp.integrationAndContextualization),
    ]),
    // Table 3: Assessing Learning
    new Map(mapActivityRow(2, dlp.formativeAssessment)),
    // Table 4: Ways Forward (Extended Learning Opportunities + both blank Reflections)
    new Map([
      ...mapActivityRow(2, dlp.extendedLearningOpportunities),
      ...mapActivityRow(3, { teacherActivity: "", studentActivity: "" }),
    ]),
    // Table 5: Pre-Service Teacher signatory
    new Map([["0:0", (tc) => replaceCellText(tc, profile.studentTeacherName)]]),
    // Table 6: Cooperating Teacher, TLE Coordinator, Academic Head signatories
    new Map([
      ["1:0", (tc) => replaceCellText(tc, profile.cooperatingTeacherName)],
      ["1:1", (tc) => replaceCellText(tc, profile.tleCoordinatorName)],
      ["1:2", (tc) => replaceCellText(tc, profile.academicHeadName)],
    ]),
  ];

  return applyTableUpdates(documentXml, tableUpdates, "DLP");
}
