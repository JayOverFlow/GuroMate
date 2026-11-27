export type WorkspaceId =
  | "library"
  | "dll"
  | "dlp"
  | "quiz"
  | "classroom"
  | "curriculum"
  | "settings";

export type LessonViewMode = "edit" | "markdown";
export type LessonKind = "dll" | "dlp";

export type AppRoute =
  | { workspace: "library" }
  | { workspace: "dll"; lessonId?: string; viewMode?: LessonViewMode }
  | { workspace: "dlp"; lessonId?: string; viewMode?: LessonViewMode }
  | { workspace: "quiz" }
  | { workspace: "classroom" }
  | { workspace: "curriculum" }
  | { workspace: "settings" };

const SIMPLE_WORKSPACES = new Set<
  "library" | "quiz" | "classroom" | "curriculum" | "settings"
>(["library", "quiz", "classroom", "curriculum", "settings"]);

function safeDecodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function parseHashRoute(hash: string): AppRoute {
  const cleaned = hash.replace(/^#/, "").trim().replace(/^\/+|\/+$/g, "");
  if (!cleaned) return { workspace: "library" };

  const [first, rawId, rawMode] = cleaned.split("/");
  if (
    first &&
    SIMPLE_WORKSPACES.has(
      first as "library" | "quiz" | "classroom" | "curriculum" | "settings",
    )
  ) {
    return {
      workspace: first as
        | "library"
        | "quiz"
        | "classroom"
        | "curriculum"
        | "settings",
    };
  }

  if (first === "dll" || first === "dlp") {
    const lessonId = rawId ? safeDecodeSegment(rawId).trim() : "";
    if (!lessonId) {
      return { workspace: first };
    }
    const viewMode: LessonViewMode =
      rawMode?.toLowerCase() === "read" ? "markdown" : "edit";
    return { workspace: first, lessonId, viewMode };
  }

  return { workspace: "library" };
}

export function serializeHashRoute(route: AppRoute): string {
  if (route.workspace === "dll" || route.workspace === "dlp") {
    const id = route.lessonId?.trim();
    if (!id) {
      return `#${route.workspace}`;
    }
    const encodedId = encodeURIComponent(id);
    return route.viewMode === "markdown"
      ? `#${route.workspace}/${encodedId}/read`
      : `#${route.workspace}/${encodedId}`;
  }

  return `#${route.workspace}`;
}

function lessonKindLabel(kind: LessonKind): string {
  return kind === "dll" ? "Daily Lesson Log" : "Daily Lesson Plan";
}

export function buildMissingLessonNotice(
  kind: LessonKind,
  lessonId: string,
): string {
  const label = lessonKindLabel(kind);
  const trimmed = lessonId.trim();
  return trimmed
    ? `${label} "${trimmed}" was not found. It may have been deleted.`
    : `${label} was not found. It may have been deleted.`;
}

export function buildDeletedLessonNotice(
  kind: LessonKind,
  lessonTitle: string,
): string {
  const label = lessonKindLabel(kind);
  const trimmed = lessonTitle.trim();
  return trimmed ? `Deleted ${label} "${trimmed}".` : `Deleted ${label}.`;
}
