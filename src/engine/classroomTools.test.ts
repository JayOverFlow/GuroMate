import { describe, expect, it } from "vitest";
import {
  drawRandomStudent,
  filterPresentStudents,
  generateStudentGroups,
  swapGroupStudents,
} from "./classroomTools";

describe("classroomTools", () => {
  it("filters out absent students by index while preserving roster order and handling duplicate names", () => {
    const roster = ["Ana", "Ben", "Ana", "Cara"];
    const present = filterPresentStudents(roster, new Set([0, 3]));
    expect(present).toEqual([
      { index: 1, name: "Ben" },
      { index: 2, name: "Ana" },
    ]);
  });

  it("draws without replacement until pool exhaustion, supports reset, and allows repeats when removeFromPool is false", () => {
    const present = filterPresentStudents(["Ana", "Ben", "Cara"], new Set());

    // Deterministic RNG picking index 0 of remaining candidates each time.
    const first = drawRandomStudent(present, new Set(), true, () => 0);
    expect(first.picked).toEqual({ index: 0, name: "Ana" });
    expect(first.exhausted).toBe(false);
    expect(first.nextUsedIndices).toEqual(new Set([0]));

    const second = drawRandomStudent(
      present,
      first.nextUsedIndices,
      true,
      () => 0,
    );
    expect(second.picked).toEqual({ index: 1, name: "Ben" });
    expect(second.exhausted).toBe(false);

    const third = drawRandomStudent(
      present,
      second.nextUsedIndices,
      true,
      () => 0,
    );
    expect(third.picked).toEqual({ index: 2, name: "Cara" });
    expect(third.exhausted).toBe(false);
    expect(third.nextUsedIndices).toEqual(new Set([0, 1, 2]));

    // Pool exhausted
    const fourth = drawRandomStudent(
      present,
      third.nextUsedIndices,
      true,
      () => 0,
    );
    expect(fourth.picked).toBeNull();
    expect(fourth.exhausted).toBe(true);

    // With replacement (removeFromPool = false) never exhausts non-empty pool
    const repeatDraw = drawRandomStudent(present, new Set(), false, () => 0);
    expect(repeatDraw.picked).toEqual({ index: 0, name: "Ana" });
    expect(repeatDraw.exhausted).toBe(false);
    expect(repeatDraw.nextUsedIndices.size).toBe(0);

    // Empty present pool is always exhausted
    const emptyDraw = drawRandomStudent([], new Set(), false, () => 0);
    expect(emptyDraw.picked).toBeNull();
    expect(emptyDraw.exhausted).toBe(true);
  });

  it("partitions present students evenly by number of groups or students per group and swaps members cleanly", () => {
    const roster = Array.from({ length: 10 }, (_, i) => `Student ${i + 1}`);
    const present = filterPresentStudents(roster, new Set([0])); // 9 present

    const byCount = generateStudentGroups(
      present,
      { mode: "count", value: 4 },
      () => 0.5,
    );
    expect(byCount.map((g) => g.length)).toEqual([3, 2, 2, 2]);
    const flattenedCount = byCount.flat();
    expect(flattenedCount).toHaveLength(9);
    expect(new Set(flattenedCount.map((s) => s.index))).toEqual(
      new Set(present.map((s) => s.index)),
    );

    // Clamps when requested group count exceeds present student count
    const overCount = generateStudentGroups(present, {
      mode: "count",
      value: 20,
    });
    expect(overCount).toHaveLength(9);

    const bySize = generateStudentGroups(
      present,
      { mode: "size", value: 4 },
      () => 0.2,
    );
    expect(bySize.map((g) => g.length)).toEqual([3, 3, 3]);
    expect(bySize.every((g) => g.length <= 4)).toBe(true);
    expect(bySize.flat()).toHaveLength(9);

    const a = byCount[0]![0]!;
    const b = byCount[1]![0]!;
    const swapped = swapGroupStudents(
      byCount,
      { groupIndex: 0, studentIndex: 0 },
      { groupIndex: 1, studentIndex: 0 },
    );
    expect(swapped[0]![0]).toEqual(b);
    expect(swapped[1]![0]).toEqual(a);
    // Original unchanged
    expect(byCount[0]![0]).toEqual(a);

    expect(generateStudentGroups([], { mode: "count", value: 3 })).toEqual([]);
  });
});
