import {
  resolveEffectiveGroupMode,
  type GroupAnimationMode,
} from "./classroomPreferences";
import type { RosterStudent } from "./classroomTools";

export interface GroupPlaybackState {
  phase: "idle" | "animating" | "settled";
  mode: GroupAnimationMode | null;
  plan: CardDealPlan | null;
  minglePlan: MingleClusterPlan | null;
  mingleBeat: MingleClusterBeat | null;
  revealedCount: number;
}

export const INITIAL_GROUP_PLAYBACK_STATE: Readonly<GroupPlaybackState> = {
  phase: "idle",
  mode: null,
  plan: null,
  minglePlan: null,
  mingleBeat: null,
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

export type ChipDensityTier = "comfortable" | "standard" | "compact";
export type MingleClusterBeat = "mingle" | "cluster";

export interface MingleZoneLayout {
  groupIndex: number;
  label: string;
  studentCount: number;
  col: number;
  row: number;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
}

export interface MingleChipPlan {
  groupIndex: number;
  studentIndex: number;
  student: RosterStudent;
  mingleX: number;
  mingleY: number;
  driftX: number;
  driftY: number;
  clusterDelayMs: number;
  targetX: number;
  targetY: number;
}

export interface MingleClusterPlan {
  chips: readonly MingleChipPlan[];
  zones: readonly MingleZoneLayout[];
  totalStudents: number;
  groupCount: number;
  zoneCols: number;
  zoneRows: number;
  densityTier: ChipDensityTier;
  mingleDurationMs: number;
  clusterDurationMs: number;
  totalDurationMs: number;
}

export const MIN_CARD_DEAL_DURATION_MS = 2500;
export const MAX_CARD_DEAL_DURATION_MS = 3500;
const SINGLE_CARD_DURATION_MS = 600;
const INITIAL_DEAL_DELAY_MS = 120;
const CARD_SETTLE_MS = 240;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

/** Classifies roster size so Group Yourselves chips stay legible from ~7 to ~50 students. */
export function getChipDensityTier(totalStudents: number): ChipDensityTier {
  if (totalStudents <= 16) return "comfortable";
  if (totalStudents <= 32) return "standard";
  return "compact";
}

function computeMingleTiming(totalStudents: number): {
  mingleDurationMs: number;
  clusterDurationMs: number;
  totalDurationMs: number;
} {
  if (totalStudents <= 0) {
    return { mingleDurationMs: 0, clusterDurationMs: 0, totalDurationMs: 0 };
  }
  if (totalStudents === 1) {
    return {
      mingleDurationMs: 250,
      clusterDurationMs: SINGLE_CARD_DURATION_MS - 250,
      totalDurationMs: SINGLE_CARD_DURATION_MS,
    };
  }
  const totalDurationMs = Math.max(
    MIN_CARD_DEAL_DURATION_MS,
    Math.min(MAX_CARD_DEAL_DURATION_MS - 100, 2550 + totalStudents * 17),
  );
  const mingleDurationMs = Math.round(totalDurationMs * 0.42);
  return {
    mingleDurationMs,
    clusterDurationMs: totalDurationMs - mingleDurationMs,
    totalDurationMs,
  };
}

/** Builds a two-beat Mingle -> Cluster animation plan from generated groups. */
export function createMingleClusterPlan(
  groups: readonly (readonly RosterStudent[])[],
  random: () => number = Math.random,
): MingleClusterPlan {
  const entries: Array<{
    groupIndex: number;
    studentIndex: number;
    student: RosterStudent;
  }> = [];

  groups.forEach((group, groupIndex) => {
    group.forEach((student, studentIndex) => {
      entries.push({ groupIndex, studentIndex, student });
    });
  });

  const totalStudents = entries.length;
  const groupCount = groups.length;
  const densityTier = getChipDensityTier(totalStudents);

  if (totalStudents === 0 || groupCount === 0) {
    return {
      chips: [],
      zones: [],
      totalStudents: 0,
      groupCount: 0,
      zoneCols: 0,
      zoneRows: 0,
      densityTier,
      mingleDurationMs: 0,
      clusterDurationMs: 0,
      totalDurationMs: 0,
    };
  }

  const timing = computeMingleTiming(totalStudents);

  // Beat 2 zone grid sized cleanly for small (1-4) and large (5-12+) group counts.
  const zoneCols =
    groupCount <= 1
      ? 1
      : groupCount === 2 || groupCount === 4
        ? 2
        : groupCount <= 9
          ? 3
          : 4;
  const zoneRows = Math.ceil(groupCount / zoneCols);

  const padX = 2.5;
  const padY = 3.5;
  const gapX = 2.5;
  const gapY = 3.5;
  const widthPct = (100 - padX * 2 - gapX * (zoneCols - 1)) / zoneCols;
  const heightPct = (100 - padY * 2 - gapY * (zoneRows - 1)) / zoneRows;

  const zones: MingleZoneLayout[] = groups.map((group, groupIndex) => {
    const col = groupIndex % zoneCols;
    const row = Math.floor(groupIndex / zoneCols);
    return {
      groupIndex,
      label: `Group ${groupIndex + 1}`,
      studentCount: group.length,
      col,
      row,
      leftPct: round2(padX + col * (widthPct + gapX)),
      topPct: round2(padY + row * (heightPct + gapY)),
      widthPct: round2(widthPct),
      heightPct: round2(heightPct),
    };
  });

  // Beat 1 grid-jittered mingle floor: assign shuffled cells so groupmates start mixed and never pile up.
  const mingleCols = Math.max(1, Math.ceil(Math.sqrt(totalStudents * 1.6)));
  const mingleRows = Math.max(1, Math.ceil(totalStudents / mingleCols));
  const cellIndices = Array.from(
    { length: mingleCols * mingleRows },
    (_, i) => i,
  );
  for (let i = cellIndices.length - 1; i > 0; i--) {
    const j = Math.floor(clampUnit(random()) * (i + 1));
    const tmp = cellIndices[i]!;
    cellIndices[i] = cellIndices[j]!;
    cellIndices[j] = tmp;
  }

  const floorLeft = 10;
  const floorTop = 12;
  const cellW = 80 / mingleCols;
  const cellH = 76 / mingleRows;
  const maxDrift =
    densityTier === "compact" ? 5 : densityTier === "standard" ? 7 : 10;
  const maxDelay = Math.min(180, Math.floor(timing.clusterDurationMs * 0.15));

  const chips: MingleChipPlan[] = entries.map((entry, idx) => {
    const cell = cellIndices[idx]!;
    const mCol = cell % mingleCols;
    const mRow = Math.floor(cell / mingleCols);

    const baseX = floorLeft + (mCol + 0.5) * cellW;
    const baseY = floorTop + (mRow + 0.5) * cellH;
    const jitterX = (clampUnit(random()) - 0.5) * cellW * 0.52;
    const jitterY = (clampUnit(random()) - 0.5) * cellH * 0.52;
    const mingleX = round2(Math.max(8, Math.min(92, baseX + jitterX)));
    const mingleY = round2(Math.max(10, Math.min(90, baseY + jitterY)));

    const angle = clampUnit(random()) * Math.PI * 2;
    const driftMag = maxDrift * (0.55 + clampUnit(random()) * 0.45);
    const driftX = round2(Math.cos(angle) * driftMag);
    const driftY = round2(Math.sin(angle) * driftMag);

    const zone = zones[entry.groupIndex]!;
    const groupSize = Math.max(1, zone.studentCount);
    const subCols = groupSize <= 4 ? 1 : groupSize <= 10 ? 2 : 3;
    const subRows = Math.ceil(groupSize / subCols);
    const subCol = entry.studentIndex % subCols;
    const subRow = Math.floor(entry.studentIndex / subCols);

    const innerLeft = zone.leftPct + zone.widthPct * 0.14;
    const innerWidth = zone.widthPct * 0.72;
    const innerTop = zone.topPct + zone.heightPct * 0.3;
    const innerHeight = zone.heightPct * 0.62;

    const targetX = round2(innerLeft + ((subCol + 0.5) / subCols) * innerWidth);
    const targetY = round2(innerTop + ((subRow + 0.5) / subRows) * innerHeight);

    const rawDelay = (entry.studentIndex % 5) * 28 + (entry.groupIndex % 3) * 18;
    const clusterDelayMs = Math.min(maxDelay, rawDelay);

    return {
      ...entry,
      mingleX,
      mingleY,
      driftX,
      driftY,
      clusterDelayMs,
      targetX,
      targetY,
    };
  });

  return {
    chips,
    zones,
    totalStudents,
    groupCount,
    zoneCols,
    zoneRows,
    densityTier,
    ...timing,
  };
}

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

/** Returns which beat of Group Yourselves is active at elapsedMs. */
export function getMingleClusterBeat(
  plan: MingleClusterPlan,
  elapsedMs: number,
): MingleClusterBeat {
  return elapsedMs < plan.mingleDurationMs ? "mingle" : "cluster";
}

export function startGroupPlayback(
  groups: readonly (readonly RosterStudent[])[],
  mode: GroupAnimationMode,
  prefersReducedMotion: boolean,
  random: () => number = Math.random,
): GroupPlaybackState {
  const totalCards = groups.reduce((sum, group) => sum + group.length, 0);
  if (totalCards === 0) {
    return INITIAL_GROUP_PLAYBACK_STATE;
  }

  const activeMode = resolveEffectiveGroupMode(mode, prefersReducedMotion);
  if (activeMode === "instant") {
    return {
      phase: "settled",
      mode: "instant",
      plan: null,
      minglePlan: null,
      mingleBeat: null,
      revealedCount: totalCards,
    };
  }

  if (activeMode === "group-yourselves") {
    return {
      phase: "animating",
      mode: "group-yourselves",
      plan: null,
      minglePlan: createMingleClusterPlan(groups, random),
      mingleBeat: "mingle",
      revealedCount: 0,
    };
  }

  return {
    phase: "animating",
    mode: "card-deal",
    plan: createCardDealPlan(groups),
    minglePlan: null,
    mingleBeat: null,
    revealedCount: 0,
  };
}

export function advanceGroupPlayback(
  state: GroupPlaybackState,
  elapsedMs: number,
): GroupPlaybackState {
  if (state.phase !== "animating") {
    return state;
  }

  if (state.mode === "group-yourselves" && state.minglePlan) {
    if (elapsedMs >= state.minglePlan.totalDurationMs) {
      return {
        ...state,
        phase: "settled",
        mingleBeat: "cluster",
        revealedCount: state.minglePlan.totalStudents,
      };
    }
    const nextBeat = getMingleClusterBeat(state.minglePlan, elapsedMs);
    if (nextBeat === state.mingleBeat) {
      return state;
    }
    return {
      ...state,
      mingleBeat: nextBeat,
    };
  }

  if (!state.plan) {
    return state;
  }
  if (elapsedMs >= state.plan.totalDurationMs) {
    return {
      ...state,
      phase: "settled",
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
  if (state.phase !== "animating") {
    return state;
  }
  if (state.mode === "group-yourselves" && state.minglePlan) {
    return {
      ...state,
      phase: "settled",
      mingleBeat: "cluster",
      revealedCount: state.minglePlan.totalStudents,
    };
  }
  if (!state.plan) {
    return state;
  }
  return {
    ...state,
    phase: "settled",
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
