import { describe, expect, it } from "vitest";
import type { GuroMateSettings } from "../engine/types";
import {
  buildDescribedBy,
  getInvalidQuizCountTypes,
  isNonEmptyText,
  isValidHttpUrl,
  parseQuizItemCount,
  parseQuizItemCounts,
  validateCustomCompetencyField,
  validateCustomCompetencyForm,
  validateDlpBuilderField,
  validateDlpBuilderForm,
  validateQuizBuilderField,
  validateQuizBuilderForm,
  validateSettingsField,
  validateSettingsForm,
  type CustomCompetencyFormInput,
  type DlpBuilderFormInput,
  type QuizBuilderFormInput,
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

function makeDlpBuilderInput(
  overrides?: Partial<DlpBuilderFormInput>,
): DlpBuilderFormInput {
  return {
    mode: "scratch",
    gradeAndSection: "Grade 7 - Rizal",
    selectedCompetencyIds: ["comp-1"],
    ...overrides,
  };
}

describe("validateDlpBuilderForm & validateDlpBuilderField", () => {
  it("returns no errors for a valid From Scratch DLP Builder form", () => {
    expect(validateDlpBuilderForm(makeDlpBuilderInput())).toEqual({});
  });

  it("flags blank/whitespace Grade Level and Section and empty Learning Competencies in From Scratch mode in DOM order", () => {
    const errors = validateDlpBuilderForm(
      makeDlpBuilderInput({
        mode: "scratch",
        gradeAndSection: "   \t ",
        selectedCompetencyIds: [],
      }),
    );

    expect(Object.keys(errors)).toEqual([
      "gradeAndSection",
      "selectedCompetencyIds",
    ]);
    expect(errors.gradeAndSection).toBe("Enter a Grade Level and Section.");
    expect(errors.selectedCompetencyIds).toBe(
      "Select at least one Learning Competency.",
    );
    for (const msg of Object.values(errors)) {
      expect(msg?.startsWith("Error:")).toBe(false);
    }
  });

  it("skips From Scratch field errors when deriving from a DLL Session", () => {
    expect(
      validateDlpBuilderForm(
        makeDlpBuilderInput({
          mode: "derive",
          gradeAndSection: "",
          selectedCompetencyIds: [],
        }),
      ),
    ).toEqual({});
  });

  it("validates individual DLP Builder fields for blur and live-clear updates", () => {
    expect(
      validateDlpBuilderField(
        "gradeAndSection",
        makeDlpBuilderInput({ gradeAndSection: "   " }),
      ),
    ).toBe("Enter a Grade Level and Section.");
    expect(
      validateDlpBuilderField(
        "gradeAndSection",
        makeDlpBuilderInput({ gradeAndSection: "Grade 8 - Bonifacio" }),
      ),
    ).toBeUndefined();

    expect(
      validateDlpBuilderField(
        "selectedCompetencyIds",
        makeDlpBuilderInput({ selectedCompetencyIds: [] }),
      ),
    ).toBe("Select at least one Learning Competency.");
    expect(
      validateDlpBuilderField(
        "selectedCompetencyIds",
        makeDlpBuilderInput({ selectedCompetencyIds: ["comp-2"] }),
      ),
    ).toBeUndefined();
  });
});

function makeQuizBuilderInput(
  overrides?: Partial<QuizBuilderFormInput>,
): QuizBuilderFormInput {
  return {
    sourceKind: "standalone",
    gradeAndSection: "Grade 7 - Rizal",
    selectedCompetencyIds: ["comp-1"],
    itemCounts: {
      multipleChoice: "5",
      trueFalse: "0",
      identification: "0",
      essayRubric: "0",
    },
    ...overrides,
  };
}

describe("validateQuizBuilderForm, validateQuizBuilderField & Quiz item count helpers", () => {
  it("accepts valid standalone Quiz Maker inputs and parses integer counts", () => {
    const input = makeQuizBuilderInput({
      itemCounts: {
        multipleChoice: "10",
        trueFalse: "5",
        identification: "0",
        essayRubric: "50",
      },
    });
    expect(validateQuizBuilderForm(input)).toEqual({});
    expect(parseQuizItemCounts(input.itemCounts)).toEqual({
      multipleChoice: 10,
      trueFalse: 5,
      identification: 0,
      essayRubric: 50,
    });
    expect(getInvalidQuizCountTypes(input.itemCounts)).toEqual([]);
  });

  it("flags blank Grade Level and Section, empty Learning Competencies, and zero total items in standalone mode in DOM order", () => {
    const errors = validateQuizBuilderForm(
      makeQuizBuilderInput({
        sourceKind: "standalone",
        gradeAndSection: "   ",
        selectedCompetencyIds: [],
        itemCounts: {
          multipleChoice: "0",
          trueFalse: "0",
          identification: "0",
          essayRubric: "0",
        },
      }),
    );

    expect(Object.keys(errors)).toEqual([
      "gradeAndSection",
      "selectedCompetencyIds",
      "itemCounts",
    ]);
    expect(errors.gradeAndSection).toBe("Enter a Grade Level and Section.");
    expect(errors.selectedCompetencyIds).toBe(
      "Select at least one Learning Competency.",
    );
    expect(errors.itemCounts).toBe(
      "Set at least 1 item across question types.",
    );
    expect(
      getInvalidQuizCountTypes({
        multipleChoice: "0",
        trueFalse: "0",
        identification: "0",
        essayRubric: "0",
      }),
    ).toEqual(["multipleChoice", "trueFalse", "identification", "essayRubric"]);
    for (const msg of Object.values(errors)) {
      expect(msg?.startsWith("Error:")).toBe(false);
    }
  });

  it("validates item counts across dll and dlp source modes while skipping standalone-only fields", () => {
    for (const sourceKind of ["dll", "dlp"] as const) {
      const zeroErrors = validateQuizBuilderForm(
        makeQuizBuilderInput({
          sourceKind,
          gradeAndSection: "",
          selectedCompetencyIds: [],
          itemCounts: {
            multipleChoice: "0",
            trueFalse: "0",
            identification: "0",
            essayRubric: "0",
          },
        }),
      );
      expect(zeroErrors).toEqual({
        itemCounts: "Set at least 1 item across question types.",
      });

      const valid = validateQuizBuilderForm(
        makeQuizBuilderInput({
          sourceKind,
          gradeAndSection: "",
          selectedCompetencyIds: [],
          itemCounts: {
            multipleChoice: "0",
            trueFalse: "3",
            identification: "0",
            essayRubric: "0",
          },
        }),
      );
      expect(valid).toEqual({});
    }
  });

  it("rejects out-of-range, negative, decimal, non-numeric, and blank item counts and identifies offending types", () => {
    expect(parseQuizItemCount("0")).toBe(0);
    expect(parseQuizItemCount("50")).toBe(50);
    expect(parseQuizItemCount(25)).toBe(25);
    expect(parseQuizItemCount("-1")).toBeNull();
    expect(parseQuizItemCount("51")).toBeNull();
    expect(parseQuizItemCount("2.5")).toBeNull();
    expect(parseQuizItemCount("2.0")).toBeNull();
    expect(parseQuizItemCount("")).toBeNull();
    expect(parseQuizItemCount("   ")).toBeNull();
    expect(parseQuizItemCount("abc")).toBeNull();
    expect(parseQuizItemCount(1.5)).toBeNull();
    expect(parseQuizItemCount(51)).toBeNull();

    const drafts = {
      multipleChoice: "5",
      trueFalse: "51",
      identification: "-2",
      essayRubric: "2.5",
    };
    expect(
      validateQuizBuilderField(
        "itemCounts",
        makeQuizBuilderInput({ itemCounts: drafts }),
      ),
    ).toBe("Enter whole numbers from 0 to 50 for each question type.");
    expect(getInvalidQuizCountTypes(drafts)).toEqual([
      "trueFalse",
      "identification",
      "essayRubric",
    ]);
    expect(parseQuizItemCounts(drafts)).toBeNull();
  });

  it("validates individual standalone Quiz Maker fields for blur and live-clear updates", () => {
    expect(
      validateQuizBuilderField(
        "gradeAndSection",
        makeQuizBuilderInput({ gradeAndSection: "\n" }),
      ),
    ).toBe("Enter a Grade Level and Section.");
    expect(
      validateQuizBuilderField(
        "gradeAndSection",
        makeQuizBuilderInput({ gradeAndSection: "Grade 9 - Mabini" }),
      ),
    ).toBeUndefined();
    expect(
      validateQuizBuilderField(
        "selectedCompetencyIds",
        makeQuizBuilderInput({ selectedCompetencyIds: [] }),
      ),
    ).toBe("Select at least one Learning Competency.");
    expect(
      validateQuizBuilderField(
        "selectedCompetencyIds",
        makeQuizBuilderInput({ selectedCompetencyIds: ["comp-1"] }),
      ),
    ).toBeUndefined();
  });
});
