import { describe, expect, it } from "vitest";
import { resolveEffectiveGroupMode } from "./classroomPreferences";
import {
  filterPresentStudents,
  generateStudentGroups,
  swapGroupStudents,
} from "./classroomTools";
import {
  advanceGroupPlayback,
  CARD_FLIGHT_DURATION_MS,
  createCardDealPlan,
  createMingleClusterPlan,
  createSettledMingleLayout,
  getChipDensityTier,
  getInFlightCardSteps,
  getMingleClusterBeat,
  getRemainingDeckCount,
  getRevealedCardCount,
  getSolitaireCascadeTier,
  INITIAL_GROUP_PLAYBACK_STATE,
  isGroupCardRevealed,
  isGroupSwapAllowed,
  MAX_MINGLE_DURATION_MS,
  MIN_MINGLE_DURATION_MS,
  shouldPlayCardDealTick,
  skipGroupPlayback,
  startGroupPlayback,
} from "./groupAnimation";

function makeGroups(
  count: number,
  groupCount: number,
  random: () => number = () => 0.35,
) {
  const roster = Array.from({ length: count }, (_, i) => `Student ${i + 1}`);
  return generateStudentGroups(
    filterPresentStudents(roster, new Set()),
    { mode: "count", value: groupCount },
    random,
  );
}

describe("groupAnimation", () => {
  it("builds a round-robin card deal plan from generated groups and handles empty groups", () => {
    const present = filterPresentStudents(
      ["Ana", "Ben", "Cara", "Dan", "Eva", "Faye", "Gio"],
      new Set(),
    );
    const groups = generateStudentGroups(
      present,
      { mode: "count", value: 3 },
      () => 0.5,
    );
    expect(groups.map((g) => g.length)).toEqual([3, 2, 2]);

    const plan = createCardDealPlan(groups);
    expect(plan.totalCards).toBe(7);
    expect(plan.steps).toHaveLength(7);

    // Round-robin: row 0 across groups 0,1,2, then row 1 across groups 0,1,2, then row 2 in group 0
    expect(
      plan.steps.map((step) => [step.groupIndex, step.studentIndex]),
    ).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [0, 2],
    ]);

    expect(plan.steps.map((step) => step.dealOrder)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
    expect(plan.steps[0]?.student).toEqual(groups[0]?.[0]);
    expect(plan.steps[1]?.student).toEqual(groups[1]?.[0]);
    expect(plan.steps[6]?.student).toEqual(groups[0]?.[2]);

    // Slot lookup matrix matches step dealOrder
    expect(plan.slotDealOrders).toEqual([
      [0, 3, 6],
      [1, 4],
      [2, 5],
    ]);

    const emptyPlan = createCardDealPlan([]);
    expect(emptyPlan.totalCards).toBe(0);
    expect(emptyPlan.totalDurationMs).toBe(0);
    expect(emptyPlan.steps).toEqual([]);
    expect(emptyPlan.slotDealOrders).toEqual([]);
  });

  it("caps adaptive deal duration within 3000-4000ms across small and large Class Sections", () => {
    const smallPlan = createCardDealPlan(makeGroups(7, 3, () => 0.25));
    const mediumPlan = createCardDealPlan(makeGroups(25, 5, () => 0.25));
    const large45Plan = createCardDealPlan(makeGroups(45, 9, () => 0.25));
    const large50Plan = createCardDealPlan(makeGroups(50, 10, () => 0.25));
    const hugePlan = createCardDealPlan(makeGroups(80, 10, () => 0.25));

    for (const plan of [smallPlan, mediumPlan, large45Plan, large50Plan, hugePlan]) {
      expect(plan.totalDurationMs).toBeGreaterThanOrEqual(3000);
      expect(plan.totalDurationMs).toBeLessThanOrEqual(4000);
      expect(plan.steps[0]!.revealAtMs).toBeGreaterThan(0);
      expect(plan.steps[plan.steps.length - 1]!.revealAtMs).toBeLessThan(
        plan.totalDurationMs,
      );
      for (let i = 1; i < plan.steps.length; i++) {
        expect(plan.steps[i]!.revealAtMs).toBeGreaterThanOrEqual(
          plan.steps[i - 1]!.revealAtMs,
        );
      }
    }

    // Large rosters deal faster per card than small rosters
    expect(large50Plan.stepIntervalMs).toBeLessThan(smallPlan.stepIntervalMs);

    // Single-student edge case uses a brief deal rather than waiting 3.0s
    const singlePlan = createCardDealPlan(makeGroups(1, 1));
    expect(singlePlan.totalCards).toBe(1);
    expect(singlePlan.totalDurationMs).toBeGreaterThan(0);
    expect(singlePlan.totalDurationMs).toBeLessThan(1000);
  });

  it("tracks revealed card counts, remaining deck counts, and throttles rapid deal audio cues", () => {
    const roster = Array.from({ length: 10 }, (_, i) => `Student ${i + 1}`);
    const groups = generateStudentGroups(
      filterPresentStudents(roster, new Set()),
      { mode: "count", value: 4 },
      () => 0.4,
    );
    const plan = createCardDealPlan(groups);

    expect(getRevealedCardCount(plan, -50)).toBe(0);
    expect(getRevealedCardCount(plan, 0)).toBe(0);
    expect(getRemainingDeckCount(plan, 0)).toBe(10);

    const fifthStepMs = plan.steps[4]!.revealAtMs;
    expect(getRevealedCardCount(plan, fifthStepMs)).toBe(5);
    expect(getRemainingDeckCount(plan, 5)).toBe(5);

    expect(getRevealedCardCount(plan, plan.totalDurationMs)).toBe(10);
    expect(getRemainingDeckCount(plan, 10)).toBe(0);
    expect(getRemainingDeckCount(plan, 99)).toBe(0);

    // First reveal always ticks; subsequent rapid reveal within minGap is throttled
    expect(shouldPlayCardDealTick(0, 1, 120, -1, 95)).toBe(true);
    expect(shouldPlayCardDealTick(1, 1, 250, 120, 95)).toBe(false);
    expect(shouldPlayCardDealTick(1, 2, 180, 120, 95)).toBe(false);
    expect(shouldPlayCardDealTick(2, 3, 215, 120, 95)).toBe(true);
  });

  it("locks swapping while dealing, reveals cards round-robin, and unlocks on completion or Skip", () => {
    const present = filterPresentStudents(
      ["Ana", "Ben", "Cara", "Dan", "Eva", "Faye", "Gio"],
      new Set(),
    );
    const groups = generateStudentGroups(
      present,
      { mode: "count", value: 3 },
      () => 0.3,
    );

    expect(INITIAL_GROUP_PLAYBACK_STATE.skipped).toBe(false);
    expect(isGroupSwapAllowed(INITIAL_GROUP_PLAYBACK_STATE, 0)).toBe(false);

    const started = startGroupPlayback(groups, "card-deal", false);
    expect(started.phase).toBe("animating");
    expect(started.skipped).toBe(false);
    expect(started.plan).not.toBeNull();
    expect(started.revealedCount).toBe(0);
    expect(isGroupSwapAllowed(started, groups.length)).toBe(false);
    expect(isGroupCardRevealed(started, 0, 0)).toBe(false);

    // Advance after first two cards deal (group 0 row 0, group 1 row 0)
    const afterTwo = advanceGroupPlayback(
      started,
      started.plan!.steps[1]!.revealAtMs,
    );
    expect(afterTwo.phase).toBe("animating");
    expect(afterTwo.skipped).toBe(false);
    expect(afterTwo.revealedCount).toBe(2);
    expect(isGroupCardRevealed(afterTwo, 0, 0)).toBe(true);
    expect(isGroupCardRevealed(afterTwo, 1, 0)).toBe(true);
    expect(isGroupCardRevealed(afterTwo, 2, 0)).toBe(false);
    expect(isGroupSwapAllowed(afterTwo, groups.length)).toBe(false);

    // Skip immediately reveals all cards and unlocks swapping
    const skipped = skipGroupPlayback(afterTwo);
    expect(skipped.phase).toBe("settled");
    expect(skipped.skipped).toBe(true);
    expect(skipped.revealedCount).toBe(7);
    expect(getRemainingDeckCount(skipped.plan!, skipped.revealedCount)).toBe(0);
    expect(isGroupCardRevealed(skipped, 0, 2)).toBe(true);
    expect(isGroupSwapAllowed(skipped, groups.length)).toBe(true);

    // Natural completion also settles and unlocks swapping
    const completed = advanceGroupPlayback(
      started,
      started.plan!.totalDurationMs,
    );
    expect(completed.phase).toBe("settled");
    expect(completed.skipped).toBe(false);
    expect(completed.revealedCount).toBe(7);
    expect(completed.elapsedMs).toBe(started.plan!.totalDurationMs);
    expect(isGroupSwapAllowed(completed, groups.length)).toBe(true);
  });

  it("exposes round-robin in-flight cards, playback elapsedMs, and Solitaire cascade density tiers", () => {
    const emptyPlan = createCardDealPlan([]);
    expect(getInFlightCardSteps(emptyPlan, 100)).toEqual([]);

    // Small 7-student class: first card flies before landing, then leaves in-flight on reveal
    const smallGroups = makeGroups(7, 3, () => 0.3);
    const smallPlan = createCardDealPlan(smallGroups);
    const firstStep = smallPlan.steps[0]!;
    const firstLaunchMs = Math.max(0, firstStep.revealAtMs - CARD_FLIGHT_DURATION_MS);

    expect(getInFlightCardSteps(smallPlan, -10)).toEqual([]);
    const midFirstFlightMs = Math.round((firstLaunchMs + firstStep.revealAtMs) / 2);
    const firstFlight = getInFlightCardSteps(smallPlan, midFirstFlightMs);
    expect(firstFlight.length).toBeGreaterThanOrEqual(1);
    expect(firstFlight[0]?.step.dealOrder).toBe(0);
    expect(firstFlight[0]?.step.groupIndex).toBe(0);
    expect(firstFlight[0]?.step.studentIndex).toBe(0);
    expect(firstFlight[0]?.progress).toBeGreaterThan(0);
    expect(firstFlight[0]?.progress).toBeLessThan(1);

    // At landing time, card 0 is revealed and no longer in-flight
    const atFirstReveal = getInFlightCardSteps(smallPlan, firstStep.revealAtMs);
    expect(atFirstReveal.some((item) => item.step.dealOrder === 0)).toBe(false);
    expect(getRevealedCardCount(smallPlan, firstStep.revealAtMs)).toBe(1);

    // After totalDurationMs, zero cards remain in flight
    expect(getInFlightCardSteps(smallPlan, smallPlan.totalDurationMs)).toEqual([]);

    // Large 45-student class has multiple concurrent round-robin cards in flight mid-deal
    const largePlan = createCardDealPlan(makeGroups(45, 9));
    const midLargeMs = Math.round(largePlan.totalDurationMs * 0.5);
    const concurrentFlights = getInFlightCardSteps(largePlan, midLargeMs);
    expect(concurrentFlights.length).toBeGreaterThan(1);
    for (let i = 1; i < concurrentFlights.length; i++) {
      expect(concurrentFlights[i]!.step.dealOrder).toBeGreaterThan(
        concurrentFlights[i - 1]!.step.dealOrder,
      );
      expect(concurrentFlights[i]!.progress).toBeGreaterThanOrEqual(0);
      expect(concurrentFlights[i]!.progress).toBeLessThan(1);
    }
    const revealedMid = getRevealedCardCount(largePlan, midLargeMs);
    expect(revealedMid + concurrentFlights.length).toBeLessThanOrEqual(
      largePlan.totalCards,
    );
    expect(
      getRemainingDeckCount(largePlan, revealedMid + concurrentFlights.length),
    ).toBe(largePlan.totalCards - revealedMid - concurrentFlights.length);

    // Single-student edge case visibly flies before landing
    const singlePlan = createCardDealPlan(makeGroups(1, 1));
    const singleMidMs = Math.max(1, singlePlan.steps[0]!.revealAtMs - 100);
    const singleFlight = getInFlightCardSteps(singlePlan, singleMidMs);
    expect(singleFlight).toHaveLength(1);
    expect(singleFlight[0]?.progress).toBeGreaterThan(0);
    expect(singleFlight[0]?.progress).toBeLessThan(1);

    // GroupPlaybackState tracks elapsedMs cleanly through start, advance, and skip
    expect(INITIAL_GROUP_PLAYBACK_STATE.elapsedMs).toBe(0);
    const started = startGroupPlayback(smallGroups, "card-deal", false);
    expect(started.elapsedMs).toBe(0);
    const midState = advanceGroupPlayback(started, midFirstFlightMs);
    expect(midState.phase).toBe("animating");
    expect(midState.elapsedMs).toBe(midFirstFlightMs);
    const skipped = skipGroupPlayback(midState);
    expect(skipped.phase).toBe("settled");
    expect(skipped.elapsedMs).toBe(started.plan!.totalDurationMs);

    // Solitaire cascade density tightens for mid-size and large (35-50 student) rosters
    expect(getSolitaireCascadeTier(7, 3)).toBe("comfortable");
    expect(getSolitaireCascadeTier(24, 5)).toBe("standard");
    expect(getSolitaireCascadeTier(14, 7)).toBe("standard");
    expect(getSolitaireCascadeTier(35, 5)).toBe("compact");
    expect(getSolitaireCascadeTier(50, 5)).toBe("compact");
    expect(getSolitaireCascadeTier(18, 9)).toBe("compact");
  });

  it("resolves Card Deal, Group Yourselves, and Instant modes and falls back to instant under reduced motion", () => {
    expect(resolveEffectiveGroupMode("card-deal", false)).toBe("card-deal");
    expect(resolveEffectiveGroupMode("group-yourselves", false)).toBe(
      "group-yourselves",
    );
    expect(resolveEffectiveGroupMode("instant", false)).toBe("instant");
    expect(resolveEffectiveGroupMode("card-deal", true)).toBe("instant");
    expect(resolveEffectiveGroupMode("group-yourselves", true)).toBe("instant");

    const present = filterPresentStudents(
      ["Ana", "Ben", "Cara", "Dan"],
      new Set(),
    );
    const groups = generateStudentGroups(
      present,
      { mode: "count", value: 2 },
      () => 0.1,
    );

    const instantState = startGroupPlayback(groups, "instant", false);
    expect(instantState.phase).toBe("settled");
    expect(instantState.plan).toBeNull();
    expect(instantState.revealedCount).toBe(4);
    expect(isGroupSwapAllowed(instantState, groups.length)).toBe(true);
    expect(isGroupCardRevealed(instantState, 1, 1)).toBe(true);

    const reducedCardDealState = startGroupPlayback(groups, "card-deal", true);
    expect(reducedCardDealState.phase).toBe("settled");
    expect(reducedCardDealState.plan).toBeNull();
    expect(isGroupSwapAllowed(reducedCardDealState, groups.length)).toBe(true);

    const reducedMingleState = startGroupPlayback(
      groups,
      "group-yourselves",
      true,
    );
    expect(reducedMingleState.phase).toBe("settled");
    expect(reducedMingleState.plan).toBeNull();
    expect(isGroupSwapAllowed(reducedMingleState, groups.length)).toBe(true);

    // Empty groups stay idle
    expect(startGroupPlayback([], "card-deal", false)).toEqual(
      INITIAL_GROUP_PLAYBACK_STATE,
    );
    expect(startGroupPlayback([], "group-yourselves", false)).toEqual(
      INITIAL_GROUP_PLAYBACK_STATE,
    );
  });

  it("builds a mingle-to-cluster plan with scattered floor coordinates, zone targets, density tiers, and adaptive 5500-6500ms timing", () => {
    expect(MIN_MINGLE_DURATION_MS).toBe(5500);
    expect(MAX_MINGLE_DURATION_MS).toBe(6500);
    expect(getChipDensityTier(7)).toBe("comfortable");
    expect(getChipDensityTier(16)).toBe("comfortable");
    expect(getChipDensityTier(17)).toBe("standard");
    expect(getChipDensityTier(32)).toBe("standard");
    expect(getChipDensityTier(33)).toBe("compact");
    expect(getChipDensityTier(50)).toBe("compact");

    const emptyPlan = createMingleClusterPlan([]);
    expect(emptyPlan.totalStudents).toBe(0);
    expect(emptyPlan.totalDurationMs).toBe(0);
    expect(emptyPlan.chips).toEqual([]);
    expect(emptyPlan.zones).toEqual([]);

    const makeDeterministicRandom = () => {
      let seed = 17;
      return () => {
        seed = (seed * 1103515245 + 12345) % 0x80000000;
        return seed / 0x80000000;
      };
    };

    const smallGroups = makeGroups(7, 3);
    const smallPlan = createMingleClusterPlan(
      smallGroups,
      makeDeterministicRandom(),
    );
    expect(smallPlan.totalStudents).toBe(7);
    expect(smallPlan.groupCount).toBe(3);
    expect(smallPlan.densityTier).toBe("comfortable");
    expect(smallPlan.zones).toHaveLength(3);
    expect(smallPlan.chips).toHaveLength(7);

    // Every student appears once with valid mingle positions and target inside its assigned zone
    const seenIndices = new Set<number>();
    const mingleKeys = new Set<string>();
    for (const chip of smallPlan.chips) {
      expect(seenIndices.has(chip.student.index)).toBe(false);
      seenIndices.add(chip.student.index);
      expect(smallGroups[chip.groupIndex]?.[chip.studentIndex]).toEqual(
        chip.student,
      );

      expect(chip.mingleX).toBeGreaterThanOrEqual(8);
      expect(chip.mingleX).toBeLessThanOrEqual(92);
      expect(chip.mingleY).toBeGreaterThanOrEqual(10);
      expect(chip.mingleY).toBeLessThanOrEqual(90);
      mingleKeys.add(`${Math.round(chip.mingleX)},${Math.round(chip.mingleY)}`);

      expect(Math.hypot(chip.driftX, chip.driftY)).toBeGreaterThan(0);
      expect(Math.hypot(chip.driftX, chip.driftY)).toBeLessThanOrEqual(18);

      const zone = smallPlan.zones[chip.groupIndex]!;
      expect(chip.targetX).toBeGreaterThanOrEqual(zone.leftPct);
      expect(chip.targetX).toBeLessThanOrEqual(zone.leftPct + zone.widthPct);
      expect(chip.targetY).toBeGreaterThanOrEqual(zone.topPct);
      expect(chip.targetY).toBeLessThanOrEqual(zone.topPct + zone.heightPct);
    }
    expect(mingleKeys.size).toBe(7);

    // Adaptive timing across small (~7) and large (~45-50, 80) Class Sections stays within 5500-6500ms (~2.5s mingle + ~3.0-4.0s cluster)
    const mediumPlan = createMingleClusterPlan(
      makeGroups(25, 5),
      makeDeterministicRandom(),
    );
    const large45Plan = createMingleClusterPlan(
      makeGroups(45, 9),
      makeDeterministicRandom(),
    );
    const large50Plan = createMingleClusterPlan(
      makeGroups(50, 10),
      makeDeterministicRandom(),
    );
    const hugePlan = createMingleClusterPlan(
      makeGroups(80, 10),
      makeDeterministicRandom(),
    );

    expect(mediumPlan.densityTier).toBe("standard");
    expect(large45Plan.densityTier).toBe("compact");
    expect(large50Plan.densityTier).toBe("compact");
    expect(large50Plan.chips).toHaveLength(50);

    for (const plan of [
      smallPlan,
      mediumPlan,
      large45Plan,
      large50Plan,
      hugePlan,
    ]) {
      expect(plan.totalDurationMs).toBeGreaterThanOrEqual(5500);
      expect(plan.totalDurationMs).toBeLessThanOrEqual(6500);
      expect(plan.mingleDurationMs).toBeGreaterThanOrEqual(2400);
      expect(plan.mingleDurationMs).toBeLessThanOrEqual(2600);
      expect(plan.clusterDurationMs).toBeGreaterThanOrEqual(3000);
      expect(plan.clusterDurationMs).toBeLessThanOrEqual(4000);
      expect(plan.mingleDurationMs + plan.clusterDurationMs).toBe(
        plan.totalDurationMs,
      );
      for (const chip of plan.chips) {
        const zone = plan.zones[chip.groupIndex]!;
        expect(chip.targetX).toBeGreaterThanOrEqual(zone.leftPct);
        expect(chip.targetX).toBeLessThanOrEqual(zone.leftPct + zone.widthPct);
        expect(chip.targetY).toBeGreaterThanOrEqual(zone.topPct);
        expect(chip.targetY).toBeLessThanOrEqual(zone.topPct + zone.heightPct);
      }
    }

    // Single-student edge case uses a brief ~600ms reveal
    const singlePlan = createMingleClusterPlan(
      makeGroups(1, 1),
      makeDeterministicRandom(),
    );
    expect(singlePlan.totalStudents).toBe(1);
    expect(singlePlan.totalDurationMs).toBeGreaterThan(0);
    expect(singlePlan.totalDurationMs).toBeLessThan(1000);
    expect(singlePlan.mingleDurationMs + singlePlan.clusterDurationMs).toBe(
      singlePlan.totalDurationMs,
    );
  });

  it("drives Group Yourselves through Mingle -> Cluster -> Settled with swap locking and Skip", () => {
    const present = filterPresentStudents(
      ["Ana", "Ben", "Cara", "Dan", "Eva", "Faye", "Gio"],
      new Set(),
    );
    const groups = generateStudentGroups(
      present,
      { mode: "count", value: 3 },
      () => 0.4,
    );

    const started = startGroupPlayback(
      groups,
      "group-yourselves",
      false,
      () => 0.42,
    );
    expect(started.phase).toBe("animating");
    expect(started.mode).toBe("group-yourselves");
    expect(started.skipped).toBe(false);
    expect(started.plan).toBeNull();
    expect(started.minglePlan).not.toBeNull();
    expect(started.mingleBeat).toBe("mingle");
    expect(isGroupSwapAllowed(started, groups.length)).toBe(false);

    const minglePlan = started.minglePlan!;
    expect(getMingleClusterBeat(minglePlan, -10)).toBe("mingle");
    expect(getMingleClusterBeat(minglePlan, 0)).toBe("mingle");
    expect(getMingleClusterBeat(minglePlan, minglePlan.mingleDurationMs - 1)).toBe(
      "mingle",
    );
    expect(getMingleClusterBeat(minglePlan, minglePlan.mingleDurationMs)).toBe(
      "cluster",
    );

    const midMingle = advanceGroupPlayback(
      started,
      minglePlan.mingleDurationMs - 50,
    );
    expect(midMingle.phase).toBe("animating");
    expect(midMingle.skipped).toBe(false);
    expect(midMingle.mingleBeat).toBe("mingle");
    expect(isGroupSwapAllowed(midMingle, groups.length)).toBe(false);

    // Skip mid-mingle settles immediately and unlocks swapping
    const skippedFromMingle = skipGroupPlayback(midMingle);
    expect(skippedFromMingle.phase).toBe("settled");
    expect(skippedFromMingle.skipped).toBe(true);
    expect(skippedFromMingle.mingleBeat).toBe("cluster");
    expect(skippedFromMingle.revealedCount).toBe(7);
    expect(isGroupSwapAllowed(skippedFromMingle, groups.length)).toBe(true);

    // Beat transition to Cluster keeps swap locked until settle
    const inCluster = advanceGroupPlayback(
      midMingle,
      minglePlan.mingleDurationMs,
    );
    expect(inCluster.phase).toBe("animating");
    expect(inCluster.skipped).toBe(false);
    expect(inCluster.mingleBeat).toBe("cluster");
    expect(isGroupSwapAllowed(inCluster, groups.length)).toBe(false);

    // Skip mid-cluster settles immediately and unlocks swapping
    const skippedFromCluster = skipGroupPlayback(inCluster);
    expect(skippedFromCluster.phase).toBe("settled");
    expect(skippedFromCluster.skipped).toBe(true);
    expect(skippedFromCluster.revealedCount).toBe(7);
    expect(isGroupSwapAllowed(skippedFromCluster, groups.length)).toBe(true);

    // Natural completion settles and unlocks swapping
    const settled = advanceGroupPlayback(inCluster, minglePlan.totalDurationMs);
    expect(settled.phase).toBe("settled");
    expect(settled.skipped).toBe(false);
    expect(settled.mingleBeat).toBe("cluster");
    expect(settled.revealedCount).toBe(7);
    expect(isGroupSwapAllowed(settled, groups.length)).toBe(true);
    expect(advanceGroupPlayback(settled, minglePlan.totalDurationMs + 500)).toBe(
      settled,
    );
    expect(skipGroupPlayback(settled)).toBe(settled);
  });

  it("deterministically computes settled dot zones and updates coordinates live after manual swaps", () => {
    const emptyLayout = createSettledMingleLayout([]);
    expect(emptyLayout).toEqual({
      chips: [],
      zones: [],
      totalStudents: 0,
      groupCount: 0,
      zoneCols: 0,
      zoneRows: 0,
      densityTier: "comfortable",
    });

    const groups = makeGroups(9, 3);
    const first = createSettledMingleLayout(groups);
    const second = createSettledMingleLayout(groups);
    expect(first).toEqual(second);

    // Settled layout zones and target coordinates align with the animated cluster plan
    const animatedPlan = createMingleClusterPlan(groups, () => 0.42);
    expect(first.zones).toEqual(animatedPlan.zones);
    expect(first.chips.map((c) => [c.student.index, c.targetX, c.targetY])).toEqual(
      animatedPlan.chips.map((c) => [c.student.index, c.targetX, c.targetY]),
    );

    // Containment and coordinate uniqueness across small, single-group 50, and 10-group 50 rosters
    for (const sampleGroups of [
      groups,
      makeGroups(50, 1),
      makeGroups(50, 10),
    ]) {
      const layout = createSettledMingleLayout(sampleGroups);
      const expectedTotal = sampleGroups.reduce((sum, g) => sum + g.length, 0);
      expect(layout.totalStudents).toBe(expectedTotal);
      expect(layout.groupCount).toBe(sampleGroups.length);
      expect(layout.chips).toHaveLength(expectedTotal);

      const seenStudents = new Set<number>();
      const seenCoords = new Set<string>();
      for (const chip of layout.chips) {
        expect(seenStudents.has(chip.student.index)).toBe(false);
        seenStudents.add(chip.student.index);

        const zone = layout.zones[chip.groupIndex]!;
        expect(chip.targetX).toBeGreaterThan(zone.leftPct);
        expect(chip.targetX).toBeLessThan(zone.leftPct + zone.widthPct);
        expect(chip.targetY).toBeGreaterThan(zone.topPct);
        expect(chip.targetY).toBeLessThan(zone.topPct + zone.heightPct);

        const coordKey = `${chip.targetX},${chip.targetY}`;
        expect(seenCoords.has(coordKey)).toBe(false);
        seenCoords.add(coordKey);
      }
    }

    // Swapping two students across groups immediately moves their dots between group containers
    const studentA = groups[0]![0]!;
    const studentB = groups[2]![1]!;
    const swappedGroups = swapGroupStudents(
      groups,
      { groupIndex: 0, studentIndex: 0 },
      { groupIndex: 2, studentIndex: 1 },
    );
    const swappedLayout = createSettledMingleLayout(swappedGroups);

    const movedA = swappedLayout.chips.find(
      (chip) => chip.student.index === studentA.index,
    )!;
    const movedB = swappedLayout.chips.find(
      (chip) => chip.student.index === studentB.index,
    )!;
    expect(movedA.groupIndex).toBe(2);
    expect(movedA.studentIndex).toBe(1);
    expect(movedB.groupIndex).toBe(0);
    expect(movedB.studentIndex).toBe(0);

    const zone0 = swappedLayout.zones[0]!;
    const zone2 = swappedLayout.zones[2]!;
    expect(movedA.targetX).toBeGreaterThan(zone2.leftPct);
    expect(movedA.targetX).toBeLessThan(zone2.leftPct + zone2.widthPct);
    expect(movedA.targetY).toBeGreaterThan(zone2.topPct);
    expect(movedA.targetY).toBeLessThan(zone2.topPct + zone2.heightPct);

    expect(movedB.targetX).toBeGreaterThan(zone0.leftPct);
    expect(movedB.targetX).toBeLessThan(zone0.leftPct + zone0.widthPct);
    expect(movedB.targetY).toBeGreaterThan(zone0.topPct);
    expect(movedB.targetY).toBeLessThan(zone0.topPct + zone0.heightPct);
  });
});
