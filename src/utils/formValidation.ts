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

export function parseRosterText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export type ClassSectionFieldKey = "sectionName" | "rosterText";

export interface ClassSectionFormInput {
  sectionName: string;
  rosterText: string;
}

export const CLASS_SECTION_FIELDS: readonly ClassSectionFieldKey[] = [
  "sectionName",
  "rosterText",
];

export function validateClassSectionField(
  field: ClassSectionFieldKey,
  input: ClassSectionFormInput,
): string | undefined {
  switch (field) {
    case "sectionName":
      return isNonEmptyText(input.sectionName)
        ? undefined
        : "Enter a section name.";
    case "rosterText":
      return parseRosterText(input.rosterText).length > 0
        ? undefined
        : "Enter at least one student name (one per line).";
  }
}

export function validateClassSectionForm(
  input: ClassSectionFormInput,
): FieldErrors<ClassSectionFieldKey> {
  const errors: FieldErrors<ClassSectionFieldKey> = {};
  for (const field of CLASS_SECTION_FIELDS) {
    const message = validateClassSectionField(field, input);
    if (message) errors[field] = message;
  }
  return errors;
}

export type CustomTimerFieldKey = "minutes" | "seconds" | "duration";

export interface CustomTimerFormInput {
  minutes: string | number;
  seconds: string | number;
}

export const CUSTOM_TIMER_FIELDS: readonly CustomTimerFieldKey[] = [
  "minutes",
  "seconds",
  "duration",
];

function parseStrictInteger(value: string | number): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : null;
  }
  const trimmed = value.trim();
  if (!/^[+-]?\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function parseCustomTimerDuration(
  input: CustomTimerFormInput,
): { minutes: number; seconds: number } | null {
  const minutes = parseStrictInteger(input.minutes);
  const seconds = parseStrictInteger(input.seconds);
  if (
    minutes === null ||
    seconds === null ||
    minutes < 0 ||
    minutes > 180 ||
    seconds < 0 ||
    seconds > 59 ||
    minutes * 60 + seconds <= 0
  ) {
    return null;
  }
  return { minutes, seconds };
}

export function validateCustomTimerField(
  field: CustomTimerFieldKey,
  input: CustomTimerFormInput,
): string | undefined {
  switch (field) {
    case "minutes": {
      const minutes = parseStrictInteger(input.minutes);
      return minutes !== null && minutes >= 0 && minutes <= 180
        ? undefined
        : "Enter a whole number from 0 to 180.";
    }
    case "seconds": {
      const seconds = parseStrictInteger(input.seconds);
      return seconds !== null && seconds >= 0 && seconds <= 59
        ? undefined
        : "Enter a whole number from 0 to 59.";
    }
    case "duration": {
      const minutes = parseStrictInteger(input.minutes);
      const seconds = parseStrictInteger(input.seconds);
      if (
        minutes === null ||
        seconds === null ||
        minutes < 0 ||
        minutes > 180 ||
        seconds < 0 ||
        seconds > 59
      ) {
        return undefined;
      }
      return minutes * 60 + seconds > 0
        ? undefined
        : "Enter a duration greater than 00:00.";
    }
  }
}

export function validateCustomTimerForm(
  input: CustomTimerFormInput,
): FieldErrors<CustomTimerFieldKey> {
  const errors: FieldErrors<CustomTimerFieldKey> = {};
  for (const field of CUSTOM_TIMER_FIELDS) {
    const message = validateCustomTimerField(field, input);
    if (message) errors[field] = message;
  }
  return errors;
}
