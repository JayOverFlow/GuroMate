import { describe, expect, it } from "vitest";
import type { GuroMateSettings } from "../engine/types";
import {
  buildDescribedBy,
  isNonEmptyText,
  isValidHttpUrl,
  parseCustomTimerDuration,
  parseRosterText,
  validateClassSectionField,
  validateClassSectionForm,
  validateCustomCompetencyField,
  validateCustomCompetencyForm,
  validateCustomTimerField,
  validateCustomTimerForm,
  validateSettingsField,
  validateSettingsForm,
  type ClassSectionFormInput,
  type CustomCompetencyFormInput,
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

function makeClassSection(
  overrides?: Partial<ClassSectionFormInput>,
): ClassSectionFormInput {
  return {
    sectionName: "7-Rizal",
    rosterText: "Dela Cruz, Juan\nReyes, Maria",
    ...overrides,
  };
}

describe("parseRosterText, validateClassSectionForm & validateClassSectionField", () => {
  it("parses non-empty trimmed lines from CRLF and LF roster text", () => {
    expect(
      parseRosterText("  Dela Cruz, Juan \r\n\n   \t \r\n  Reyes, Maria  "),
    ).toEqual(["Dela Cruz, Juan", "Reyes, Maria"]);
    expect(parseRosterText("  \n \t \r\n ")).toEqual([]);
  });

  it("returns no errors for a valid Class Section", () => {
    expect(validateClassSectionForm(makeClassSection())).toEqual({});
  });

  it("flags blank or whitespace-only sectionName and empty/blank-line-only rosterText in DOM order", () => {
    const errors = validateClassSectionForm(
      makeClassSection({
        sectionName: "   \t ",
        rosterText: "  \n\r\n   \t  ",
      }),
    );

    expect(Object.keys(errors)).toEqual(["sectionName", "rosterText"]);
    expect(errors.sectionName).toBe("Enter a section name.");
    expect(errors.rosterText).toBe(
      "Enter at least one student name (one per line).",
    );
    for (const msg of Object.values(errors)) {
      expect(msg?.startsWith("Error:")).toBe(false);
    }
  });

  it("validates individual Class Section fields for blur and live-clear updates", () => {
    expect(
      validateClassSectionField(
        "sectionName",
        makeClassSection({ sectionName: "   " }),
      ),
    ).toBe("Enter a section name.");
    expect(
      validateClassSectionField(
        "sectionName",
        makeClassSection({ sectionName: "8-Bonifacio" }),
      ),
    ).toBeUndefined();

    expect(
      validateClassSectionField(
        "rosterText",
        makeClassSection({ rosterText: "\n   \n" }),
      ),
    ).toBe("Enter at least one student name (one per line).");
    expect(
      validateClassSectionField(
        "rosterText",
        makeClassSection({ rosterText: "\n  Santos, Carlo  \n" }),
      ),
    ).toBeUndefined();
  });
});

describe("Classroom Timer custom duration validation", () => {
  it("accepts valid integer minutes (0-180) and seconds (0-59) with combined duration > 0", () => {
    expect(validateCustomTimerForm({ minutes: "2", seconds: "30" })).toEqual({});
    expect(validateCustomTimerForm({ minutes: "0", seconds: "1" })).toEqual({});
    expect(validateCustomTimerForm({ minutes: "180", seconds: "59" })).toEqual(
      {},
    );
    expect(parseCustomTimerDuration({ minutes: " 05 ", seconds: " 09 " })).toEqual({
      minutes: 5,
      seconds: 9,
    });
  });

  it("flags out-of-range, negative, blank, and non-integer minutes and seconds", () => {
    expect(validateCustomTimerForm({ minutes: "181", seconds: "60" })).toEqual({
      minutes: "Enter a whole number from 0 to 180.",
      seconds: "Enter a whole number from 0 to 59.",
    });
    expect(validateCustomTimerForm({ minutes: "-1", seconds: "-2" })).toEqual({
      minutes: "Enter a whole number from 0 to 180.",
      seconds: "Enter a whole number from 0 to 59.",
    });
    expect(validateCustomTimerForm({ minutes: "1.5", seconds: "2.5" })).toEqual(
      {
        minutes: "Enter a whole number from 0 to 180.",
        seconds: "Enter a whole number from 0 to 59.",
      },
    );
    expect(validateCustomTimerForm({ minutes: "", seconds: "   " })).toEqual({
      minutes: "Enter a whole number from 0 to 180.",
      seconds: "Enter a whole number from 0 to 59.",
    });
    expect(validateCustomTimerForm({ minutes: "1e2", seconds: "abc" })).toEqual(
      {
        minutes: "Enter a whole number from 0 to 180.",
        seconds: "Enter a whole number from 0 to 59.",
      },
    );
    expect(
      parseCustomTimerDuration({ minutes: "181", seconds: "0" }),
    ).toBeNull();
  });

  it("flags a group duration error when both fields are 0 (00:00) and omits group error when a field itself is invalid", () => {
    expect(validateCustomTimerForm({ minutes: "0", seconds: "0" })).toEqual({
      duration: "Enter a duration greater than 00:00.",
    });
    expect(validateCustomTimerForm({ minutes: "00", seconds: "00" })).toEqual({
      duration: "Enter a duration greater than 00:00.",
    });
    expect(parseCustomTimerDuration({ minutes: "0", seconds: "0" })).toBeNull();

    const invalidMinutesOnly = validateCustomTimerForm({
      minutes: "200",
      seconds: "0",
    });
    expect(invalidMinutesOnly).toEqual({
      minutes: "Enter a whole number from 0 to 180.",
    });
    expect(invalidMinutesOnly.duration).toBeUndefined();
  });

  it("validates individual timer fields and group duration for blur and live-clear updates", () => {
    expect(
      validateCustomTimerField("minutes", { minutes: "181", seconds: "30" }),
    ).toBe("Enter a whole number from 0 to 180.");
    expect(
      validateCustomTimerField("minutes", { minutes: "10", seconds: "30" }),
    ).toBeUndefined();

    expect(
      validateCustomTimerField("seconds", { minutes: "2", seconds: "60" }),
    ).toBe("Enter a whole number from 0 to 59.");
    expect(
      validateCustomTimerField("seconds", { minutes: "2", seconds: "45" }),
    ).toBeUndefined();

    expect(
      validateCustomTimerField("duration", { minutes: "0", seconds: "0" }),
    ).toBe("Enter a duration greater than 00:00.");
    expect(
      validateCustomTimerField("duration", { minutes: "0", seconds: "15" }),
    ).toBeUndefined();
  });
});
