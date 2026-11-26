import { describe, expect, it } from "vitest";
import {
  CLASSROOM_PREFERENCES_STORAGE_KEY,
  DEFAULT_CLASSROOM_PREFERENCES,
  loadClassroomPreferences,
  resolveEffectiveGroupMode,
  resolveEffectivePickerMode,
  saveClassroomPreferences,
  shouldPlayClassroomCue,
  type PreferencesStorage,
} from "./classroomPreferences";

function createMemoryStorage(
  initial: Record<string, string> = {},
): PreferencesStorage & { store: Map<string, string> } {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    store,
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
}

describe("classroomPreferences", () => {
  it("returns default preferences when storage is empty or unavailable and persists valid updates", () => {
    const emptyStorage = createMemoryStorage();
    expect(loadClassroomPreferences(emptyStorage)).toEqual(
      DEFAULT_CLASSROOM_PREFERENCES,
    );
    expect(loadClassroomPreferences(null)).toEqual({
      pickerMode: "slot",
      groupMode: "card-deal",
      soundEnabled: true,
    });

    const updated = {
      pickerMode: "card-flip" as const,
      groupMode: "group-yourselves" as const,
      soundEnabled: false,
    };
    expect(saveClassroomPreferences(updated, emptyStorage)).toBe(true);
    expect(
      emptyStorage.store.has(CLASSROOM_PREFERENCES_STORAGE_KEY),
    ).toBe(true);
    expect(loadClassroomPreferences(emptyStorage)).toEqual(updated);
  });

  it("falls back gracefully when storage contains corrupted JSON, invalid fields, or throws", () => {
    const corrupted = createMemoryStorage({
      [CLASSROOM_PREFERENCES_STORAGE_KEY]: "{not-valid-json",
    });
    expect(loadClassroomPreferences(corrupted)).toEqual(
      DEFAULT_CLASSROOM_PREFERENCES,
    );

    const nonObject = createMemoryStorage({
      [CLASSROOM_PREFERENCES_STORAGE_KEY]: JSON.stringify(["slot"]),
    });
    expect(loadClassroomPreferences(nonObject)).toEqual(
      DEFAULT_CLASSROOM_PREFERENCES,
    );

    const partialInvalid = createMemoryStorage({
      [CLASSROOM_PREFERENCES_STORAGE_KEY]: JSON.stringify({
        pickerMode: "instant",
        groupMode: "unknown-mode",
        soundEnabled: "yes",
      }),
    });
    expect(loadClassroomPreferences(partialInvalid)).toEqual({
      pickerMode: "instant",
      groupMode: "card-deal",
      soundEnabled: true,
    });

    const blockedStorage: PreferencesStorage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(loadClassroomPreferences(blockedStorage)).toEqual(
      DEFAULT_CLASSROOM_PREFERENCES,
    );
    expect(
      saveClassroomPreferences(DEFAULT_CLASSROOM_PREFERENCES, blockedStorage),
    ).toBe(false);
    expect(saveClassroomPreferences(DEFAULT_CLASSROOM_PREFERENCES, null)).toBe(
      false,
    );
  });

  it("resolves effective animation modes to instant and silences cues under reduced motion, muted sound, or instant mode", () => {
    expect(resolveEffectivePickerMode("slot", false)).toBe("slot");
    expect(resolveEffectivePickerMode("card-flip", false)).toBe("card-flip");
    expect(resolveEffectivePickerMode("instant", false)).toBe("instant");
    expect(resolveEffectivePickerMode("slot", true)).toBe("instant");
    expect(resolveEffectivePickerMode("card-flip", true)).toBe("instant");

    expect(resolveEffectiveGroupMode("card-deal", false)).toBe("card-deal");
    expect(resolveEffectiveGroupMode("group-yourselves", false)).toBe(
      "group-yourselves",
    );
    expect(resolveEffectiveGroupMode("instant", false)).toBe("instant");
    expect(resolveEffectiveGroupMode("card-deal", true)).toBe("instant");
    expect(resolveEffectiveGroupMode("group-yourselves", true)).toBe("instant");

    expect(
      shouldPlayClassroomCue({
        soundEnabled: true,
        prefersReducedMotion: false,
        isInstant: false,
      }),
    ).toBe(true);
    expect(
      shouldPlayClassroomCue({
        soundEnabled: true,
        prefersReducedMotion: false,
      }),
    ).toBe(true);
    expect(
      shouldPlayClassroomCue({
        soundEnabled: false,
        prefersReducedMotion: false,
        isInstant: false,
      }),
    ).toBe(false);
    expect(
      shouldPlayClassroomCue({
        soundEnabled: true,
        prefersReducedMotion: true,
        isInstant: false,
      }),
    ).toBe(false);
    expect(
      shouldPlayClassroomCue({
        soundEnabled: true,
        prefersReducedMotion: false,
        isInstant: true,
      }),
    ).toBe(false);
  });
});
