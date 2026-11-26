import { AI_PROVIDER_MAP } from "../engine/providers";
import type { GuroMateSettings } from "../engine/types";

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
