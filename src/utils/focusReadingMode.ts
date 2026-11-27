import type { AppRoute } from "./workspaceRouting";

export function canUseFocusReadingMode(route: AppRoute): boolean {
  if (route.workspace !== "dll" && route.workspace !== "dlp") {
    return false;
  }
  return Boolean(route.lessonId?.trim()) && route.viewMode === "markdown";
}

export function toggleFocusReadingMode(
  isActive: boolean,
  route: AppRoute,
): boolean {
  if (isActive) return false;
  return canUseFocusReadingMode(route);
}

export function resolveFocusReadingModeAfterRouteChange(
  isActive: boolean,
  prevRoute: AppRoute,
  nextRoute: AppRoute,
): boolean {
  if (!isActive || !canUseFocusReadingMode(nextRoute)) {
    return false;
  }
  if (prevRoute.workspace !== nextRoute.workspace) {
    return false;
  }
  if (
    (prevRoute.workspace === "dll" || prevRoute.workspace === "dlp") &&
    (nextRoute.workspace === "dll" || nextRoute.workspace === "dlp")
  ) {
    return prevRoute.lessonId === nextRoute.lessonId;
  }
  return false;
}

export interface FocusKeyDownInput {
  focusMode: boolean;
  key: string;
  hasOpenDialog: boolean;
  defaultPrevented?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}

export function shouldExitFocusReadingModeOnKeyDown(
  input: FocusKeyDownInput,
): boolean {
  if (!input.focusMode) return false;
  if (input.key !== "Escape") return false;
  if (input.defaultPrevented || input.hasOpenDialog) return false;
  if (input.ctrlKey || input.altKey || input.metaKey) return false;
  return true;
}
