import { describe, expect, it } from "vitest";
import { formatClock, shouldPlayTimerAlarm } from "./useClassroomTimer";

describe("useClassroomTimer helpers", () => {
  it("formats timer seconds into MM:SS", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(65)).toBe("01:05");
    expect(formatClock(-5)).toBe("00:00");
  });

  it("gates the Web Audio alarm on both Sound On/Off and prefers-reduced-motion", () => {
    expect(shouldPlayTimerAlarm(true, false)).toBe(true);
    expect(shouldPlayTimerAlarm(false, false)).toBe(false);
    expect(shouldPlayTimerAlarm(true, true)).toBe(false);
    expect(shouldPlayTimerAlarm(false, true)).toBe(false);
  });
});
