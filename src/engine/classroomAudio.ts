export interface ClassroomAudioPlayer {
  unlock: () => void;
  dispose: () => void;
  playReelTick: (pitchRatio?: number) => void;
  playCardFlip: () => void;
  playCardDeal: (stepRatio?: number) => void;
  playClusterCue: () => void;
  playRevealChime: () => void;
}

function getAudioContextConstructor(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  );
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

/**
 * Zero-dependency Web Audio cue player for classroom tools.
 * Mirrors useClassroomTimer: lazy AudioContext, safe resume, short envelopes,
 * and silent fallback when audio is unavailable or blocked.
 */
export function createClassroomAudioPlayer(): ClassroomAudioPlayer {
  let ctx: AudioContext | null = null;

  function ensureContext(): AudioContext | null {
    if (!ctx) {
      const AudioCtx = getAudioContextConstructor();
      if (!AudioCtx) return null;
      try {
        ctx = new AudioCtx();
      } catch {
        return null;
      }
    }
    try {
      if (ctx.state === "suspended") {
        void ctx.resume().catch(() => {});
      }
    } catch {
      return null;
    }
    return ctx;
  }

  function scheduleTone(
    audioCtx: AudioContext,
    options: {
      type: OscillatorType;
      startOffset: number;
      duration: number;
      startFreq: number;
      endFreq?: number;
      peakGain: number;
    },
  ): void {
    const start = audioCtx.currentTime + options.startOffset;
    const end = start + options.duration;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = options.type;
    osc.frequency.setValueAtTime(options.startFreq, start);
    if (options.endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, options.endFreq),
        end,
      );
    }
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.exponentialRampToValueAtTime(
      options.peakGain,
      start + Math.min(0.015, options.duration * 0.35),
    );
    gain.gain.exponentialRampToValueAtTime(0.001, end);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(start);
    osc.stop(end + 0.01);
  }

  return {
    unlock() {
      ensureContext();
    },

    dispose() {
      const active = ctx;
      ctx = null;
      if (active) {
        void active.close().catch(() => {});
      }
    },

    playReelTick(pitchRatio = 0.5) {
      const audioCtx = ensureContext();
      if (!audioCtx) return;
      try {
        const freq = 520 + clampUnit(pitchRatio) * 340;
        scheduleTone(audioCtx, {
          type: "triangle",
          startOffset: 0,
          duration: 0.035,
          startFreq: freq,
          endFreq: freq * 0.85,
          peakGain: 0.07,
        });
      } catch {
        // Ignore blocked or closed audio contexts.
      }
    },

    playCardFlip() {
      const audioCtx = ensureContext();
      if (!audioCtx) return;
      try {
        scheduleTone(audioCtx, {
          type: "triangle",
          startOffset: 0,
          duration: 0.075,
          startFreq: 320,
          endFreq: 640,
          peakGain: 0.08,
        });
      } catch {
        // Ignore blocked or closed audio contexts.
      }
    },

    playCardDeal(stepRatio = 0.5) {
      const audioCtx = ensureContext();
      if (!audioCtx) return;
      try {
        const freq = 430 + clampUnit(stepRatio) * 210;
        scheduleTone(audioCtx, {
          type: "triangle",
          startOffset: 0,
          duration: 0.045,
          startFreq: freq,
          endFreq: freq * 1.15,
          peakGain: 0.065,
        });
      } catch {
        // Ignore blocked or closed audio contexts.
      }
    },

    playClusterCue() {
      const audioCtx = ensureContext();
      if (!audioCtx) return;
      try {
        scheduleTone(audioCtx, {
          type: "sine",
          startOffset: 0,
          duration: 0.12,
          startFreq: 440,
          peakGain: 0.085,
        });
        scheduleTone(audioCtx, {
          type: "sine",
          startOffset: 0.08,
          duration: 0.16,
          startFreq: 554.37,
          peakGain: 0.095,
        });
      } catch {
        // Ignore blocked or closed audio contexts.
      }
    },

    playRevealChime() {
      const audioCtx = ensureContext();
      if (!audioCtx) return;
      try {
        const notes = [523.25, 659.25, 783.99];
        notes.forEach((freq, idx) => {
          scheduleTone(audioCtx, {
            type: "sine",
            startOffset: idx * 0.07,
            duration: 0.22,
            startFreq: freq,
            peakGain: 0.11,
          });
        });
      } catch {
        // Ignore blocked or closed audio contexts.
      }
    },
  };
}
