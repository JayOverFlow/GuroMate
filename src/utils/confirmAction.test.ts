import { describe, expect, it } from "vitest";
import {
  INITIAL_CONFIRM_STATE,
  buildDeleteClassSectionPrompt,
  buildDeleteCustomCompetencyPrompt,
  buildDeleteDllPrompt,
  buildRemoveDllCompetencyPrompt,
  confirmDialogReducer,
  formatConfirmError,
  type ConfirmPrompt,
} from "./confirmAction";

const SAMPLE_PROMPT: ConfirmPrompt = {
  title: "Delete Custom Competency?",
  body: 'Permanently delete "Web Basics" from your custom catalog? This cannot be undone.',
  confirmLabel: "Delete Competency",
  busyLabel: "Deleting...",
};

describe("confirmDialogReducer", () => {
  it("transitions idle -> open -> busy -> idle on successful confirmation", () => {
    const opened = confirmDialogReducer(INITIAL_CONFIRM_STATE, {
      type: "open",
      prompt: SAMPLE_PROMPT,
    });
    expect(opened).toEqual({
      status: "open",
      prompt: SAMPLE_PROMPT,
      error: null,
    });

    const busy = confirmDialogReducer(opened, { type: "confirm_start" });
    expect(busy).toEqual({
      status: "busy",
      prompt: SAMPLE_PROMPT,
      error: null,
    });

    const closed = confirmDialogReducer(busy, { type: "confirm_success" });
    expect(closed).toEqual(INITIAL_CONFIRM_STATE);
  });

  it("retains open state with inline error on failure and clears error on retry", () => {
    const opened = confirmDialogReducer(INITIAL_CONFIRM_STATE, {
      type: "open",
      prompt: SAMPLE_PROMPT,
    });
    const busy = confirmDialogReducer(opened, { type: "confirm_start" });
    const failed = confirmDialogReducer(busy, {
      type: "confirm_error",
      message: "Disk write failed (HTTP 500).",
    });

    expect(failed).toEqual({
      status: "open",
      prompt: SAMPLE_PROMPT,
      error: "Disk write failed (HTTP 500).",
    });

    const retrying = confirmDialogReducer(failed, { type: "confirm_start" });
    expect(retrying).toEqual({
      status: "busy",
      prompt: SAMPLE_PROMPT,
      error: null,
    });

    const succeeded = confirmDialogReducer(retrying, {
      type: "confirm_success",
    });
    expect(succeeded).toEqual(INITIAL_CONFIRM_STATE);
  });

  it("allows cancel while open (idle) and blocks cancel or re-open while busy", () => {
    const opened = confirmDialogReducer(INITIAL_CONFIRM_STATE, {
      type: "open",
      prompt: SAMPLE_PROMPT,
    });
    expect(confirmDialogReducer(opened, { type: "cancel" })).toEqual(
      INITIAL_CONFIRM_STATE,
    );

    const busy = confirmDialogReducer(opened, { type: "confirm_start" });
    expect(confirmDialogReducer(busy, { type: "cancel" })).toBe(busy);
    expect(
      confirmDialogReducer(busy, {
        type: "open",
        prompt: { ...SAMPLE_PROMPT, title: "Other" },
      }),
    ).toBe(busy);
  });

  it("ignores invalid transitions from idle or open states and normalizes blank errors", () => {
    expect(
      confirmDialogReducer(INITIAL_CONFIRM_STATE, { type: "confirm_start" }),
    ).toBe(INITIAL_CONFIRM_STATE);
    expect(
      confirmDialogReducer(INITIAL_CONFIRM_STATE, { type: "cancel" }),
    ).toBe(INITIAL_CONFIRM_STATE);

    const opened = confirmDialogReducer(INITIAL_CONFIRM_STATE, {
      type: "open",
      prompt: SAMPLE_PROMPT,
    });
    const busy = confirmDialogReducer(opened, { type: "confirm_start" });
    const blankError = confirmDialogReducer(busy, {
      type: "confirm_error",
      message: "   ",
    });
    expect(blankError).toEqual({
      status: "open",
      prompt: SAMPLE_PROMPT,
      error: "Action failed. Please try again.",
    });
  });
});

describe("buildDeleteCustomCompetencyPrompt & formatConfirmError", () => {
  it("builds the canonical Delete Custom Competency confirmation prompt", () => {
    expect(buildDeleteCustomCompetencyPrompt("  HTML Semantic Markup  ")).toEqual({
      title: "Delete Custom Competency?",
      body: 'Permanently delete "HTML Semantic Markup" from your custom catalog? This cannot be undone.',
      confirmLabel: "Delete Competency",
      busyLabel: "Deleting...",
    });
  });

  it("builds the canonical Delete Class Section prompt with singular and plural student counts", () => {
    expect(
      buildDeleteClassSectionPrompt({
        gradeLevel: 7,
        sectionName: "  Rizal  ",
        studentCount: 40,
      }),
    ).toEqual({
      title: "Delete Class Section?",
      body: 'Permanently delete "Grade 7 — Rizal" (40 students) from local storage? This cannot be undone.',
      confirmLabel: "Delete Section",
      busyLabel: "Deleting...",
    });

    expect(
      buildDeleteClassSectionPrompt({
        gradeLevel: 10,
        sectionName: "Mabini",
        studentCount: 1,
      }),
    ).toEqual({
      title: "Delete Class Section?",
      body: 'Permanently delete "Grade 10 — Mabini" (1 student) from local storage? This cannot be undone.',
      confirmLabel: "Delete Section",
      busyLabel: "Deleting...",
    });
  });

  it("extracts readable error messages from thrown errors", () => {
    expect(formatConfirmError(new Error("Delete failed (HTTP 500)."))).toBe(
      "Delete failed (HTTP 500).",
    );
    expect(formatConfirmError("Network offline")).toBe("Network offline");
    expect(formatConfirmError(new Error("   "))).toBe(
      "Action failed. Please try again.",
    );
  });

  it("builds the canonical Delete Daily Lesson Log confirmation prompt", () => {
    expect(buildDeleteDllPrompt("  Week 3 ICT & FCS Plan  ")).toEqual({
      title: "Delete Daily Lesson Log?",
      body: 'Permanently delete "Week 3 ICT & FCS Plan" from local storage? This cannot be undone.',
      confirmLabel: "Delete DLL",
      busyLabel: "Deleting...",
    });

    expect(buildDeleteDllPrompt("   ")).toEqual({
      title: "Delete Daily Lesson Log?",
      body: 'Permanently delete "this Daily Lesson Log" from local storage? This cannot be undone.',
      confirmLabel: "Delete DLL",
      busyLabel: "Deleting...",
    });
  });

  it("builds the canonical Remove Learning Competency from DLL Session confirmation prompt", () => {
    expect(
      buildRemoveDllCompetencyPrompt(
        "  Identify basic hand tools in carpentry.  ",
        3,
      ),
    ).toEqual({
      title: "Remove Learning Competency?",
      body: 'Remove "Identify basic hand tools in carpentry." from Session 3? You can add it back anytime.',
      confirmLabel: "Remove",
    });

    expect(buildRemoveDllCompetencyPrompt("   ", 1)).toEqual({
      title: "Remove Learning Competency?",
      body: 'Remove "this Learning Competency" from Session 1? You can add it back anytime.',
      confirmLabel: "Remove",
    });
  });
});
