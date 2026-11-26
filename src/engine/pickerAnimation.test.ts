import { describe, expect, it } from "vitest";
import { resolveEffectivePickerMode } from "./classroomPreferences";
import { filterPresentStudents } from "./classroomTools";
import {
  buildSlotReelPlan,
  CARD_FLIP_AUTO_TOTAL_MS,
  commitPendingDraw,
  createCardFlipPlan,
  createInitialPickerState,
  getCardFanSlotLayout,
  getMysteryCardCount,
  isPickerLocked,
  preparePickerDraw,
  resetPickerPool,
  sampleCardFlipFrame,
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

  it("reveals immediately in Instant mode or under reduced motion, handles exhausted pools, and activates card-flip mode", () => {
    expect(resolveEffectivePickerMode("slot", false)).toBe("slot");
    expect(resolveEffectivePickerMode("card-flip", false)).toBe("card-flip");
    expect(resolveEffectivePickerMode("instant", false)).toBe("instant");

    // Mystery spread card count clamps to 0..5 based on eligible students
    expect(getMysteryCardCount(-2)).toBe(0);
    expect(getMysteryCardCount(0)).toBe(0);
    expect(getMysteryCardCount(1)).toBe(1);
    expect(getMysteryCardCount(3)).toBe(3);
    expect(getMysteryCardCount(5)).toBe(5);
    expect(getMysteryCardCount(12)).toBe(5);
    expect(getMysteryCardCount(48)).toBe(5);

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

    // Reduced motion also resolves "card-flip" -> "instant"
    const reducedCardFlipMode = resolveEffectivePickerMode("card-flip", true);
    const reducedCardFlipResult = startPickerDraw(instantResult.state, {
      presentStudents: STUDENTS,
      removeFromPool: true,
      effectiveMode: reducedCardFlipMode,
      random: () => 0,
    });
    expect(reducedCardFlipResult.outcome).toBe("instant-revealed");
    expect(isPickerLocked(reducedCardFlipResult.state)).toBe(false);
    expect(reducedCardFlipResult.state.pickedStudent).toEqual(STUDENTS[0]);
    expect(reducedCardFlipResult.state.usedIndices).toEqual(new Set([0, 1]));

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

  it("plans Card Flip auto-pick (~1.8s shuffle + 3D flip) vs direct card-slot clicks with safe slot clamping", () => {
    // Auto-pick with 10 eligible students -> 5 cards, ~1800ms total (shuffle + flip), random slot
    const autoPlan = createCardFlipPlan({
      eligibleCount: 10,
      random: () => 0.6, // floor(0.6 * 5) = 3 (Card 4)
    });
    expect(autoPlan.cardCount).toBe(5);
    expect(autoPlan.chosenSlotIndex).toBe(3);
    expect(autoPlan.isDirectPick).toBe(false);
    expect(autoPlan.shuffleDurationMs).toBeGreaterThan(0);
    expect(autoPlan.flipDurationMs).toBeGreaterThan(0);
    expect(autoPlan.totalDurationMs).toBe(CARD_FLIP_AUTO_TOTAL_MS);
    expect(autoPlan.totalDurationMs).toBeGreaterThanOrEqual(1600);
    expect(autoPlan.totalDurationMs).toBeLessThanOrEqual(2000);
    expect(autoPlan.shuffleDurationMs + autoPlan.flipDurationMs).toBe(
      autoPlan.totalDurationMs,
    );

    // Sampling frames moves deterministically: shuffling -> flipping -> revealed
    const shuffleFrame = sampleCardFlipFrame(autoPlan, 200);
    expect(shuffleFrame.phase).toBe("shuffling");
    expect(shuffleFrame.isComplete).toBe(false);
    expect(shuffleFrame.activeSlotIndex).toBeGreaterThanOrEqual(0);
    expect(shuffleFrame.activeSlotIndex).toBeLessThan(autoPlan.cardCount);

    const flipFrame = sampleCardFlipFrame(
      autoPlan,
      autoPlan.shuffleDurationMs + 100,
    );
    expect(flipFrame.phase).toBe("flipping");
    expect(flipFrame.activeSlotIndex).toBe(3);
    expect(flipFrame.isComplete).toBe(false);

    const doneFrame = sampleCardFlipFrame(autoPlan, autoPlan.totalDurationMs);
    expect(doneFrame.phase).toBe("revealed");
    expect(doneFrame.activeSlotIndex).toBe(3);
    expect(doneFrame.isComplete).toBe(true);

    // Direct card click skips shuffle and flips that exact card slot
    const directPlan = createCardFlipPlan({
      eligibleCount: 4,
      requestedSlotIndex: 2,
      random: () => 0, // ignored for slot index when requestedSlotIndex is provided
    });
    expect(directPlan.cardCount).toBe(4);
    expect(directPlan.chosenSlotIndex).toBe(2);
    expect(directPlan.isDirectPick).toBe(true);
    expect(directPlan.shuffleDurationMs).toBe(0);
    expect(directPlan.totalDurationMs).toBe(directPlan.flipDurationMs);

    const directStart = sampleCardFlipFrame(directPlan, 0);
    expect(directStart.phase).toBe("flipping");
    expect(directStart.activeSlotIndex).toBe(2);

    // Out-of-bounds requestedSlotIndex clamps safely to 0 .. cardCount - 1
    expect(
      createCardFlipPlan({ eligibleCount: 3, requestedSlotIndex: 9 })
        .chosenSlotIndex,
    ).toBe(2);
    expect(
      createCardFlipPlan({ eligibleCount: 3, requestedSlotIndex: -4 })
        .chosenSlotIndex,
    ).toBe(0);

    // Single remaining student -> 1 card, no shuffle needed
    const soloPlan = createCardFlipPlan({ eligibleCount: 1 });
    expect(soloPlan.cardCount).toBe(1);
    expect(soloPlan.chosenSlotIndex).toBe(0);
    expect(soloPlan.shuffleDurationMs).toBe(0);
    expect(soloPlan.totalDurationMs).toBe(soloPlan.flipDurationMs);
  });

  it("runs Card Flip draws with uniform pre-selection, direct slot targeting, deferred Called commit, locking, and idempotent Skip", () => {
    const initial = createInitialPickerState();

    // Direct card click on Card 3 (slotIndex 2): random() = 0.5 -> index 2 -> Cara Cruz
    const direct = startPickerDraw(initial, {
      presentStudents: STUDENTS,
      removeFromPool: true,
      effectiveMode: "card-flip",
      requestedSlotIndex: 2,
      random: () => 0.5,
    });

    expect(direct.outcome).toBe("animating");
    if (direct.outcome !== "animating") throw new Error("expected animating");
    expect(direct.pendingDraw.mode).toBe("card-flip");
    if (direct.pendingDraw.mode !== "card-flip") {
      throw new Error("expected card-flip pending draw");
    }
    expect(direct.pendingDraw.winner).toEqual(STUDENTS[2]);
    expect(direct.pendingDraw.plan.cardCount).toBe(4);
    expect(direct.pendingDraw.plan.chosenSlotIndex).toBe(2);
    expect(direct.pendingDraw.plan.isDirectPick).toBe(true);
    expect(isPickerLocked(direct.state)).toBe(true);
    // Deferred commit: Called status must NOT update before reveal
    expect(direct.state.usedIndices.size).toBe(0);
    expect(direct.state.pickedStudent).toBeNull();

    // Clicking another card or Pick while animating must be ignored without double-drawing
    const blockedClick = startPickerDraw(direct.state, {
      presentStudents: STUDENTS,
      removeFromPool: true,
      effectiveMode: "card-flip",
      requestedSlotIndex: 0,
      random: () => 0,
    });
    expect(blockedClick.outcome).toBe("ignored-locked");
    expect(blockedClick.state).toBe(direct.state);

    // Skip commits Called exactly once and unlocks
    const skipped = commitPendingDraw(direct.state);
    expect(skipped.committed).toBe(true);
    expect(skipped.winner).toEqual(STUDENTS[2]);
    expect(isPickerLocked(skipped.state)).toBe(false);
    expect(skipped.state.pickedStudent).toEqual(STUDENTS[2]);
    expect(skipped.state.usedIndices).toEqual(new Set([2]));

    // Duplicate commit after Skip is a no-op
    const duplicate = commitPendingDraw(
      skipped.state,
      direct.pendingDraw.drawId,
    );
    expect(duplicate.committed).toBe(false);
    expect(duplicate.state.usedIndices).toEqual(new Set([2]));

    // Next auto-pick in card-flip mode sees 3 remaining eligible students -> 3 mystery cards
    const seq = [0, 0.7]; // draw idx 0 (Ana Santos), slot floor(0.7 * 3) = 2 (Card 3)
    let call = 0;
    const autoPick = startPickerDraw(skipped.state, {
      presentStudents: STUDENTS,
      removeFromPool: true,
      effectiveMode: "card-flip",
      random: () => seq[call++] ?? 0,
    });
    expect(autoPick.outcome).toBe("animating");
    if (autoPick.outcome !== "animating") throw new Error("expected animating");
    expect(autoPick.pendingDraw.mode).toBe("card-flip");
    if (autoPick.pendingDraw.mode !== "card-flip") {
      throw new Error("expected card-flip pending draw");
    }
    expect(autoPick.pendingDraw.winner).toEqual(STUDENTS[0]);
    expect(autoPick.pendingDraw.plan.cardCount).toBe(3);
    expect(autoPick.pendingDraw.plan.chosenSlotIndex).toBe(2);
    expect(autoPick.pendingDraw.plan.isDirectPick).toBe(false);
    expect(autoPick.pendingDraw.plan.totalDurationMs).toBe(
      CARD_FLIP_AUTO_TOTAL_MS,
    );

    const committedAuto = commitPendingDraw(
      autoPick.state,
      autoPick.pendingDraw.drawId,
    );
    expect(committedAuto.committed).toBe(true);
    expect(committedAuto.state.usedIndices).toEqual(new Set([0, 2]));
  });

  it("keeps mystery card counts and direct-slot plans exact across 5 -> 4 -> 3 -> 2 -> 1 -> 0 draws", () => {
    const fiveStudents = filterPresentStudents(
      ["Ana", "Ben", "Cara", "Diego", "Elena"],
      new Set(),
    );
    let state = createInitialPickerState();

    for (let remaining = 5; remaining >= 1; remaining--) {
      expect(getMysteryCardCount(remaining)).toBe(remaining);

      // Every valid slot 0..remaining-1 in createCardFlipPlan targets itself without clamping drift
      for (let slot = 0; slot < remaining; slot++) {
        const plan = createCardFlipPlan({
          eligibleCount: remaining,
          requestedSlotIndex: slot,
        });
        expect(plan.cardCount).toBe(remaining);
        expect(plan.chosenSlotIndex).toBe(slot);
      }

      // Click the last visible card slot (remaining - 1) and commit
      const lastSlot = remaining - 1;
      const started = startPickerDraw(state, {
        presentStudents: fiveStudents,
        removeFromPool: true,
        effectiveMode: "card-flip",
        requestedSlotIndex: lastSlot,
        random: () => 0,
      });
      expect(started.outcome).toBe("animating");
      if (started.outcome !== "animating") throw new Error("expected animating");
      if (started.pendingDraw.mode !== "card-flip") {
        throw new Error("expected card-flip pending draw");
      }
      expect(started.pendingDraw.plan.cardCount).toBe(remaining);
      expect(started.pendingDraw.plan.chosenSlotIndex).toBe(lastSlot);

      const committed = commitPendingDraw(
        started.state,
        started.pendingDraw.drawId,
      );
      expect(committed.committed).toBe(true);
      state = committed.state;
      expect(getMysteryCardCount(fiveStudents.length - state.usedIndices.size)).toBe(
        remaining - 1,
      );
    }

    expect(getMysteryCardCount(0)).toBe(0);
    const exhausted = startPickerDraw(state, {
      presentStudents: fiveStudents,
      removeFromPool: true,
      effectiveMode: "card-flip",
    });
    expect(exhausted.outcome).toBe("exhausted");
    expect(exhausted.state.poolExhausted).toBe(true);
  });

  it("computes symmetric curved magician's-hand fan geometry with ascending stacking order across 1..5 cards", () => {
    // 1 card: centered upright with no arc drop
    expect(getCardFanSlotLayout(0, 1)).toEqual({
      offset: 0,
      angleDeg: 0,
      arcYPx: 0,
      shuffleXPx: 0,
      zIndex: 1,
    });

    // 5 cards: full curved fan (-22deg..+22deg), parabolic arc drop, ascending z-index 1..5
    const five = Array.from({ length: 5 }, (_, i) => getCardFanSlotLayout(i, 5));
    expect(five.map((slot) => slot.angleDeg)).toEqual([-22, -11, 0, 11, 22]);
    expect(five.map((slot) => slot.zIndex)).toEqual([1, 2, 3, 4, 5]);
    expect(five[2]!.arcYPx).toBe(0);
    expect(five[1]!.arcYPx).toBeGreaterThan(five[2]!.arcYPx);
    expect(five[0]!.arcYPx).toBeGreaterThan(five[1]!.arcYPx);
    expect(five[0]!.arcYPx).toBe(five[4]!.arcYPx);
    expect(five[1]!.arcYPx).toBe(five[3]!.arcYPx);
    expect(five[0]!.shuffleXPx).toBeGreaterThan(0);
    expect(five[2]!.shuffleXPx).toBe(0);
    expect(five[4]!.shuffleXPx).toBe(-five[0]!.shuffleXPx);

    // 2..4 cards: gracefully narrower symmetric arcs with ascending stacking order
    for (const count of [2, 3, 4]) {
      const fan = Array.from({ length: count }, (_, i) =>
        getCardFanSlotLayout(i, count),
      );
      expect(fan.map((slot) => slot.zIndex)).toEqual(
        Array.from({ length: count }, (_, i) => i + 1),
      );
      for (let i = 0; i < count; i++) {
        const mirror = count - 1 - i;
        expect(fan[i]!.angleDeg + fan[mirror]!.angleDeg).toBe(0);
        expect(fan[i]!.arcYPx).toBe(fan[mirror]!.arcYPx);
        if (i > 0) {
          expect(fan[i]!.angleDeg).toBeGreaterThan(fan[i - 1]!.angleDeg);
        }
      }
      expect(Math.abs(fan[0]!.angleDeg)).toBeLessThan(22);
    }

    // Safe clamping for 0 cards and out-of-range indices
    expect(getCardFanSlotLayout(0, 0)).toEqual({
      offset: 0,
      angleDeg: 0,
      arcYPx: 0,
      shuffleXPx: 0,
      zIndex: 1,
    });
    expect(getCardFanSlotLayout(-3, 4)).toEqual(getCardFanSlotLayout(0, 4));
    expect(getCardFanSlotLayout(9, 4)).toEqual(getCardFanSlotLayout(3, 4));
    expect(getCardFanSlotLayout(4, 12)).toEqual(getCardFanSlotLayout(4, 5));
  });
});
