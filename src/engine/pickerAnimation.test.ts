import { describe, expect, it } from "vitest";
import { resolveEffectivePickerMode } from "./classroomPreferences";
import { filterPresentStudents } from "./classroomTools";
import {
  buildSlotReelPlan,
  commitPendingDraw,
  createInitialPickerState,
  isPickerLocked,
  normalizeAvailablePickerMode,
  preparePickerDraw,
  resetPickerPool,
  sampleSlotReelWindow,
  SINGLE_STUDENT_SPOTLIGHT_DURATION_MS,
  SLOT_REEL_DURATION_MS,
  startPickerDraw,
} from "./pickerAnimation";

const STUDENTS = filterPresentStudents(
  ["Ana Santos", "Ben Reyes", "Cara Cruz", "Diego Lim"],
  new Set(),
);

describe("pickerAnimation", () => {
  it("pre-selects a uniform winner without mutating current usedIndices and flags exhausted pools", () => {
    const used = new Set<number>([0]);

    // Eligible: Ben (1), Cara (2), Diego (3). random() = 0.5 -> index 1 -> Cara (2)
    const prepared = preparePickerDraw(STUDENTS, used, true, () => 0.5);

    expect(prepared.exhausted).toBe(false);
    expect(prepared.picked).toEqual({ index: 2, name: "Cara Cruz" });
    expect(prepared.eligibleStudents.map((s) => s.index)).toEqual([1, 2, 3]);
    expect(prepared.pendingUsedIndices).toEqual(new Set([0, 2]));
    // Original usedIndices must remain untouched until reveal commits
    expect(used).toEqual(new Set([0]));

    const exhausted = preparePickerDraw(
      STUDENTS,
      new Set([0, 1, 2, 3]),
      true,
      () => 0,
    );
    expect(exhausted.exhausted).toBe(true);
    expect(exhausted.picked).toBeNull();
    expect(exhausted.eligibleStudents).toEqual([]);
  });

  it("builds a ~2.6s decelerating 3-row slot reel ending on the pre-selected winner with valid prev/center/next rows", () => {
    const winner = STUDENTS[2]!;
    let seed = 0;
    const deterministicRandom = () => {
      seed = (seed + 0.37) % 1;
      return seed;
    };

    const plan = buildSlotReelPlan(STUDENTS, winner, deterministicRandom);

    expect(plan.isSingleStudentSpotlight).toBe(false);
    expect(plan.durationMs).toBe(SLOT_REEL_DURATION_MS);
    expect(plan.durationMs).toBeGreaterThanOrEqual(2400);
    expect(plan.durationMs).toBeLessThanOrEqual(2800);
    expect(plan.reelItems[plan.targetIndex]).toEqual(winner);

    const start = sampleSlotReelWindow(plan, 0);
    const mid = sampleSlotReelWindow(plan, 0.5);
    const late = sampleSlotReelWindow(plan, 0.85);
    const end = sampleSlotReelWindow(plan, 1);

    // Every multi-student window has valid prev, current, and next rows with no adjacent duplicates
    for (const frame of [start, mid, late, end]) {
      expect(frame.prev).not.toBeNull();
      expect(frame.next).not.toBeNull();
      expect(frame.prev!.index).not.toBe(frame.current.index);
      expect(frame.next!.index).not.toBe(frame.current.index);
    }

    // Decelerates: covers more steps in first half than second half
    const firstHalfSteps = mid.stepIndex - start.stepIndex;
    const secondHalfSteps = end.stepIndex - mid.stepIndex;
    expect(firstHalfSteps).toBeGreaterThan(secondHalfSteps);
    expect(mid.stepIndex).toBeLessThanOrEqual(late.stepIndex);
    expect(late.stepIndex).toBeLessThanOrEqual(end.stepIndex);

    // Exact winner lock-in at completion
    expect(end.current).toEqual(winner);
    expect(end.isComplete).toBe(true);
    expect(end.stepFraction).toBe(0);

    // Also works with just 2 eligible students
    const twoStudents = STUDENTS.slice(0, 2);
    const twoPlan = buildSlotReelPlan(twoStudents, twoStudents[1]!, () => 0.1);
    const twoEnd = sampleSlotReelWindow(twoPlan, 1);
    expect(twoPlan.isSingleStudentSpotlight).toBe(false);
    expect(twoEnd.current).toEqual(twoStudents[1]);
    expect(twoEnd.prev).toEqual(twoStudents[0]);
    expect(twoEnd.next).toEqual(twoStudents[0]);
  });

  it("uses a ~0.6s spotlight lock-in when only 1 eligible student remains", () => {
    const solo = [STUDENTS[3]!];
    const plan = buildSlotReelPlan(solo, solo[0]!);

    expect(plan.isSingleStudentSpotlight).toBe(true);
    expect(plan.durationMs).toBe(SINGLE_STUDENT_SPOTLIGHT_DURATION_MS);
    expect(plan.durationMs).toBeGreaterThanOrEqual(500);
    expect(plan.durationMs).toBeLessThanOrEqual(750);
    expect(plan.reelItems).toEqual(solo);
    expect(plan.targetIndex).toBe(0);

    const mid = sampleSlotReelWindow(plan, 0.5);
    expect(mid.current).toEqual(solo[0]);
    expect(mid.prev).toBeNull();
    expect(mid.next).toBeNull();
    expect(mid.isComplete).toBe(false);

    const end = sampleSlotReelWindow(plan, 1);
    expect(end.current).toEqual(solo[0]);
    expect(end.isComplete).toBe(true);
  });

  it("defers Called status while animating, ignores re-triggered Pick without double-drawing, and commits exactly once on Skip or completion", () => {
    const initial = createInitialPickerState();
    expect(isPickerLocked(initial)).toBe(false);

    // Start slot draw (random = 0 -> Ana Santos, index 0)
    const started = startPickerDraw(initial, {
      presentStudents: STUDENTS,
      removeFromPool: true,
      effectiveMode: "slot",
      random: () => 0,
    });

    expect(started.outcome).toBe("animating");
    expect(isPickerLocked(started.state)).toBe(true);
    expect(started.state.pendingDraw?.winner).toEqual(STUDENTS[0]);
    // Deferred commit: Called status (usedIndices) and pickedStudent must NOT update yet
    expect(started.state.usedIndices.size).toBe(0);
    expect(started.state.pickedStudent).toBeNull();

    // Re-triggering Pick mid-animation must be ignored without double-drawing
    const retriggered = startPickerDraw(started.state, {
      presentStudents: STUDENTS,
      removeFromPool: true,
      effectiveMode: "slot",
      random: () => 0.99,
    });
    expect(retriggered.outcome).toBe("ignored-locked");
    expect(retriggered.state).toBe(started.state);
    expect(retriggered.state.usedIndices.size).toBe(0);

    // Reset Pool is also ignored while animating
    expect(resetPickerPool(started.state)).toBe(started.state);

    // Stale drawId commit is ignored
    const stale = commitPendingDraw(started.state, 999);
    expect(stale.committed).toBe(false);
    expect(stale.state.usedIndices.size).toBe(0);

    // Skip (or natural completion) commits Called exactly once
    const skipped = commitPendingDraw(started.state);
    expect(skipped.committed).toBe(true);
    expect(skipped.winner).toEqual(STUDENTS[0]);
    expect(isPickerLocked(skipped.state)).toBe(false);
    expect(skipped.state.pickedStudent).toEqual(STUDENTS[0]);
    expect(skipped.state.usedIndices).toEqual(new Set([0]));

    // Duplicate commit after Skip (e.g. racing animation frame) is a no-op
    const duplicate = commitPendingDraw(
      skipped.state,
      started.state.pendingDraw?.drawId,
    );
    expect(duplicate.committed).toBe(false);
    expect(duplicate.winner).toBeNull();
    expect(duplicate.state.usedIndices).toEqual(new Set([0]));
  });

  it("reveals immediately in Instant mode or under reduced motion, handles exhausted pools, and normalizes pre-#29 card-flip mode to slot", () => {
    expect(normalizeAvailablePickerMode("slot")).toBe("slot");
    expect(normalizeAvailablePickerMode("instant")).toBe("instant");
    expect(normalizeAvailablePickerMode("card-flip")).toBe("slot");

    // Reduced motion resolves "slot" -> "instant" and reveals immediately
    const reducedMode = resolveEffectivePickerMode("slot", true);
    const instantResult = startPickerDraw(createInitialPickerState(), {
      presentStudents: STUDENTS,
      removeFromPool: true,
      effectiveMode: reducedMode,
      random: () => 0.25,
    });

    expect(instantResult.outcome).toBe("instant-revealed");
    expect(isPickerLocked(instantResult.state)).toBe(false);
    expect(instantResult.state.pickedStudent).toEqual(STUDENTS[1]);
    expect(instantResult.state.usedIndices).toEqual(new Set([1]));

    // Persisted "card-flip" without reduced motion runs as slot animation before #29 lands
    const cardFlipFallback = startPickerDraw(instantResult.state, {
      presentStudents: STUDENTS,
      removeFromPool: true,
      effectiveMode: resolveEffectivePickerMode("card-flip", false),
      random: () => 0,
    });
    expect(cardFlipFallback.outcome).toBe("animating");
    expect(isPickerLocked(cardFlipFallback.state)).toBe(true);

    // Exhausted pool transitions cleanly without starting animation
    const allUsedState = {
      ...createInitialPickerState(),
      usedIndices: new Set([0, 1, 2, 3]),
    };
    const exhaustedResult = startPickerDraw(allUsedState, {
      presentStudents: STUDENTS,
      removeFromPool: true,
      effectiveMode: "slot",
    });
    expect(exhaustedResult.outcome).toBe("exhausted");
    expect(exhaustedResult.state.poolExhausted).toBe(true);
    expect(isPickerLocked(exhaustedResult.state)).toBe(false);

    // Reset Pool clears usedIndices, pickedStudent, and poolExhausted when unlocked
    const reset = resetPickerPool(exhaustedResult.state);
    expect(reset.usedIndices.size).toBe(0);
    expect(reset.pickedStudent).toBeNull();
    expect(reset.poolExhausted).toBe(false);
  });
});
