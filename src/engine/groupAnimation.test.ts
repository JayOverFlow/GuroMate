import { describe, expect, it } from "vitest";
import {
  filterPresentStudents,
  generateStudentGroups,
} from "./classroomTools";
import {
  advanceGroupPlayback,
  createCardDealPlan,
  getRemainingDeckCount,
  getRevealedCardCount,
  INITIAL_GROUP_PLAYBACK_STATE,
  isGroupCardRevealed,
  isGroupSwapAllowed,
  resolveActiveGroupAnimationMode,
  shouldPlayCardDealTick,
  skipGroupPlayback,
  startGroupPlayback,
} from "./groupAnimation";

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

  it("caps adaptive deal duration within 2500-3500ms across small and large Class Sections", () => {
    const makeGroups = (count: number, groupCount: number) => {
      const roster = Array.from({ length: count }, (_, i) => `Student ${i + 1}`);
      return generateStudentGroups(
        filterPresentStudents(roster, new Set()),
        { mode: "count", value: groupCount },
        () => 0.25,
      );
    };

    const smallPlan = createCardDealPlan(makeGroups(7, 3));
    const mediumPlan = createCardDealPlan(makeGroups(25, 5));
    const large45Plan = createCardDealPlan(makeGroups(45, 9));
    const large50Plan = createCardDealPlan(makeGroups(50, 10));
    const hugePlan = createCardDealPlan(makeGroups(80, 10));

    for (const plan of [smallPlan, mediumPlan, large45Plan, large50Plan, hugePlan]) {
      expect(plan.totalDurationMs).toBeGreaterThanOrEqual(2500);
      expect(plan.totalDurationMs).toBeLessThanOrEqual(3500);
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

    // Single-student edge case uses a brief deal rather than waiting 2.5s
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

    expect(isGroupSwapAllowed(INITIAL_GROUP_PLAYBACK_STATE, 0)).toBe(false);

    const started = startGroupPlayback(groups, "card-deal", false);
    expect(started.phase).toBe("animating");
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
    expect(afterTwo.revealedCount).toBe(2);
    expect(isGroupCardRevealed(afterTwo, 0, 0)).toBe(true);
    expect(isGroupCardRevealed(afterTwo, 1, 0)).toBe(true);
    expect(isGroupCardRevealed(afterTwo, 2, 0)).toBe(false);
    expect(isGroupSwapAllowed(afterTwo, groups.length)).toBe(false);

    // Skip immediately reveals all cards and unlocks swapping
    const skipped = skipGroupPlayback(afterTwo);
    expect(skipped.phase).toBe("settled");
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
    expect(completed.revealedCount).toBe(7);
    expect(isGroupSwapAllowed(completed, groups.length)).toBe(true);
  });

  it("falls back to instant reveal for Instant mode or reduced motion and treats group-yourselves as card-deal until #30", () => {
    expect(resolveActiveGroupAnimationMode("card-deal", false)).toBe(
      "card-deal",
    );
    expect(resolveActiveGroupAnimationMode("group-yourselves", false)).toBe(
      "card-deal",
    );
    expect(resolveActiveGroupAnimationMode("instant", false)).toBe("instant");
    expect(resolveActiveGroupAnimationMode("card-deal", true)).toBe("instant");
    expect(resolveActiveGroupAnimationMode("group-yourselves", true)).toBe(
      "instant",
    );

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

    const reducedMotionState = startGroupPlayback(groups, "card-deal", true);
    expect(reducedMotionState.phase).toBe("settled");
    expect(reducedMotionState.plan).toBeNull();
    expect(isGroupSwapAllowed(reducedMotionState, groups.length)).toBe(true);

    const fallbackModeState = startGroupPlayback(
      groups,
      "group-yourselves",
      false,
    );
    expect(fallbackModeState.phase).toBe("animating");
    expect(fallbackModeState.plan).not.toBeNull();

    // Empty groups stay idle
    expect(startGroupPlayback([], "card-deal", false)).toEqual(
      INITIAL_GROUP_PLAYBACK_STATE,
    );
  });
});
