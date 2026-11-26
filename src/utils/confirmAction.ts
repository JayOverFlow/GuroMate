export interface ConfirmPrompt {
  title: string;
  body: string;
  confirmLabel: string;
  busyLabel?: string;
}

export type ConfirmDialogState =
  | { status: "idle"; prompt: null; error: null }
  | { status: "open"; prompt: ConfirmPrompt; error: string | null }
  | { status: "busy"; prompt: ConfirmPrompt; error: null };

export type ConfirmDialogAction =
  | { type: "open"; prompt: ConfirmPrompt }
  | { type: "confirm_start" }
  | { type: "confirm_success" }
  | { type: "confirm_error"; message: string }
  | { type: "cancel" };

const DEFAULT_CONFIRM_ERROR = "Action failed. Please try again.";

export const INITIAL_CONFIRM_STATE: ConfirmDialogState = {
  status: "idle",
  prompt: null,
  error: null,
};

export function confirmDialogReducer(
  state: ConfirmDialogState,
  action: ConfirmDialogAction,
): ConfirmDialogState {
  switch (action.type) {
    case "open":
      if (state.status === "busy") return state;
      return { status: "open", prompt: action.prompt, error: null };
    case "confirm_start":
      if (state.status !== "open") return state;
      return { status: "busy", prompt: state.prompt, error: null };
    case "confirm_success":
      if (state.status !== "busy") return state;
      return INITIAL_CONFIRM_STATE;
    case "confirm_error":
      if (state.status !== "busy") return state;
      return {
        status: "open",
        prompt: state.prompt,
        error: action.message.trim() || DEFAULT_CONFIRM_ERROR,
      };
    case "cancel":
      if (state.status !== "open") return state;
      return INITIAL_CONFIRM_STATE;
  }
}

export function formatConfirmError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.trim() || DEFAULT_CONFIRM_ERROR;
}

export function buildDeleteCustomCompetencyPrompt(
  contentTopic: string,
): ConfirmPrompt {
  const topic = contentTopic.trim() || "this competency";
  return {
    title: "Delete Custom Competency?",
    body: `Permanently delete "${topic}" from your custom catalog? This cannot be undone.`,
    confirmLabel: "Delete Competency",
    busyLabel: "Deleting...",
  };
}

export function buildDeleteClassSectionPrompt(section: {
  gradeLevel: number;
  sectionName: string;
  studentCount: number;
}): ConfirmPrompt {
  const name = section.sectionName.trim() || "Untitled Section";
  const count = Math.max(0, Math.floor(section.studentCount));
  const studentLabel = count === 1 ? "1 student" : `${count} students`;
  return {
    title: "Delete Class Section?",
    body: `Permanently delete "Grade ${section.gradeLevel} — ${name}" (${studentLabel}) from local storage? This cannot be undone.`,
    confirmLabel: "Delete Section",
    busyLabel: "Deleting...",
  };
}
