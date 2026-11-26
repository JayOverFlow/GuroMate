import { describe, expect, it } from "vitest";
import { createClassroomAudioPlayer } from "./classroomAudio";

describe("classroomAudio", () => {
  it("safely no-ops all cues and lifecycle methods when Web Audio is unavailable", () => {
    const player = createClassroomAudioPlayer();
    expect(() => {
      player.unlock();
      player.playReelTick();
      player.playReelTick(0.8);
      player.playCardFlip();
      player.playCardDeal(0.25);
      player.playClusterCue();
      player.playRevealChime();
      player.dispose();
    }).not.toThrow();
  });
});
