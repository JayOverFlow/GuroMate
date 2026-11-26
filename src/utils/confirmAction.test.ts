import { describe, expect, it } from "vitest";
import {
  INITIAL_CONFIRM_STATE,
  buildDeleteCustomCompetencyPrompt,
  buildDeleteDlpPrompt,
  buildDeleteQuizPrompt,
  buildRemoveDlpCompetencyPrompt,
  buildRemoveQuizCompetencyPrompt,
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

  it("extracts readable error messages from thrown errors", () => {
    expect(formatConfirmError(new Error("Delete failed (HTTP 500)."))).toBe(
      "Delete failed (HTTP 500).",
    );
    expect(formatConfirmError("Network offline")).toBe("Network offline");
    expect(formatConfirmError(new Error("   "))).toBe(
      "Action failed. Please try again.",
    );
  });

  it("builds the canonical Delete Daily Lesson Plan prompt", () => {
    expect(buildDeleteDlpPrompt("  Safe Hand Tool Handling  ")).toEqual({
      title: "Delete Daily Lesson Plan?",
      body: 'Permanently delete "Safe Hand Tool Handling" from local storage? This cannot be undone.',
      confirmLabel: "Delete DLP",
      busyLabel: "Deleting...",
    });
    expect(buildDeleteDlpPrompt("   ")).toEqual({
      title: "Delete Daily Lesson Plan?",
      body: 'Permanently delete "this Daily Lesson Plan" from local storage? This cannot be undone.',
      confirmLabel: "Delete DLP",
      busyLabel: "Deleting...",
    });
  });

  it("builds the canonical Delete Quiz prompt", () => {
    expect(buildDeleteQuizPrompt("  Formative Check: HTML Forms  ")).toEqual({
      title: "Delete Quiz?",
      body: 'Permanently delete "Formative Check: HTML Forms" from local storage? This cannot be undone.',
      confirmLabel: "Delete Quiz",
      busyLabel: "Deleting...",
    });
    expect(buildDeleteQuizPrompt("")).toEqual({
      title: "Delete Quiz?",
      body: 'Permanently delete "this Quiz" from local storage? This cannot be undone.',
      confirmLabel: "Delete Quiz",
      busyLabel: "Deleting...",
    });
  });

  it("builds the canonical Remove Learning Competency prompts for DLP and Quiz drafts", () => {
    expect(
      buildRemoveDlpCompetencyPrompt("  Classify hand tools by function  "),
    ).toEqual({
      title: "Remove Learning Competency?",
      body: 'Remove "Classify hand tools by function" from this Daily Lesson Plan? You can add it back anytime.',
      confirmLabel: "Remove",
    });

    expect(
      buildRemoveQuizCompetencyPrompt("  Apply basic HTML tags  "),
    ).toEqual({
      title: "Remove Learning Competency?",
      body: 'Remove "Apply basic HTML tags" from this Quiz? You can add it back anytime.',
      confirmLabel: "Remove",
    });
  });
});
