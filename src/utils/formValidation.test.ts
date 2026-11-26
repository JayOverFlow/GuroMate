import { describe, expect, it } from "vitest";
import type { DllSessionConfig, GuroMateSettings } from "../engine/types";
import {
  buildDescribedBy,
  dllSessionFieldKey,
  isNonEmptyText,
  isValidHttpUrl,
  validateCustomCompetencyField,
  validateCustomCompetencyForm,
  validateDllBuilderField,
  validateDllBuilderForm,
  validateSettingsField,
  validateSettingsForm,
  type CustomCompetencyFormInput,
  type DllBuilderFormInput,
} from "./formValidation";

function makeSettings(
  overrides?: {
    profile?: Partial<GuroMateSettings["profile"]>;
    ai?: Partial<GuroMateSettings["ai"]>;
  },
): GuroMateSettings {
  return {
    profile: {
      studentTeacherName: "Maria Santos",
      cooperatingTeacherName: "Elena Reyes",
      tleCoordinatorName: "Carlos Mendoza",
      academicHeadName: "Rosa Cruz",
      aiDeclaration: "Prepared with AI assistance under DepEd DO 3 s. 2026.",
      ...overrides?.profile,
    },
    ai: {
      aiProvider: "openai-compatible",
      baseUrl: "https://api.openai.com/v1",
      modelId: "gpt-4o-mini",
      apiKey: "sk-test-1234",
      ...overrides?.ai,
    },
  };
}

describe("buildDescribedBy", () => {
  it("links the error ID after any hint ID only while an error is active", () => {
    expect(buildDescribedBy("baseUrl-hint", "baseUrl-err", false)).toBe(
      "baseUrl-hint",
    );
    expect(buildDescribedBy("baseUrl-hint", "baseUrl-err", true)).toBe(
      "baseUrl-hint baseUrl-err",
    );
    expect(buildDescribedBy(null, "name-err", false)).toBeUndefined();
    expect(buildDescribedBy(null, "name-err", true)).toBe("name-err");
    expect(buildDescribedBy("   ", "name-err", false)).toBeUndefined();
  });
});

describe("isNonEmptyText and isValidHttpUrl", () => {
  it("rejects empty or whitespace-only text and accepts trimmed text", () => {
    expect(isNonEmptyText("")).toBe(false);
    expect(isNonEmptyText("   \t\n  ")).toBe(false);
    expect(isNonEmptyText("  Juan Dela Cruz  ")).toBe(true);
  });

  it("accepts only valid http:// or https:// URLs", () => {
    expect(isValidHttpUrl("https://api.openai.com/v1")).toBe(true);
    expect(isValidHttpUrl("  http://localhost:11434/v1  ")).toBe(true);
    expect(isValidHttpUrl("")).toBe(false);
    expect(isValidHttpUrl("   ")).toBe(false);
    expect(isValidHttpUrl("ftp://files.example.com")).toBe(false);
    expect(isValidHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isValidHttpUrl("api.openai.com/v1")).toBe(false);
    expect(isValidHttpUrl("http://")).toBe(false);
  });
});

describe("validateSettingsForm (save scope)", () => {
  it("returns no errors for valid Profile & AI Settings", () => {
    expect(validateSettingsForm(makeSettings(), "save")).toEqual({});
  });

  it("rejects whitespace-only signatories, AI declaration, model ID, non-http(s) base URL, and required API key without visible Error prefix", () => {
    const errors = validateSettingsForm(
      makeSettings({
        profile: {
          studentTeacherName: "   ",
          cooperatingTeacherName: "\t",
          tleCoordinatorName: "",
          academicHeadName: " \n ",
          aiDeclaration: "   ",
        },
        ai: {
          aiProvider: "gemini",
          modelId: "   ",
          baseUrl: "ftp://generativelanguage.googleapis.com",
          apiKey: "   ",
        },
      }),
      "save",
    );

    expect(Object.keys(errors)).toEqual([
      "studentTeacherName",
      "cooperatingTeacherName",
      "tleCoordinatorName",
      "academicHeadName",
      "aiDeclaration",
      "modelId",
      "baseUrl",
      "apiKey",
    ]);
    for (const msg of Object.values(errors)) {
      expect(msg).toBeTruthy();
      expect(msg?.startsWith("Error:")).toBe(false);
    }
    expect(errors.modelId).toBe("Select a model ID.");
    expect(errors.apiKey).toBe("Enter an API key for Google Gemini.");
  });

  it("uses custom model phrasing when custom model mode is active and allows empty API key for Local Ollama", () => {
    const errors = validateSettingsForm(
      makeSettings({
        ai: {
          aiProvider: "ollama",
          baseUrl: "http://localhost:11434/v1",
          modelId: "  ",
          apiKey: "",
        },
      }),
      "save",
      { isCustomModel: true },
    );

    expect(errors).toEqual({
      modelId: "Enter a custom model ID.",
    });
  });
});

describe("validateSettingsForm (test and refresh scopes) & validateSettingsField", () => {
  it("validates only modelId, baseUrl, and required apiKey in DOM order for Test AI Connection", () => {
    const errors = validateSettingsForm(
      makeSettings({
        profile: {
          studentTeacherName: "",
          aiDeclaration: "",
        },
        ai: {
          aiProvider: "openrouter",
          modelId: " ",
          baseUrl: "not-a-url",
          apiKey: " ",
        },
      }),
      "test",
    );

    expect(Object.keys(errors)).toEqual(["modelId", "baseUrl", "apiKey"]);
    expect(errors.apiKey).toBe("Enter an API key for OpenRouter.");
  });

  it("validates only baseUrl and required apiKey in DOM order for Refresh Models", () => {
    const errors = validateSettingsForm(
      makeSettings({
        profile: {
          studentTeacherName: "",
        },
        ai: {
          aiProvider: "anthropic",
          modelId: "",
          baseUrl: "ws://api.anthropic.com",
          apiKey: "",
        },
      }),
      "refresh",
    );

    expect(Object.keys(errors)).toEqual(["baseUrl", "apiKey"]);
    expect(errors.apiKey).toBe("Enter an API key for Anthropic.");
  });

  it("passes Refresh Models for Local Ollama with valid http baseUrl even when modelId and apiKey are blank", () => {
    const errors = validateSettingsForm(
      makeSettings({
        profile: { studentTeacherName: "" },
        ai: {
          aiProvider: "ollama",
          baseUrl: "http://localhost:11434/v1",
          modelId: "",
          apiKey: "",
        },
      }),
      "refresh",
    );

    expect(errors).toEqual({});
  });

  it("validates a single field for blur and live-clear updates", () => {
    const invalid = makeSettings({ ai: { baseUrl: "ftp://example.com" } });
    const fixed = makeSettings({ ai: { baseUrl: "https://example.com/v1" } });

    expect(validateSettingsField("baseUrl", invalid)).toBe(
      "Enter a valid http:// or https:// base URL.",
    );
    expect(validateSettingsField("baseUrl", fixed)).toBeUndefined();
  });
});

function makeCustomCompetency(
  overrides?: Partial<CustomCompetencyFormInput>,
): CustomCompetencyFormInput {
  return {
    gradeLevels: [7],
    quarters: [1],
    contentTopic: "Basic Hand Tools in Industrial Arts",
    contentStandard: "Demonstrate understanding of hand tool safety.",
    performanceStandard: "Select and maintain appropriate hand tools safely.",
    learningCompetency: "Classify hand tools according to their function.",
    ...overrides,
  };
}

describe("validateCustomCompetencyForm & validateCustomCompetencyField", () => {
  it("returns no errors for a valid custom Learning Competency", () => {
    expect(validateCustomCompetencyForm(makeCustomCompetency())).toEqual({});
  });

  it("flags empty gradeLevels, empty quarters, and blank/whitespace-only required text fields in DOM order", () => {
    const errors = validateCustomCompetencyForm(
      makeCustomCompetency({
        gradeLevels: [],
        quarters: [],
        contentTopic: "   ",
        contentStandard: "\t",
        performanceStandard: "",
        learningCompetency: " \n ",
      }),
    );

    expect(Object.keys(errors)).toEqual([
      "gradeLevels",
      "quarters",
      "contentTopic",
      "contentStandard",
      "performanceStandard",
      "learningCompetency",
    ]);
    for (const msg of Object.values(errors)) {
      expect(msg).toBeTruthy();
      expect(msg?.startsWith("Error:")).toBe(false);
    }
  });

  it("validates individual fields for blur and live-clear behavior", () => {
    const emptyGrades = makeCustomCompetency({ gradeLevels: [] });
    const fixedGrades = makeCustomCompetency({ gradeLevels: [8, 9] });
    expect(validateCustomCompetencyField("gradeLevels", emptyGrades)).toBe(
      "Select at least one grade level.",
    );
    expect(
      validateCustomCompetencyField("gradeLevels", fixedGrades),
    ).toBeUndefined();

    const emptyQuarters = makeCustomCompetency({ quarters: [] });
    const fixedQuarters = makeCustomCompetency({ quarters: [2] });
    expect(validateCustomCompetencyField("quarters", emptyQuarters)).toBe(
      "Select at least one quarter.",
    );
    expect(
      validateCustomCompetencyField("quarters", fixedQuarters),
    ).toBeUndefined();

    expect(
      validateCustomCompetencyField(
        "learningCompetency",
        makeCustomCompetency({ learningCompetency: "   " }),
      ),
    ).toBe("Enter a Learning Competency.");
    expect(
      validateCustomCompetencyField(
        "learningCompetency",
        makeCustomCompetency({ learningCompetency: "Apply safety practices." }),
      ),
    ).toBeUndefined();
  });
});

function makeDllSessions(
  overrides?: Partial<Record<1 | 2 | 3 | 4 | 5, Partial<DllSessionConfig>>>,
): DllSessionConfig[] {
  return ([1, 2, 3, 4, 5] as const).map((sessionNumber) => ({
    sessionNumber,
    mode: "instructional",
    competencyIds: [`comp-${sessionNumber}`],
    ...overrides?.[sessionNumber],
  }));
}

function makeDllBuilderInput(
  overrides?: Partial<DllBuilderFormInput>,
): DllBuilderFormInput {
  return {
    gradeAndSection: "Grade 7 - Rizal",
    sessions: makeDllSessions(),
    ...overrides,
  };
}

describe("validateDllBuilderForm & validateDllBuilderField", () => {
  it("returns no errors when Grade Level and Section is filled and every instructional Session has a Learning Competency", () => {
    const input = makeDllBuilderInput({
      sessions: makeDllSessions({
        4: {
          mode: "non-instructional",
          competencyIds: [],
          nonInstructionalReason: "Holiday",
        },
        5: {
          mode: "non-instructional",
          competencyIds: [],
          nonInstructionalReason: "School Event",
        },
      }),
    });

    expect(validateDllBuilderForm(input)).toEqual({});
  });

  it("flags blank/whitespace Grade Level and Section and each instructional Session missing a Learning Competency in DOM order", () => {
    const errors = validateDllBuilderForm(
      makeDllBuilderInput({
        gradeAndSection: "   \t ",
        sessions: makeDllSessions({
          1: { mode: "instructional", competencyIds: [] },
          2: { mode: "instructional", competencyIds: ["comp-2"] },
          3: { mode: "non-instructional", competencyIds: [] },
          4: { mode: "instructional", competencyIds: ["   "] },
          5: { mode: "instructional", competencyIds: [] },
        }),
      }),
    );

    expect(Object.keys(errors)).toEqual([
      "gradeAndSection",
      "session-1",
      "session-4",
      "session-5",
    ]);
    for (const msg of Object.values(errors)) {
      expect(msg).toBeTruthy();
      expect(msg?.startsWith("Error:")).toBe(false);
    }
    expect(errors.gradeAndSection).toBe("Enter a Grade Level and Section.");
    expect(errors[dllSessionFieldKey(1)]).toBe(
      "Assign a Learning Competency to Session 1 or mark it Non-Instructional.",
    );
    expect(errors[dllSessionFieldKey(4)]).toBe(
      "Assign a Learning Competency to Session 4 or mark it Non-Instructional.",
    );
  });

  it("flags a group-level error when all five Sessions are Non-Instructional", () => {
    const errors = validateDllBuilderForm(
      makeDllBuilderInput({
        sessions: makeDllSessions({
          1: { mode: "non-instructional", competencyIds: [] },
          2: { mode: "non-instructional", competencyIds: [] },
          3: { mode: "non-instructional", competencyIds: [] },
          4: { mode: "non-instructional", competencyIds: [] },
          5: { mode: "non-instructional", competencyIds: [] },
        }),
      }),
    );

    expect(errors).toEqual({
      sessions:
        "Keep at least one Session as Instructional with a Learning Competency.",
    });
  });

  it("validates individual DLL fields for blur and live-clear updates", () => {
    const blankSection = makeDllBuilderInput({ gradeAndSection: "  " });
    const fixedSection = makeDllBuilderInput({
      gradeAndSection: "Grade 8 - Bonifacio",
    });
    expect(validateDllBuilderField("gradeAndSection", blankSection)).toBe(
      "Enter a Grade Level and Section.",
    );
    expect(
      validateDllBuilderField("gradeAndSection", fixedSection),
    ).toBeUndefined();

    const missingSession2 = makeDllBuilderInput({
      sessions: makeDllSessions({
        2: { mode: "instructional", competencyIds: [] },
      }),
    });
    const switchedToNonInstructional = makeDllBuilderInput({
      sessions: makeDllSessions({
        2: { mode: "non-instructional", competencyIds: [] },
      }),
    });
    expect(
      validateDllBuilderField(dllSessionFieldKey(2), missingSession2),
    ).toBe(
      "Assign a Learning Competency to Session 2 or mark it Non-Instructional.",
    );
    expect(
      validateDllBuilderField(
        dllSessionFieldKey(2),
        switchedToNonInstructional,
      ),
    ).toBeUndefined();
  });
});
