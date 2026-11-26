export type PickerAnimationMode = "slot" | "card-flip" | "instant";
export type GroupAnimationMode = "card-deal" | "group-yourselves" | "instant";

export interface ClassroomPreferences {
  pickerMode: PickerAnimationMode;
  groupMode: GroupAnimationMode;
  soundEnabled: boolean;
}

export type PreferencesStorage = Pick<Storage, "getItem" | "setItem">;

export const CLASSROOM_PREFERENCES_STORAGE_KEY =
  "guromate.classroom.preferences.v1";

export const DEFAULT_CLASSROOM_PREFERENCES: Readonly<ClassroomPreferences> = {
  pickerMode: "slot",
  groupMode: "card-deal",
  soundEnabled: true,
};

const VALID_PICKER_MODES: ReadonlySet<string> = new Set<PickerAnimationMode>([
  "slot",
  "card-flip",
  "instant",
]);

const VALID_GROUP_MODES: ReadonlySet<string> = new Set<GroupAnimationMode>([
  "card-deal",
  "group-yourselves",
  "instant",
]);

function isPickerAnimationMode(value: unknown): value is PickerAnimationMode {
  return typeof value === "string" && VALID_PICKER_MODES.has(value);
}

function isGroupAnimationMode(value: unknown): value is GroupAnimationMode {
  return typeof value === "string" && VALID_GROUP_MODES.has(value);
}

function getDefaultStorage(): PreferencesStorage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadClassroomPreferences(
  storage?: PreferencesStorage | null,
): ClassroomPreferences {
  const target = storage === undefined ? getDefaultStorage() : storage;
  if (!target) {
    return { ...DEFAULT_CLASSROOM_PREFERENCES };
  }

  let raw: string | null;
  try {
    raw = target.getItem(CLASSROOM_PREFERENCES_STORAGE_KEY);
  } catch {
    return { ...DEFAULT_CLASSROOM_PREFERENCES };
  }

  if (!raw) {
    return { ...DEFAULT_CLASSROOM_PREFERENCES };
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ...DEFAULT_CLASSROOM_PREFERENCES };
    }
    const record = parsed as Record<string, unknown>;
    return {
      pickerMode: isPickerAnimationMode(record.pickerMode)
        ? record.pickerMode
        : DEFAULT_CLASSROOM_PREFERENCES.pickerMode,
      groupMode: isGroupAnimationMode(record.groupMode)
        ? record.groupMode
        : DEFAULT_CLASSROOM_PREFERENCES.groupMode,
      soundEnabled:
        typeof record.soundEnabled === "boolean"
          ? record.soundEnabled
          : DEFAULT_CLASSROOM_PREFERENCES.soundEnabled,
    };
  } catch {
    return { ...DEFAULT_CLASSROOM_PREFERENCES };
  }
}

export function saveClassroomPreferences(
  preferences: ClassroomPreferences,
  storage?: PreferencesStorage | null,
): boolean {
  const target = storage === undefined ? getDefaultStorage() : storage;
  if (!target) {
    return false;
  }

  const sanitized: ClassroomPreferences = {
    pickerMode: isPickerAnimationMode(preferences.pickerMode)
      ? preferences.pickerMode
      : DEFAULT_CLASSROOM_PREFERENCES.pickerMode,
    groupMode: isGroupAnimationMode(preferences.groupMode)
      ? preferences.groupMode
      : DEFAULT_CLASSROOM_PREFERENCES.groupMode,
    soundEnabled:
      typeof preferences.soundEnabled === "boolean"
        ? preferences.soundEnabled
        : DEFAULT_CLASSROOM_PREFERENCES.soundEnabled,
  };

  try {
    target.setItem(
      CLASSROOM_PREFERENCES_STORAGE_KEY,
      JSON.stringify(sanitized),
    );
    return true;
  } catch {
    return false;
  }
}

export function resolveEffectivePickerMode(
  mode: PickerAnimationMode,
  prefersReducedMotion: boolean,
): PickerAnimationMode {
  return prefersReducedMotion ? "instant" : mode;
}

export function resolveEffectiveGroupMode(
  mode: GroupAnimationMode,
  prefersReducedMotion: boolean,
): GroupAnimationMode {
  return prefersReducedMotion ? "instant" : mode;
}

export interface ClassroomCueGateOptions {
  soundEnabled: boolean;
  prefersReducedMotion: boolean;
  isInstant?: boolean;
}

export function shouldPlayClassroomCue({
  soundEnabled,
  prefersReducedMotion,
  isInstant = false,
}: ClassroomCueGateOptions): boolean {
  return soundEnabled && !prefersReducedMotion && !isInstant;
}
