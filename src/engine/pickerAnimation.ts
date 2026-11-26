import type { PickerAnimationMode } from "./classroomPreferences";
import { drawRandomStudent, type RosterStudent } from "./classroomTools";

export const SLOT_REEL_DURATION_MS = 2600;
export const SINGLE_STUDENT_SPOTLIGHT_DURATION_MS = 600;
const SLOT_REEL_STEPS = 30;

export type AvailablePickerMode = "slot" | "instant";

export interface PreparedPickerDraw {
  picked: RosterStudent | null;
  pendingUsedIndices: Set<number>;
  exhausted: boolean;
  eligibleStudents: RosterStudent[];
}

export interface SlotReelPlan {
  winner: RosterStudent;
  durationMs: number;
  isSingleStudentSpotlight: boolean;
  /** Reel strip with leading/trailing neighbors for multi-student draws; ends at `reelItems[targetIndex] === winner`. */
  reelItems: RosterStudent[];
  startIndex: number;
  targetIndex: number;
}

export interface SlotReelWindow {
  prev: RosterStudent | null;
  current: RosterStudent;
  next: RosterStudent | null;
  afterNext: RosterStudent | null;
  stepIndex: number;
  stepFraction: number;
  progress: number;
  isComplete: boolean;
}

export interface PendingPickerDraw {
  drawId: number;
  winner: RosterStudent;
  pendingUsedIndices: Set<number>;
  plan: SlotReelPlan;
}

export interface PickerLifecycleState {
  usedIndices: Set<number>;
  pickedStudent: RosterStudent | null;
  poolExhausted: boolean;
  pendingDraw: PendingPickerDraw | null;
  nextDrawId: number;
}

export interface StartPickerDrawOptions {
  presentStudents: readonly RosterStudent[];
  removeFromPool: boolean;
  effectiveMode: PickerAnimationMode;
  random?: () => number;
}

export type StartPickerDrawResult =
  | { state: PickerLifecycleState; outcome: "ignored-locked" }
  | { state: PickerLifecycleState; outcome: "exhausted" }
  | {
      state: PickerLifecycleState;
      outcome: "instant-revealed";
      winner: RosterStudent;
    }
  | {
      state: PickerLifecycleState;
      outcome: "animating";
      pendingDraw: PendingPickerDraw;
    };

export interface CommitPendingDrawResult {
  state: PickerLifecycleState;
  committed: boolean;
  winner: RosterStudent | null;
}

export function getEligibleRecitationStudents(
  present: readonly RosterStudent[],
  usedIndices: ReadonlySet<number>,
  removeFromPool: boolean,
): RosterStudent[] {
  return removeFromPool
    ? present.filter((student) => !usedIndices.has(student.index))
    : [...present];
}

export function preparePickerDraw(
  present: readonly RosterStudent[],
  usedIndices: ReadonlySet<number>,
  removeFromPool: boolean,
  random: () => number = Math.random,
): PreparedPickerDraw {
  const eligibleStudents = getEligibleRecitationStudents(
    present,
    usedIndices,
    removeFromPool,
  );
  const result = drawRandomStudent(present, usedIndices, removeFromPool, random);
  return {
    picked: result.picked,
    pendingUsedIndices: result.nextUsedIndices,
    exhausted: result.exhausted,
    eligibleStudents,
  };
}

function pickDistinctStudent(
  pool: readonly RosterStudent[],
  avoidIndices: readonly number[],
  random: () => number,
): RosterStudent {
  const filtered = pool.filter((s) => !avoidIndices.includes(s.index));
  const candidates = filtered.length > 0 ? filtered : pool;
  const idx = Math.min(
    candidates.length - 1,
    Math.floor(random() * candidates.length),
  );
  return candidates[idx]!;
}

export function buildSlotReelPlan(
  eligibleStudents: readonly RosterStudent[],
  winner: RosterStudent,
  random: () => number = Math.random,
): SlotReelPlan {
  if (eligibleStudents.length <= 1) {
    return {
      winner,
      durationMs: SINGLE_STUDENT_SPOTLIGHT_DURATION_MS,
      isSingleStudentSpotlight: true,
      reelItems: [winner],
      startIndex: 0,
      targetIndex: 0,
    };
  }

  const startIndex = 1;
  const targetIndex = startIndex + SLOT_REEL_STEPS;
  const totalLength = targetIndex + 2;
  const reelItems: RosterStudent[] = new Array<RosterStudent>(totalLength);

  // Fill slots 0 .. targetIndex - 1 so no two consecutive entries share a student
  // and slot (targetIndex - 1) never equals the winner.
  for (let i = 0; i < targetIndex; i++) {
    const avoid: number[] = [];
    if (i > 0) avoid.push(reelItems[i - 1]!.index);
    if (i === targetIndex - 1) avoid.push(winner.index);
    reelItems[i] = pickDistinctStudent(eligibleStudents, avoid, random);
  }

  reelItems[targetIndex] = winner;

  // Trailing neighbor after the winner (prefer distinct from both winner and prev when pool >= 3).
  const trailingAvoid =
    eligibleStudents.length >= 3
      ? [winner.index, reelItems[targetIndex - 1]!.index]
      : [winner.index];
  reelItems[targetIndex + 1] = pickDistinctStudent(
    eligibleStudents,
    trailingAvoid,
    random,
  );

  return {
    winner,
    durationMs: SLOT_REEL_DURATION_MS,
    isSingleStudentSpotlight: false,
    reelItems,
    startIndex,
    targetIndex,
  };
}

export function easeOutSlot(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return 1 - (1 - clamped) * (1 - clamped);
}

export function sampleSlotReelWindow(
  plan: SlotReelPlan,
  rawProgress: number,
): SlotReelWindow {
  const progress = Math.max(0, Math.min(1, rawProgress));
  const isComplete = progress >= 1;

  if (plan.isSingleStudentSpotlight || plan.reelItems.length <= 1) {
    return {
      prev: null,
      current: plan.winner,
      next: null,
      afterNext: null,
      stepIndex: 0,
      stepFraction: 0,
      progress,
      isComplete,
    };
  }

  const totalSteps = plan.targetIndex - plan.startIndex;
  const easedSteps = isComplete
    ? totalSteps
    : easeOutSlot(progress) * totalSteps;
  const stepIndex = isComplete
    ? totalSteps
    : Math.min(totalSteps - 1, Math.floor(easedSteps));
  const stepFraction = isComplete ? 0 : easedSteps - stepIndex;
  const reelIdx = plan.startIndex + stepIndex;

  return {
    prev: plan.reelItems[reelIdx - 1] ?? null,
    current: plan.reelItems[reelIdx] ?? plan.winner,
    next: plan.reelItems[reelIdx + 1] ?? null,
    afterNext: plan.reelItems[reelIdx + 2] ?? null,
    stepIndex,
    stepFraction,
    progress,
    isComplete,
  };
}

export function normalizeAvailablePickerMode(
  mode: PickerAnimationMode,
): AvailablePickerMode {
  return mode === "instant" ? "instant" : "slot";
}

export function createInitialPickerState(): PickerLifecycleState {
  return {
    usedIndices: new Set(),
    pickedStudent: null,
    poolExhausted: false,
    pendingDraw: null,
    nextDrawId: 1,
  };
}

export function isPickerLocked(state: PickerLifecycleState): boolean {
  return state.pendingDraw !== null;
}

export function startPickerDraw(
  state: PickerLifecycleState,
  options: StartPickerDrawOptions,
): StartPickerDrawResult {
  if (state.pendingDraw !== null) {
    return { state, outcome: "ignored-locked" };
  }

  const random = options.random ?? Math.random;
  const prepared = preparePickerDraw(
    options.presentStudents,
    state.usedIndices,
    options.removeFromPool,
    random,
  );

  if (prepared.exhausted || !prepared.picked) {
    return {
      state: {
        ...state,
        poolExhausted: true,
      },
      outcome: "exhausted",
    };
  }

  const playbackMode = normalizeAvailablePickerMode(options.effectiveMode);
  if (playbackMode === "instant") {
    return {
      state: {
        ...state,
        usedIndices: new Set(prepared.pendingUsedIndices),
        pickedStudent: prepared.picked,
        poolExhausted: false,
        pendingDraw: null,
      },
      outcome: "instant-revealed",
      winner: prepared.picked,
    };
  }

  const plan = buildSlotReelPlan(
    prepared.eligibleStudents,
    prepared.picked,
    random,
  );
  const pendingDraw: PendingPickerDraw = {
    drawId: state.nextDrawId,
    winner: prepared.picked,
    pendingUsedIndices: prepared.pendingUsedIndices,
    plan,
  };

  return {
    state: {
      ...state,
      poolExhausted: false,
      pendingDraw,
      nextDrawId: state.nextDrawId + 1,
    },
    outcome: "animating",
    pendingDraw,
  };
}

export function commitPendingDraw(
  state: PickerLifecycleState,
  expectedDrawId?: number,
): CommitPendingDrawResult {
  const pending = state.pendingDraw;
  if (!pending) {
    return { state, committed: false, winner: null };
  }
  if (expectedDrawId !== undefined && pending.drawId !== expectedDrawId) {
    return { state, committed: false, winner: null };
  }

  return {
    state: {
      ...state,
      usedIndices: new Set(pending.pendingUsedIndices),
      pickedStudent: pending.winner,
      poolExhausted: false,
      pendingDraw: null,
    },
    committed: true,
    winner: pending.winner,
  };
}

export function resetPickerPool(
  state: PickerLifecycleState,
): PickerLifecycleState {
  if (state.pendingDraw !== null) {
    return state;
  }
  return {
    ...state,
    usedIndices: new Set(),
    pickedStudent: null,
    poolExhausted: false,
  };
}
