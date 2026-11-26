import { AI_PROVIDER_MAP } from "../engine/providers";
import {
  QUIZ_QUESTION_TYPES,
  type DllSessionConfig,
  type GuroMateSettings,
  type QuizItemCounts,
  type QuizQuestionType,
  type SessionNumber,
} from "../engine/types";

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export type SettingsFieldKey =
  | "studentTeacherName"
  | "cooperatingTeacherName"
  | "tleCoordinatorName"
  | "academicHeadName"
  | "aiDeclaration"
  | "modelId"
  | "baseUrl"
  | "apiKey";

export type SettingsValidationScope = "save" | "test" | "refresh";

export interface SettingsValidationOptions {
  isCustomModel?: boolean;
}

export const SETTINGS_SCOPE_FIELDS: Record<
  SettingsValidationScope,
  readonly SettingsFieldKey[]
> = {
  save: [
    "studentTeacherName",
    "cooperatingTeacherName",
    "tleCoordinatorName",
    "academicHeadName",
    "aiDeclaration",
    "modelId",
    "baseUrl",
    "apiKey",
  ],
  test: ["modelId", "baseUrl", "apiKey"],
  refresh: ["baseUrl", "apiKey"],
};

export function buildDescribedBy(
  hintId: string | null | undefined,
  errorId: string | null | undefined,
  hasError: boolean,
): string | undefined {
  const ids = [hintId?.trim(), hasError ? errorId?.trim() : undefined].filter(
    (id): id is string => Boolean(id),
  );
  return ids.length > 0 ? ids.join(" ") : undefined;
}

export function isNonEmptyText(value: string): boolean {
  return value.trim().length > 0;
}

export function isValidHttpUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateSettingsField(
  field: SettingsFieldKey,
  settings: GuroMateSettings,
  options?: SettingsValidationOptions,
): string | undefined {
  switch (field) {
    case "studentTeacherName":
      return isNonEmptyText(settings.profile.studentTeacherName)
        ? undefined
        : "Enter the pre-service teacher name.";
    case "cooperatingTeacherName":
      return isNonEmptyText(settings.profile.cooperatingTeacherName)
        ? undefined
        : "Enter the cooperating teacher name.";
    case "tleCoordinatorName":
      return isNonEmptyText(settings.profile.tleCoordinatorName)
        ? undefined
        : "Enter the TLE coordinator name.";
    case "academicHeadName":
      return isNonEmptyText(settings.profile.academicHeadName)
        ? undefined
        : "Enter the Academic Head coordinator name.";
    case "aiDeclaration":
      return isNonEmptyText(settings.profile.aiDeclaration)
        ? undefined
        : "Enter a Declaration of AI Use statement.";
    case "modelId":
      return isNonEmptyText(settings.ai.modelId)
        ? undefined
        : options?.isCustomModel
          ? "Enter a custom model ID."
          : "Select a model ID.";
    case "baseUrl":
      return isValidHttpUrl(settings.ai.baseUrl)
        ? undefined
        : "Enter a valid http:// or https:// base URL.";
    case "apiKey": {
      const provider = AI_PROVIDER_MAP.get(settings.ai.aiProvider);
      if (!provider?.requiresKey) return undefined;
      return isNonEmptyText(settings.ai.apiKey)
        ? undefined
        : `Enter an API key for ${provider.label}.`;
    }
  }
}

export function validateSettingsForm(
  settings: GuroMateSettings,
  scope: SettingsValidationScope = "save",
  options?: SettingsValidationOptions,
): FieldErrors<SettingsFieldKey> {
  const errors: FieldErrors<SettingsFieldKey> = {};
  for (const field of SETTINGS_SCOPE_FIELDS[scope]) {
    const message = validateSettingsField(field, settings, options);
    if (message) errors[field] = message;
  }
  return errors;
}

export type CustomCompetencyFieldKey =
  | "gradeLevels"
  | "quarters"
  | "contentTopic"
  | "contentStandard"
  | "performanceStandard"
  | "learningCompetency";

export interface CustomCompetencyFormInput {
  gradeLevels: readonly number[];
  quarters: readonly number[];
  contentTopic: string;
  contentStandard: string;
  performanceStandard: string;
  learningCompetency: string;
}

export const CUSTOM_COMPETENCY_FIELDS: readonly CustomCompetencyFieldKey[] = [
  "gradeLevels",
  "quarters",
  "contentTopic",
  "contentStandard",
  "performanceStandard",
  "learningCompetency",
];

export function validateCustomCompetencyField(
  field: CustomCompetencyFieldKey,
  input: CustomCompetencyFormInput,
): string | undefined {
  switch (field) {
    case "gradeLevels":
      return input.gradeLevels.length > 0
        ? undefined
        : "Select at least one grade level.";
    case "quarters":
      return input.quarters.length > 0
        ? undefined
        : "Select at least one quarter.";
    case "contentTopic":
      return isNonEmptyText(input.contentTopic)
        ? undefined
        : "Enter a content topic.";
    case "contentStandard":
      return isNonEmptyText(input.contentStandard)
        ? undefined
        : "Enter a Content Standard.";
    case "performanceStandard":
      return isNonEmptyText(input.performanceStandard)
        ? undefined
        : "Enter a Performance Standard.";
    case "learningCompetency":
      return isNonEmptyText(input.learningCompetency)
        ? undefined
        : "Enter a Learning Competency.";
  }
}

export function validateCustomCompetencyForm(
  input: CustomCompetencyFormInput,
): FieldErrors<CustomCompetencyFieldKey> {
  const errors: FieldErrors<CustomCompetencyFieldKey> = {};
  for (const field of CUSTOM_COMPETENCY_FIELDS) {
    const message = validateCustomCompetencyField(field, input);
    if (message) errors[field] = message;
  }
  return errors;
}

export type DllSessionFieldKey = `session-${SessionNumber}`;

export type DllBuilderFieldKey =
  | "gradeAndSection"
  | DllSessionFieldKey
  | "sessions";

export interface DllBuilderFormInput {
  gradeAndSection: string;
  sessions: readonly DllSessionConfig[];
}

export const DLL_BUILDER_FIELDS: readonly DllBuilderFieldKey[] = [
  "gradeAndSection",
  "session-1",
  "session-2",
  "session-3",
  "session-4",
  "session-5",
  "sessions",
];

export function dllSessionFieldKey(
  sessionNumber: SessionNumber,
): DllSessionFieldKey {
  return `session-${sessionNumber}`;
}

export function validateDllBuilderField(
  field: DllBuilderFieldKey,
  input: DllBuilderFormInput,
): string | undefined {
  if (field === "gradeAndSection") {
    return isNonEmptyText(input.gradeAndSection)
      ? undefined
      : "Enter a Grade Level and Section.";
  }

  if (field === "sessions") {
    const hasInstructional = input.sessions.some(
      (cfg) => cfg.mode === "instructional",
    );
    return hasInstructional
      ? undefined
      : "Keep at least one Session as Instructional with a Learning Competency.";
  }

  const sessionNumber = Number(field.slice("session-".length)) as SessionNumber;
  const session = input.sessions.find(
    (cfg) => cfg.sessionNumber === sessionNumber,
  );
  if (!session || session.mode === "non-instructional") {
    return undefined;
  }
  const hasCompetency = session.competencyIds.some((id) => isNonEmptyText(id));
  return hasCompetency
    ? undefined
    : `Assign a Learning Competency to Session ${sessionNumber} or mark it Non-Instructional.`;
}

export function validateDllBuilderForm(
  input: DllBuilderFormInput,
): FieldErrors<DllBuilderFieldKey> {
  const errors: FieldErrors<DllBuilderFieldKey> = {};
  for (const field of DLL_BUILDER_FIELDS) {
    const message = validateDllBuilderField(field, input);
    if (message) errors[field] = message;
  }
  return errors;
}

export type DlpBuilderFieldKey = "gradeAndSection" | "selectedCompetencyIds";

export interface DlpBuilderFormInput {
  mode: "scratch" | "derive";
  gradeAndSection: string;
  selectedCompetencyIds: readonly string[];
}

export const DLP_BUILDER_FIELDS: readonly DlpBuilderFieldKey[] = [
  "gradeAndSection",
  "selectedCompetencyIds",
];

export function validateDlpBuilderField(
  field: DlpBuilderFieldKey,
  input: DlpBuilderFormInput,
): string | undefined {
  if (input.mode !== "scratch") return undefined;
  switch (field) {
    case "gradeAndSection":
      return isNonEmptyText(input.gradeAndSection)
        ? undefined
        : "Enter a Grade Level and Section.";
    case "selectedCompetencyIds":
      return input.selectedCompetencyIds.length > 0
        ? undefined
        : "Select at least one Learning Competency.";
  }
}

export function validateDlpBuilderForm(
  input: DlpBuilderFormInput,
): FieldErrors<DlpBuilderFieldKey> {
  const errors: FieldErrors<DlpBuilderFieldKey> = {};
  for (const field of DLP_BUILDER_FIELDS) {
    const message = validateDlpBuilderField(field, input);
    if (message) errors[field] = message;
  }
  return errors;
}

export type QuizBuilderFieldKey =
  | "gradeAndSection"
  | "selectedCompetencyIds"
  | "itemCounts";

export type QuizItemCountDrafts = Record<QuizQuestionType, string | number>;

export interface QuizBuilderFormInput {
  sourceKind: "standalone" | "dll" | "dlp";
  gradeAndSection: string;
  selectedCompetencyIds: readonly string[];
  itemCounts: QuizItemCountDrafts;
}

export const QUIZ_BUILDER_FIELDS: readonly QuizBuilderFieldKey[] = [
  "gradeAndSection",
  "selectedCompetencyIds",
  "itemCounts",
];

export function parseQuizItemCount(value: string | number): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 && value <= 50 ? value : null;
  }
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 50
    ? parsed
    : null;
}

export function parseQuizItemCounts(
  drafts: QuizItemCountDrafts,
): QuizItemCounts | null {
  const counts = {} as QuizItemCounts;
  let total = 0;
  for (const type of QUIZ_QUESTION_TYPES) {
    const parsed = parseQuizItemCount(drafts[type]);
    if (parsed === null) return null;
    counts[type] = parsed;
    total += parsed;
  }
  return total >= 1 ? counts : null;
}

export function getInvalidQuizCountTypes(
  drafts: QuizItemCountDrafts,
): QuizQuestionType[] {
  const invalid: QuizQuestionType[] = [];
  let total = 0;
  for (const type of QUIZ_QUESTION_TYPES) {
    const parsed = parseQuizItemCount(drafts[type]);
    if (parsed === null) {
      invalid.push(type);
    } else {
      total += parsed;
    }
  }
  if (invalid.length > 0) return invalid;
  return total >= 1 ? [] : [...QUIZ_QUESTION_TYPES];
}

export function validateQuizBuilderField(
  field: QuizBuilderFieldKey,
  input: QuizBuilderFormInput,
): string | undefined {
  switch (field) {
    case "gradeAndSection":
      if (input.sourceKind !== "standalone") return undefined;
      return isNonEmptyText(input.gradeAndSection)
        ? undefined
        : "Enter a Grade Level and Section.";
    case "selectedCompetencyIds":
      if (input.sourceKind !== "standalone") return undefined;
      return input.selectedCompetencyIds.length > 0
        ? undefined
        : "Select at least one Learning Competency.";
    case "itemCounts": {
      let total = 0;
      for (const type of QUIZ_QUESTION_TYPES) {
        const parsed = parseQuizItemCount(input.itemCounts[type]);
        if (parsed === null) {
          return "Enter whole numbers from 0 to 50 for each question type.";
        }
        total += parsed;
      }
      return total >= 1
        ? undefined
        : "Set at least 1 item across question types.";
    }
  }
}

export function validateQuizBuilderForm(
  input: QuizBuilderFormInput,
): FieldErrors<QuizBuilderFieldKey> {
  const errors: FieldErrors<QuizBuilderFieldKey> = {};
  for (const field of QUIZ_BUILDER_FIELDS) {
    const message = validateQuizBuilderField(field, input);
    if (message) errors[field] = message;
  }
  return errors;
}
