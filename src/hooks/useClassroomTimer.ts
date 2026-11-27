import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadClassroomPreferences,
  shouldPlayClassroomCue,
} from "../engine/classroomPreferences";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

export const TIMER_PRESET_MINUTES = [1, 3, 5, 10, 15] as const;

export function shouldPlayTimerAlarm(
  soundEnabled: boolean,
  prefersReducedMotion: boolean,
): boolean {
  return shouldPlayClassroomCue({
    soundEnabled,
    prefersReducedMotion,
    isInstant: false,
  });
}

export function formatClock(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function getAudioContextConstructor(): typeof AudioContext | undefined {
  return (
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  );
}

function playAlarmChime(existingCtx?: AudioContext | null): void {
  const AudioCtx = getAudioContextConstructor();
  const ctx = existingCtx ?? (AudioCtx ? new AudioCtx() : null);
  if (!ctx) return;

  try {
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
    const notes = [880, 1046.5, 880, 1046.5];
    notes.forEach((freq, idx) => {
      const start = ctx.currentTime + idx * 0.22;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.19);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.2);
    });
  } catch {
    // Ignore blocked audio contexts.
  }
}

export interface ClassroomTimerState {
  durationSeconds: number;
  remainingSeconds: number;
  timerRunning: boolean;
  timerExpired: boolean;
  customMinutes: number;
  customSeconds: number;
  setCustomMinutes: (minutes: number) => void;
  setCustomSeconds: (seconds: number) => void;
  startTimer: () => void;
  pauseTimer: () => void;
  resetTimer: () => void;
  selectPreset: (minutes: number) => void;
  applyCustomTime: (minutesOverride?: number, secondsOverride?: number) => void;
  setSoundEnabled: (enabled: boolean) => void;
}

export function useClassroomTimer(): ClassroomTimerState {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [durationSeconds, setDurationSeconds] = useState<number>(5 * 60);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(5 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerExpired, setTimerExpired] = useState(false);
  const [customMinutes, setCustomMinutes] = useState(2);
  const [customSeconds, setCustomSeconds] = useState(30);
  const endTimeRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const soundEnabledRef = useRef<boolean>(
    loadClassroomPreferences().soundEnabled,
  );
  const prefersReducedMotionRef = useRef<boolean>(prefersReducedMotion);
  prefersReducedMotionRef.current = prefersReducedMotion;

  const setSoundEnabled = useCallback((enabled: boolean) => {
    soundEnabledRef.current = enabled;
  }, []);

  useEffect(() => {
    return () => {
      void audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!timerRunning) return;

    const tick = () => {
      if (endTimeRef.current === null) return;
      const nextRemaining = Math.max(
        0,
        Math.ceil((endTimeRef.current - Date.now()) / 1000),
      );
      setRemainingSeconds(nextRemaining);
      if (nextRemaining <= 0) {
        endTimeRef.current = null;
        setTimerRunning(false);
        setTimerExpired(true);
        if (
          shouldPlayTimerAlarm(
            soundEnabledRef.current,
            prefersReducedMotionRef.current,
          )
        ) {
          playAlarmChime(audioCtxRef.current);
        }
      }
    };

    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [timerRunning]);

  const startTimer = useCallback(() => {
    const AudioCtx = getAudioContextConstructor();
    if (!audioCtxRef.current && AudioCtx) {
      try {
        audioCtxRef.current = new AudioCtx();
      } catch {
        // Ignore.
      }
    }
    if (audioCtxRef.current?.state === "suspended") {
      void audioCtxRef.current.resume().catch(() => {});
    }

    const baseSeconds =
      remainingSeconds <= 0 ? durationSeconds : remainingSeconds;
    if (baseSeconds <= 0) return;

    setRemainingSeconds(baseSeconds);
    setTimerExpired(false);
    endTimeRef.current = Date.now() + baseSeconds * 1000;
    setTimerRunning(true);
  }, [durationSeconds, remainingSeconds]);

  const pauseTimer = useCallback(() => {
    if (endTimeRef.current !== null) {
      const nextRemaining = Math.max(
        0,
        Math.ceil((endTimeRef.current - Date.now()) / 1000),
      );
      setRemainingSeconds(nextRemaining);
    }
    endTimeRef.current = null;
    setTimerRunning(false);
  }, []);

  const resetTimer = useCallback(() => {
    endTimeRef.current = null;
    setTimerRunning(false);
    setTimerExpired(false);
    setRemainingSeconds(durationSeconds);
  }, [durationSeconds]);

  const selectPreset = useCallback((minutes: number) => {
    const total = minutes * 60;
    endTimeRef.current = null;
    setTimerRunning(false);
    setTimerExpired(false);
    setDurationSeconds(total);
    setRemainingSeconds(total);
  }, []);

  const applyCustomTime = useCallback(
    (minutesOverride?: number, secondsOverride?: number) => {
      const rawMins = minutesOverride ?? customMinutes;
      const rawSecs = secondsOverride ?? customSeconds;
      const mins = Math.max(0, Math.min(180, Math.floor(rawMins) || 0));
      const secs = Math.max(0, Math.min(59, Math.floor(rawSecs) || 0));
      const total = mins * 60 + secs;
      if (total <= 0) return;
      if (minutesOverride !== undefined) setCustomMinutes(mins);
      if (secondsOverride !== undefined) setCustomSeconds(secs);
      endTimeRef.current = null;
      setTimerRunning(false);
      setTimerExpired(false);
      setDurationSeconds(total);
      setRemainingSeconds(total);
    },
    [customMinutes, customSeconds],
  );

  return {
    durationSeconds,
    remainingSeconds,
    timerRunning,
    timerExpired,
    customMinutes,
    customSeconds,
    setCustomMinutes,
    setCustomSeconds,
    startTimer,
    pauseTimer,
    resetTimer,
    selectPreset,
    applyCustomTime,
    setSoundEnabled,
  };
}
