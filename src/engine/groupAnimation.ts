import {
  resolveEffectiveGroupMode,
  type GroupAnimationMode,
} from "./classroomPreferences";
import type { RosterStudent } from "./classroomTools";

export type ActiveGroupAnimationMode = "card-deal" | "instant";

export interface GroupPlaybackState {
  phase: "idle" | "animating" | "settled";
  plan: CardDealPlan | null;
  revealedCount: number;
}

export const INITIAL_GROUP_PLAYBACK_STATE: Readonly<GroupPlaybackState> = {
  phase: "idle",
  plan: null,
  revealedCount: 0,
};

export interface CardDealStep {
  groupIndex: number;
  studentIndex: number;
  student: RosterStudent;
  dealOrder: number;
  revealAtMs: number;
}

export interface CardDealPlan {
  steps: readonly CardDealStep[];
  slotDealOrders: readonly (readonly number[])[];
  totalCards: number;
  totalDurationMs: number;
  stepIntervalMs: number;
}

export const MIN_CARD_DEAL_DURATION_MS = 2500;
export const MAX_CARD_DEAL_DURATION_MS = 3500;
const SINGLE_CARD_DURATION_MS = 600;
const INITIAL_DEAL_DELAY_MS = 120;
const CARD_SETTLE_MS = 240;

function computeAdaptiveDurationMs(totalCards: number): number {
  if (totalCards <= 0) return 0;
  if (totalCards === 1) return SINGLE_CARD_DURATION_MS;
  return Math.max(
    MIN_CARD_DEAL_DURATION_MS,
    Math.min(MAX_CARD_DEAL_DURATION_MS - 100, 2400 + totalCards * 22),
  );
}

/** Builds a round-robin Card Deal sequence across groups with adaptive pacing. */
export function createCardDealPlan(
  groups: readonly (readonly RosterStudent[])[],
): CardDealPlan {
  const maxGroupSize = groups.reduce(
    (max, group) => Math.max(max, group.length),
    0,
  );
  if (maxGroupSize === 0) {
    return {
      steps: [],
      slotDealOrders: [],
      totalCards: 0,
      totalDurationMs: 0,
      stepIntervalMs: 0,
    };
  }

  const orderedEntries: Array<{
    groupIndex: number;
    studentIndex: number;
    student: RosterStudent;
  }> = [];

  for (let studentIndex = 0; studentIndex < maxGroupSize; studentIndex++) {
    for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
      const student = groups[groupIndex]?.[studentIndex];
      if (student) {
        orderedEntries.push({ groupIndex, studentIndex, student });
      }
    }
  }

  const totalCards = orderedEntries.length;
  const totalDurationMs = computeAdaptiveDurationMs(totalCards);
  const lastRevealAtMs = Math.max(
    INITIAL_DEAL_DELAY_MS,
    totalDurationMs - CARD_SETTLE_MS,
  );
  const stepIntervalMs =
    totalCards > 1
      ? (lastRevealAtMs - INITIAL_DEAL_DELAY_MS) / (totalCards - 1)
      : 0;

  const slotDealOrders: number[][] = groups.map((group) =>
    Array.from({ length: group.length }, () => 0),
  );

  const steps: CardDealStep[] = orderedEntries.map((entry, dealOrder) => {
    slotDealOrders[entry.groupIndex]![entry.studentIndex] = dealOrder;
    return {
      ...entry,
      dealOrder,
      revealAtMs: Math.round(INITIAL_DEAL_DELAY_MS + dealOrder * stepIntervalMs),
    };
  });

  return {
    steps,
    slotDealOrders,
    totalCards,
    totalDurationMs,
    stepIntervalMs,
  };
}

/** Returns how many cards in the plan have been dealt by elapsedMs. */
export function getRevealedCardCount(
  plan: CardDealPlan,
  elapsedMs: number,
): number {
  if (plan.totalCards === 0 || elapsedMs < 0) return 0;
  if (elapsedMs >= plan.totalDurationMs) return plan.totalCards;
  let count = 0;
  for (const step of plan.steps) {
    if (step.revealAtMs <= elapsedMs) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

/** Returns how many cards still remain in the central shuffled deck. */
export function getRemainingDeckCount(
  plan: CardDealPlan,
  revealedCount: number,
): number {
  const clamped = Math.max(0, Math.min(plan.totalCards, revealedCount));
  return Math.max(0, plan.totalCards - clamped);
}

/** Throttles deal sound ticks on large rosters so audio cues stay crisp. */
export function shouldPlayCardDealTick(
  prevRevealedCount: number,
  nextRevealedCount: number,
  nowMs: number,
  lastTickAtMs: number,
  minTickGapMs = 95,
): boolean {
  if (nextRevealedCount <= prevRevealedCount) return false;
  return lastTickAtMs < 0 || nowMs - lastTickAtMs >= minTickGapMs;
}

/** Resolves the active Group Maker playback mode, falling back to Card Deal until #30 lands. */
export function resolveActiveGroupAnimationMode(
  mode: GroupAnimationMode,
  prefersReducedMotion: boolean,
): ActiveGroupAnimationMode {
  const effective = resolveEffectiveGroupMode(mode, prefersReducedMotion);
  return effective === "instant" ? "instant" : "card-deal";
}

export function startGroupPlayback(
  groups: readonly (readonly RosterStudent[])[],
  mode: GroupAnimationMode,
  prefersReducedMotion: boolean,
): GroupPlaybackState {
  const totalCards = groups.reduce((sum, group) => sum + group.length, 0);
  if (totalCards === 0) {
    return INITIAL_GROUP_PLAYBACK_STATE;
  }

  const activeMode = resolveActiveGroupAnimationMode(
    mode,
    prefersReducedMotion,
  );
  if (activeMode === "instant") {
    return {
      phase: "settled",
      plan: null,
      revealedCount: totalCards,
    };
  }

  return {
    phase: "animating",
    plan: createCardDealPlan(groups),
    revealedCount: 0,
  };
}

export function advanceGroupPlayback(
  state: GroupPlaybackState,
  elapsedMs: number,
): GroupPlaybackState {
  if (state.phase !== "animating" || !state.plan) {
    return state;
  }
  if (elapsedMs >= state.plan.totalDurationMs) {
    return {
      phase: "settled",
      plan: state.plan,
      revealedCount: state.plan.totalCards,
    };
  }
  return {
    ...state,
    revealedCount: getRevealedCardCount(state.plan, elapsedMs),
  };
}

export function skipGroupPlayback(
  state: GroupPlaybackState,
): GroupPlaybackState {
  if (state.phase !== "animating" || !state.plan) {
    return state;
  }
  return {
    phase: "settled",
    plan: state.plan,
    revealedCount: state.plan.totalCards,
  };
}

export function isGroupSwapAllowed(
  playback: GroupPlaybackState,
  groupsCount: number,
): boolean {
  return groupsCount > 0 && playback.phase !== "animating";
}

export function isGroupCardRevealed(
  playback: GroupPlaybackState,
  groupIndex: number,
  studentIndex: number,
): boolean {
  if (playback.phase !== "animating" || !playback.plan) {
    return true;
  }
  const order = playback.plan.slotDealOrders[groupIndex]?.[studentIndex];
  return order !== undefined && order < playback.revealedCount;
}
