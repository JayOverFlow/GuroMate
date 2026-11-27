import { describe, expect, it } from "vitest";
import {
  canUseFocusReadingMode,
  resolveFocusReadingModeAfterRouteChange,
  shouldExitFocusReadingModeOnKeyDown,
  toggleFocusReadingMode,
} from "./focusReadingMode";

describe("canUseFocusReadingMode", () => {
  it("allows Focus / Full-Width reading mode only on saved DLL or DLP Markdown Web View routes", () => {
    expect(
      canUseFocusReadingMode({
        workspace: "dll",
        lessonId: "dll-1",
        viewMode: "markdown",
      }),
    ).toBe(true);
    expect(
      canUseFocusReadingMode({
        workspace: "dlp",
        lessonId: "dlp-1",
        viewMode: "markdown",
      }),
    ).toBe(true);

    expect(
      canUseFocusReadingMode({
        workspace: "dll",
        lessonId: "dll-1",
        viewMode: "edit",
      }),
    ).toBe(false);
    expect(
      canUseFocusReadingMode({
        workspace: "dlp",
        lessonId: "dlp-1",
        viewMode: "edit",
      }),
    ).toBe(false);
    expect(canUseFocusReadingMode({ workspace: "dll" })).toBe(false);
    expect(
      canUseFocusReadingMode({
        workspace: "dll",
        lessonId: "   ",
        viewMode: "markdown",
      }),
    ).toBe(false);
    expect(canUseFocusReadingMode({ workspace: "dlp" })).toBe(false);
    expect(canUseFocusReadingMode({ workspace: "library" })).toBe(false);
    expect(canUseFocusReadingMode({ workspace: "quiz" })).toBe(false);
    expect(canUseFocusReadingMode({ workspace: "classroom" })).toBe(false);
    expect(canUseFocusReadingMode({ workspace: "curriculum" })).toBe(false);
    expect(canUseFocusReadingMode({ workspace: "settings" })).toBe(false);
  });
});

describe("toggleFocusReadingMode", () => {
  it("enters Focus / Full-Width mode on eligible Markdown Web View routes and always exits when active", () => {
    const dllRead = {
      workspace: "dll" as const,
      lessonId: "dll-1",
      viewMode: "markdown" as const,
    };
    const dllEdit = {
      workspace: "dll" as const,
      lessonId: "dll-1",
      viewMode: "edit" as const,
    };

    expect(toggleFocusReadingMode(false, dllRead)).toBe(true);
    expect(toggleFocusReadingMode(true, dllRead)).toBe(false);
    expect(toggleFocusReadingMode(false, dllEdit)).toBe(false);
    expect(toggleFocusReadingMode(true, { workspace: "library" })).toBe(false);
  });
});

describe("resolveFocusReadingModeAfterRouteChange", () => {
  const dllRead = {
    workspace: "dll" as const,
    lessonId: "dll-1",
    viewMode: "markdown" as const,
  };
  const dlpRead = {
    workspace: "dlp" as const,
    lessonId: "dlp-1",
    viewMode: "markdown" as const,
  };

  it("exits Focus / Full-Width mode when switching to Editor, another workspace, fresh builder, or another lesson", () => {
    expect(
      resolveFocusReadingModeAfterRouteChange(true, dllRead, {
        workspace: "dll",
        lessonId: "dll-1",
        viewMode: "edit",
      }),
    ).toBe(false);
    expect(
      resolveFocusReadingModeAfterRouteChange(true, dllRead, {
        workspace: "library",
      }),
    ).toBe(false);
    expect(
      resolveFocusReadingModeAfterRouteChange(true, dllRead, {
        workspace: "quiz",
      }),
    ).toBe(false);
    expect(
      resolveFocusReadingModeAfterRouteChange(true, dllRead, {
        workspace: "classroom",
      }),
    ).toBe(false);
    expect(
      resolveFocusReadingModeAfterRouteChange(true, dllRead, {
        workspace: "dlp",
      }),
    ).toBe(false);
    expect(
      resolveFocusReadingModeAfterRouteChange(true, dllRead, {
        workspace: "dll",
      }),
    ).toBe(false);
    expect(
      resolveFocusReadingModeAfterRouteChange(true, dllRead, dlpRead),
    ).toBe(false);
    expect(
      resolveFocusReadingModeAfterRouteChange(true, dllRead, {
        workspace: "dll",
        lessonId: "dll-2",
        viewMode: "markdown",
      }),
    ).toBe(false);
  });

  it("preserves active Focus / Full-Width mode only when staying on the same lesson in Markdown Web View", () => {
    expect(
      resolveFocusReadingModeAfterRouteChange(true, dllRead, { ...dllRead }),
    ).toBe(true);
    expect(
      resolveFocusReadingModeAfterRouteChange(true, dlpRead, { ...dlpRead }),
    ).toBe(true);
    expect(
      resolveFocusReadingModeAfterRouteChange(false, dllRead, { ...dllRead }),
    ).toBe(false);
  });
});

describe("shouldExitFocusReadingModeOnKeyDown", () => {
  it("exits on Escape when Focus / Full-Width mode is active and no modal dialog is open", () => {
    expect(
      shouldExitFocusReadingModeOnKeyDown({
        focusMode: true,
        key: "Escape",
        hasOpenDialog: false,
      }),
    ).toBe(true);
  });

  it("ignores Escape when a modal dialog is open, already handled, inactive, modified, or another key is pressed", () => {
    expect(
      shouldExitFocusReadingModeOnKeyDown({
        focusMode: true,
        key: "Escape",
        hasOpenDialog: true,
      }),
    ).toBe(false);
    expect(
      shouldExitFocusReadingModeOnKeyDown({
        focusMode: true,
        key: "Escape",
        defaultPrevented: true,
        hasOpenDialog: false,
      }),
    ).toBe(false);
    expect(
      shouldExitFocusReadingModeOnKeyDown({
        focusMode: false,
        key: "Escape",
        hasOpenDialog: false,
      }),
    ).toBe(false);
    expect(
      shouldExitFocusReadingModeOnKeyDown({
        focusMode: true,
        key: "Enter",
        hasOpenDialog: false,
      }),
    ).toBe(false);
    expect(
      shouldExitFocusReadingModeOnKeyDown({
        focusMode: true,
        key: "Escape",
        hasOpenDialog: false,
        ctrlKey: true,
      }),
    ).toBe(false);
    expect(
      shouldExitFocusReadingModeOnKeyDown({
        focusMode: true,
        key: "Escape",
        hasOpenDialog: false,
        altKey: true,
      }),
    ).toBe(false);
    expect(
      shouldExitFocusReadingModeOnKeyDown({
        focusMode: true,
        key: "Escape",
        hasOpenDialog: false,
        metaKey: true,
      }),
    ).toBe(false);
  });
});
