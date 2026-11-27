import { describe, expect, it } from "vitest";
import {
  buildDeletedLessonNotice,
  buildMissingLessonNotice,
  isPlainLeftClick,
  parseHashRoute,
  serializeHashRoute,
} from "./workspaceRouting";

describe("parseHashRoute", () => {
  it("defaults empty or unknown hashes to Lesson Library and recognizes top-level workspaces", () => {
    expect(parseHashRoute("")).toEqual({ workspace: "library" });
    expect(parseHashRoute("#")).toEqual({ workspace: "library" });
    expect(parseHashRoute("#library")).toEqual({ workspace: "library" });
    expect(parseHashRoute("#unknown-route")).toEqual({ workspace: "library" });
    expect(parseHashRoute("#quiz")).toEqual({ workspace: "quiz" });
    expect(parseHashRoute("#classroom")).toEqual({ workspace: "classroom" });
    expect(parseHashRoute("#curriculum")).toEqual({ workspace: "curriculum" });
    expect(parseHashRoute("#settings")).toEqual({ workspace: "settings" });
  });

  it("parses DLL and DLP creation, edit, and read deep-link hashes", () => {
    expect(parseHashRoute("#dll")).toEqual({ workspace: "dll" });
    expect(parseHashRoute("#dll/")).toEqual({ workspace: "dll" });
    expect(parseHashRoute("#dll/dll-123")).toEqual({
      workspace: "dll",
      lessonId: "dll-123",
      viewMode: "edit",
    });
    expect(parseHashRoute("#dll/dll-123/read")).toEqual({
      workspace: "dll",
      lessonId: "dll-123",
      viewMode: "markdown",
    });

    expect(parseHashRoute("#dlp")).toEqual({ workspace: "dlp" });
    expect(parseHashRoute("#dlp/dlp-456")).toEqual({
      workspace: "dlp",
      lessonId: "dlp-456",
      viewMode: "edit",
    });
    expect(parseHashRoute("#dlp/dlp-456/read")).toEqual({
      workspace: "dlp",
      lessonId: "dlp-456",
      viewMode: "markdown",
    });
  });

  it("decodes URL-encoded lesson IDs and handles malformed percent sequences safely", () => {
    expect(parseHashRoute("#dll/lesson%20with%20spaces/read")).toEqual({
      workspace: "dll",
      lessonId: "lesson with spaces",
      viewMode: "markdown",
    });
    expect(parseHashRoute("#dlp/%E0%A4%A")).toEqual({
      workspace: "dlp",
      lessonId: "%E0%A4%A",
      viewMode: "edit",
    });
  });
});

describe("serializeHashRoute", () => {
  it("serializes top-level and lesson deep-link routes with URI encoding", () => {
    expect(serializeHashRoute({ workspace: "library" })).toBe("#library");
    expect(serializeHashRoute({ workspace: "quiz" })).toBe("#quiz");
    expect(serializeHashRoute({ workspace: "classroom" })).toBe("#classroom");
    expect(serializeHashRoute({ workspace: "curriculum" })).toBe("#curriculum");
    expect(serializeHashRoute({ workspace: "settings" })).toBe("#settings");

    expect(serializeHashRoute({ workspace: "dll" })).toBe("#dll");
    expect(serializeHashRoute({ workspace: "dll", lessonId: "   " })).toBe(
      "#dll",
    );
    expect(
      serializeHashRoute({
        workspace: "dll",
        lessonId: "dll-123",
        viewMode: "edit",
      }),
    ).toBe("#dll/dll-123");
    expect(
      serializeHashRoute({
        workspace: "dll",
        lessonId: "dll-123",
        viewMode: "markdown",
      }),
    ).toBe("#dll/dll-123/read");

    expect(serializeHashRoute({ workspace: "dlp" })).toBe("#dlp");
    expect(
      serializeHashRoute({
        workspace: "dlp",
        lessonId: "lesson with spaces",
        viewMode: "markdown",
      }),
    ).toBe("#dlp/lesson%20with%20spaces/read");
  });
});

describe("lesson navigation notices", () => {
  it("formats informational notice for missing DLL or DLP deep-links", () => {
    expect(buildMissingLessonNotice("dll", "dll-missing")).toBe(
      'Daily Lesson Log "dll-missing" was not found. It may have been deleted.',
    );
    expect(buildMissingLessonNotice("dlp", "dlp-missing")).toBe(
      'Daily Lesson Plan "dlp-missing" was not found. It may have been deleted.',
    );
  });

  it("formats confirmation notice after deleting a DLL or DLP", () => {
    expect(buildDeletedLessonNotice("dll", "Computer Systems Servicing")).toBe(
      'Deleted Daily Lesson Log "Computer Systems Servicing".',
    );
    expect(buildDeletedLessonNotice("dlp", "   ")).toBe(
      "Deleted Daily Lesson Plan.",
    );
  });
});

describe("isPlainLeftClick", () => {
  it("returns true only for unmodified primary-button clicks", () => {
    expect(
      isPlainLeftClick({
        button: 0,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
      }),
    ).toBe(true);
    expect(
      isPlainLeftClick({
        button: 1,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
      }),
    ).toBe(false);
    expect(
      isPlainLeftClick({
        button: 0,
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
      }),
    ).toBe(false);
    expect(
      isPlainLeftClick({
        button: 0,
        metaKey: false,
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
      }),
    ).toBe(false);
    expect(
      isPlainLeftClick({
        button: 0,
        metaKey: false,
        ctrlKey: false,
        shiftKey: true,
        altKey: false,
      }),
    ).toBe(false);
    expect(
      isPlainLeftClick({
        button: 0,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: true,
      }),
    ).toBe(false);
  });
});
