import { describe, expect, it } from "vitest";
import type { DllSessionConfig, GuroMateSettings } from "../engine/types";
import {
  buildDescribedBy,
  dllSessionFieldKey,
  getInvalidQuizCountTypes,
  isNonEmptyText,
  isValidHttpUrl,
  parseCustomTimerDuration,
  parseDllSessionFieldKey,
  parseQuizItemCount,
  parseQuizItemCounts,
  parseRosterText,
  updateFieldError,
  validateClassSectionField,
  validateClassSectionForm,
  validateCustomCompetencyField,
  validateCustomCompetencyForm,
  validateCustomTimerField,
  validateCustomTimerForm,
  validateDllBuilderField,
  validateDllBuilderForm,
  validateDlpBuilderField,
  validateDlpBuilderForm,
  validateQuizBuilderField,
  validateQuizBuilderForm,
  validateSettingsField,
  validateSettingsForm,
  type ClassSectionFormInput,
  type CustomCompetencyFormInput,
  type DllBuilderFormInput,
  type DlpBuilderFormInput,
  type FieldErrors,
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

describe("updateFieldError and parseDllSessionFieldKey", () => {
  it("sets, updates, clears, and preserves identity when field errors do not change", () => {
    const empty: FieldErrors<"a" | "b"> = {};
    expect(updateFieldError(empty, "a", undefined)).toBe(empty);

    const withA = updateFieldError(empty, "a", "Required.");
    expect(withA).toEqual({ a: "Required." });
    expect(updateFieldError(withA, "a", "Required.")).toBe(withA);

    const updatedA = updateFieldError(withA, "a", "Too short.");
    expect(updatedA).toEqual({ a: "Too short." });

    const cleared = updateFieldError(updatedA, "a", undefined);
    expect(cleared).toEqual({});
    expect("a" in cleared).toBe(false);
  });

  it("parses valid DLL session field keys and returns null for non-session fields", () => {
    expect(parseDllSessionFieldKey("session-1")).toBe(1);
    expect(parseDllSessionFieldKey("session-5")).toBe(5);
    expect(parseDllSessionFieldKey("gradeAndSection")).toBeNull();
    expect(parseDllSessionFieldKey("sessions")).toBeNull();
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
