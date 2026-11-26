import { useCallback, useReducer, useRef } from "react";
import {
  INITIAL_CONFIRM_STATE,
  confirmDialogReducer,
  formatConfirmError,
  type ConfirmPrompt,
} from "../utils/confirmAction";

export function useConfirmDialog() {
  const [state, dispatch] = useReducer(
    confirmDialogReducer,
    INITIAL_CONFIRM_STATE,
  );
  const actionRef = useRef<(() => Promise<void> | void) | null>(null);
  const busyRef = useRef(false);

  const requestConfirm = useCallback(
    (prompt: ConfirmPrompt, action: () => Promise<void> | void) => {
      if (busyRef.current) return;
      actionRef.current = action;
      dispatch({ type: "open", prompt });
    },
    [],
  );

  const confirm = useCallback(async () => {
    if (busyRef.current || !actionRef.current) return;
    busyRef.current = true;
    dispatch({ type: "confirm_start" });
    try {
      await actionRef.current();
      actionRef.current = null;
      busyRef.current = false;
      dispatch({ type: "confirm_success" });
    } catch (err) {
      busyRef.current = false;
      dispatch({ type: "confirm_error", message: formatConfirmError(err) });
    }
  }, []);

  const cancel = useCallback(() => {
    if (busyRef.current) return;
    actionRef.current = null;
    dispatch({ type: "cancel" });
  }, []);

  return { state, requestConfirm, confirm, cancel };
}
