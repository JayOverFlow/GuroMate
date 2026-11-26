import type { PickerAnimationMode } from "./classroomPreferences";
import { drawRandomStudent, type RosterStudent } from "./classroomTools";

export const SLOT_REEL_DURATION_MS = 2600;
export const SINGLE_STUDENT_SPOTLIGHT_DURATION_MS = 600;
export const MAX_MYSTERY_CARDS = 5;
export const CARD_FLIP_SHUFFLE_DURATION_MS = 1000;
export const CARD_FLIP_DURATION_MS = 800;
export const CARD_FLIP_AUTO_TOTAL_MS =
  CARD_FLIP_SHUFFLE_DURATION_MS + CARD_FLIP_DURATION_MS;
const SLOT_REEL_STEPS = 30;
const CARD_FLIP_SHUFFLE_STEPS = 5;

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

export interface CreateCardFlipPlanOptions {
  eligibleCount: number;
  requestedSlotIndex?: number;
  random?: () => number;
}

export interface CardFlipPlan {
  cardCount: number;
  chosenSlotIndex: number;
  isDirectPick: boolean;
  shuffleDurationMs: number;
  flipDurationMs: number;
  totalDurationMs: number;
}

export type CardFlipPhase = "shuffling" | "flipping" | "revealed";

export interface CardFlipFrame {
  phase: CardFlipPhase;
  progress: number;
  activeSlotIndex: number;
  shuffleStep: number;
  isComplete: boolean;
}

export interface CardFanSlotLayout {
  /** Signed distance from the fan midpoint (negative = left, 0 = center, positive = right). */
  offset: number;
  /** Rotation angle in degrees around the bottom-center pivot (0 for a single card). */
  angleDeg: number;
  /** Downward vertical arc offset in pixels so outer cards follow a curved hand profile. */
  arcYPx: number;
  /** Horizontal inward nudge in pixels during auto-pick shuffle. */
  shuffleXPx: number;
  /** Ascending left-to-right stacking order (1..cardCount). */
  zIndex: number;
}

export interface PendingSlotPickerDraw {
  mode: "slot";
  drawId: number;
  winner: RosterStudent;
  pendingUsedIndices: Set<number>;
  plan: SlotReelPlan;
}

export interface PendingCardFlipPickerDraw {
  mode: "card-flip";
  drawId: number;
  winner: RosterStudent;
  pendingUsedIndices: Set<number>;
  plan: CardFlipPlan;
}

export type PendingPickerDraw =
  | PendingSlotPickerDraw
  | PendingCardFlipPickerDraw;

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
  requestedSlotIndex?: number;
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

export function getMysteryCardCount(eligibleCount: number): number {
  if (!Number.isFinite(eligibleCount)) return 0;
  return Math.min(MAX_MYSTERY_CARDS, Math.max(0, Math.floor(eligibleCount)));
}

function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}

export function getCardFanSlotLayout(
  slotIndex: number,
  cardCount: number,
): CardFanSlotLayout {
  const safeCount = getMysteryCardCount(cardCount);
  if (safeCount <= 1) {
    return {
      offset: 0,
      angleDeg: 0,
      arcYPx: 0,
      shuffleXPx: 0,
      zIndex: 1,
    };
  }

  const safeSlot = Number.isFinite(slotIndex) ? Math.floor(slotIndex) : 0;
  const clampedSlot = Math.min(safeCount - 1, Math.max(0, safeSlot));
  const mid = (safeCount - 1) / 2;
  const offset = normalizeZero(clampedSlot - mid);
  const stepDeg = safeCount === 2 ? 16 : 11;
  const angleDeg = normalizeZero(offset * stepDeg);
  const arcYPx = normalizeZero(Math.round(offset * offset * 3));
  const shuffleXPx = normalizeZero(Math.round(-offset * 14));

  return {
    offset,
    angleDeg,
    arcYPx,
    shuffleXPx,
    zIndex: clampedSlot + 1,
  };
}

export function createCardFlipPlan({
  eligibleCount,
  requestedSlotIndex,
  random = Math.random,
}: CreateCardFlipPlanOptions): CardFlipPlan {
  const cardCount = getMysteryCardCount(eligibleCount);
  if (cardCount === 0) {
    return {
      cardCount: 0,
      chosenSlotIndex: 0,
      isDirectPick: requestedSlotIndex !== undefined,
      shuffleDurationMs: 0,
      flipDurationMs: 0,
      totalDurationMs: 0,
    };
  }

  const isDirectPick = requestedSlotIndex !== undefined;
  const chosenSlotIndex = isDirectPick
    ? Math.min(
        cardCount - 1,
        Math.max(
          0,
          Math.floor(
            Number.isFinite(requestedSlotIndex) ? requestedSlotIndex : 0,
          ),
        ),
      )
    : Math.min(cardCount - 1, Math.floor(random() * cardCount));

  const shuffleDurationMs =
    !isDirectPick && cardCount > 1 ? CARD_FLIP_SHUFFLE_DURATION_MS : 0;
  const flipDurationMs = CARD_FLIP_DURATION_MS;

  return {
    cardCount,
    chosenSlotIndex,
    isDirectPick,
    shuffleDurationMs,
    flipDurationMs,
    totalDurationMs: shuffleDurationMs + flipDurationMs,
  };
}

export function sampleCardFlipFrame(
  plan: CardFlipPlan,
  rawElapsedMs: number,
): CardFlipFrame {
  const elapsedMs = Math.max(0, rawElapsedMs);
  if (plan.totalDurationMs <= 0 || elapsedMs >= plan.totalDurationMs) {
    return {
      phase: "revealed",
      progress: 1,
      activeSlotIndex: plan.chosenSlotIndex,
      shuffleStep: CARD_FLIP_SHUFFLE_STEPS,
      isComplete: true,
    };
  }

  const progress = Math.min(1, elapsedMs / plan.totalDurationMs);

  if (plan.shuffleDurationMs > 0 && elapsedMs < plan.shuffleDurationMs) {
    const shuffleRatio = elapsedMs / plan.shuffleDurationMs;
    const shuffleStep = Math.min(
      CARD_FLIP_SHUFFLE_STEPS - 1,
      Math.floor(shuffleRatio * CARD_FLIP_SHUFFLE_STEPS),
    );
    const activeSlotIndex =
      plan.cardCount > 0
        ? (plan.chosenSlotIndex + shuffleStep + 1) % plan.cardCount
        : 0;
    return {
      phase: "shuffling",
      progress,
      activeSlotIndex,
      shuffleStep,
      isComplete: false,
    };
  }

  return {
    phase: "flipping",
    progress,
    activeSlotIndex: plan.chosenSlotIndex,
    shuffleStep: CARD_FLIP_SHUFFLE_STEPS,
    isComplete: false,
  };
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

  const playbackMode = options.effectiveMode;
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

  let pendingDraw: PendingPickerDraw;
  if (playbackMode === "card-flip") {
    const plan = createCardFlipPlan({
      eligibleCount: prepared.eligibleStudents.length,
      requestedSlotIndex: options.requestedSlotIndex,
      random,
    });
    pendingDraw = {
      mode: "card-flip",
      drawId: state.nextDrawId,
      winner: prepared.picked,
      pendingUsedIndices: prepared.pendingUsedIndices,
      plan,
    };
  } else {
    const plan = buildSlotReelPlan(
      prepared.eligibleStudents,
      prepared.picked,
      random,
    );
    pendingDraw = {
      mode: "slot",
      drawId: state.nextDrawId,
      winner: prepared.picked,
      pendingUsedIndices: prepared.pendingUsedIndices,
      plan,
    };
  }

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
