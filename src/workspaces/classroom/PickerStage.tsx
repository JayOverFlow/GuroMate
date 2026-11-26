import type { ReactNode } from "react";
import type { PickerAnimationMode } from "../../engine/classroomPreferences";
import type { RosterStudent } from "../../engine/classroomTools";
import {
  normalizeAvailablePickerMode,
  type AvailablePickerMode,
  type SlotReelWindow,
} from "../../engine/pickerAnimation";

const OVERLAY_STAGE_CLASS =
  "fixed inset-0 z-50 rounded-none border-0 overflow-auto bg-surface p-gutter-xl";

const MODE_OPTIONS: ReadonlyArray<{
  id: AvailablePickerMode;
  label: string;
}> = [
  { id: "slot", label: "Slot Machine" },
  { id: "instant", label: "Instant" },
];

export interface PickerStageProps {
  stageRef: (el: HTMLDivElement | null) => void;
  isProjector: boolean;
  isOverlay: boolean;
  sectionName: string;
  totalStudents: number;
  presentStudents: readonly RosterStudent[];
  remainingInPoolCount: number;
  removePickedFromPool: boolean;
  onRemovePickedFromPoolChange: (checked: boolean) => void;
  pickerMode: PickerAnimationMode;
  effectivePickerMode: PickerAnimationMode;
  prefersReducedMotion: boolean;
  onPickerModeChange: (mode: PickerAnimationMode) => void;
  pickedStudent: RosterStudent | null;
  poolExhausted: boolean;
  isAnimating: boolean;
  isSingleStudentSpotlight: boolean;
  reelWindow: SlotReelWindow | null;
  lastLandedWindow: SlotReelWindow | null;
  revealCount: number;
  onPickStudent: () => void;
  onSkip: () => void;
  onResetPool: () => void;
  soundControl?: ReactNode;
  projectorControl: ReactNode;
}

export function PickerStage({
  stageRef,
  isProjector,
  isOverlay,
  sectionName,
  totalStudents,
  presentStudents,
  remainingInPoolCount,
  removePickedFromPool,
  onRemovePickedFromPoolChange,
  pickerMode,
  effectivePickerMode,
  prefersReducedMotion,
  onPickerModeChange,
  pickedStudent,
  poolExhausted,
  isAnimating,
  isSingleStudentSpotlight,
  reelWindow,
  lastLandedWindow,
  revealCount,
  onPickStudent,
  onSkip,
  onResetPool,
  soundControl,
  projectorControl,
}: PickerStageProps) {
  const selectedModeOption = normalizeAvailablePickerMode(pickerMode);
  const effectivePlaybackMode =
    normalizeAvailablePickerMode(effectivePickerMode);
  const showSlotReel = effectivePlaybackMode === "slot";
  const rowHeightPx = isProjector ? 84 : 52;

  const exhaustedMessage =
    presentStudents.length === 0
      ? "All students are marked absent."
      : "Every present student has been called. Reset pool to draw again.";

  // Announce ONLY final revealed winner or exhaustion; never intermediate reel ticks.
  const liveAnnouncement = isAnimating
    ? ""
    : poolExhausted
      ? exhaustedMessage
      : pickedStudent
        ? `Selected student: ${pickedStudent.name}`
        : "";

  return (
    <div
      ref={stageRef}
      role={isOverlay ? "dialog" : undefined}
      aria-modal={isOverlay ? true : undefined}
      aria-label={isOverlay ? "Random Student Picker Projector View" : undefined}
      tabIndex={isOverlay ? -1 : undefined}
      className={`classroom-projector-stage lg:col-span-5 bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-xl flex flex-col items-center text-center gap-gutter-md ${
        isOverlay ? OVERLAY_STAGE_CLASS : ""
      }`}
    >
      <div
        className={`w-full flex flex-col items-center gap-gutter-md ${
          isProjector ? "max-w-3xl mx-auto my-auto" : ""
        }`}
      >
        {/* Stage Header */}
        <div className="w-full flex flex-wrap items-center justify-between gap-gutter-sm">
          <span className="font-label text-label-md text-on-surface-variant uppercase tracking-wider">
            {isProjector ? "Random Student Picker" : "Selected Student"}
          </span>
          <div className="flex flex-wrap items-center gap-gutter-xs">
            {isProjector && soundControl}
            {projectorControl}
          </div>
        </div>

        {/* Picker Mode Selector */}
        <div className="w-full flex flex-wrap items-center justify-between gap-gutter-xs">
          <div
            role="group"
            aria-label="Random Student Picker animation mode"
            className="inline-flex items-center gap-gutter-xs p-gutter-xs rounded bg-surface-container border border-outline-variant"
          >
            {MODE_OPTIONS.map((option) => {
              const active = selectedModeOption === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  disabled={isAnimating}
                  onClick={() => onPickerModeChange(option.id)}
                  className={`px-gutter-md py-gutter-xs rounded-sm font-label text-label-md transition-colors duration-state-change focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50 ${
                    active
                      ? "bg-primary text-on-primary"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          {prefersReducedMotion && selectedModeOption !== "instant" && (
            <span className="font-body text-body-sm text-on-surface-variant">
              Reduced motion: instant reveal
            </span>
          )}
        </div>

        {/* Visually hidden polite live region: announces final winner only */}
        <div
          className="visually-hidden"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {liveAnnouncement}
        </div>

        {/* Display Area: 3-Row Slot Machine Reel or Instant Spotlight */}
        {showSlotReel ? (
          <div className="w-full rounded-md bg-surface-container-low border border-outline-variant p-gutter-md flex flex-col items-center gap-gutter-sm">
            {poolExhausted ? (
              <div
                className={`w-full flex items-center justify-center ${
                  isProjector ? "min-h-60" : "min-h-40"
                }`}
              >
                <p className="font-title text-title-lg text-on-surface-variant">
                  {exhaustedMessage}
                </p>
              </div>
            ) : (
              <div
                className="relative w-full overflow-hidden rounded border border-outline-variant bg-surface-container select-none"
                style={{ height: `${rowHeightPx * 3}px` }}
                aria-label="Random Student Picker reel"
              >
                {/* Stationary highlighted center target band */}
                <div
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-x-0 z-0 border-y-2 transition-colors duration-state-change ${
                    !isAnimating && pickedStudent
                      ? "border-primary bg-surface-container-lowest shadow-xs"
                      : "border-secondary bg-surface-container-lowest/95"
                  }`}
                  style={{
                    top: `${rowHeightPx}px`,
                    height: `${rowHeightPx}px`,
                  }}
                />

                {/* Left & right terracotta target markers */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-2 z-20 flex items-center text-secondary material-symbols-outlined text-title-md"
                  style={{
                    top: `${rowHeightPx}px`,
                    height: `${rowHeightPx}px`,
                  }}
                >
                  arrow_right
                </span>
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute right-2 z-20 flex items-center text-secondary material-symbols-outlined text-title-md"
                  style={{
                    top: `${rowHeightPx}px`,
                    height: `${rowHeightPx}px`,
                  }}
                >
                  arrow_left
                </span>

                {/* Active Spin (multi-student 3-row continuous reel) */}
                {isAnimating && !isSingleStudentSpotlight && reelWindow ? (
                  <div
                    className="picker-reel-track relative z-10 w-full"
                    style={{
                      transform: `translate3d(0, ${-reelWindow.stepFraction * rowHeightPx}px, 0)`,
                    }}
                  >
                    {[
                      {
                        key: `prev-${reelWindow.stepIndex}`,
                        student: reelWindow.prev,
                        role: "neighbor" as const,
                      },
                      {
                        key: `curr-${reelWindow.stepIndex}`,
                        student: reelWindow.current,
                        role: "center" as const,
                      },
                      {
                        key: `next-${reelWindow.stepIndex}`,
                        student: reelWindow.next,
                        role: "neighbor" as const,
                      },
                      {
                        key: `after-${reelWindow.stepIndex}`,
                        student: reelWindow.afterNext,
                        role: "neighbor" as const,
                      },
                    ].map((row) => (
                      <div
                        key={row.key}
                        className="w-full px-gutter-xl flex items-center justify-center"
                        style={{ height: `${rowHeightPx}px` }}
                      >
                        <span
                          className={`truncate max-w-full ${
                            row.role === "center"
                              ? "font-display font-bold text-primary"
                              : "font-title text-on-surface-variant/65"
                          }`}
                          style={{
                            fontSize:
                              row.role === "center"
                                ? isProjector
                                  ? "clamp(2rem, 5.5vw, 3.75rem)"
                                  : "1.5rem"
                                : isProjector
                                  ? "clamp(1.25rem, 3vw, 2rem)"
                                  : "0.95rem",
                          }}
                        >
                          {row.student?.name ?? ""}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : isAnimating && isSingleStudentSpotlight && reelWindow ? (
                  /* 1-Student Remaining ~0.6s Spotlight Lock-In */
                  <div className="relative z-10 w-full h-full flex flex-col">
                    <div
                      className="w-full px-gutter-xl flex items-center justify-center"
                      style={{ height: `${rowHeightPx}px` }}
                    >
                      <span className="font-label text-label-sm uppercase tracking-wider text-secondary">
                        Final remaining student
                      </span>
                    </div>
                    <div
                      className="picker-spotlight-lock w-full px-gutter-xl flex items-center justify-center"
                      style={{ height: `${rowHeightPx}px` }}
                    >
                      <span
                        className="truncate max-w-full font-display font-bold text-primary"
                        style={{
                          fontSize: isProjector
                            ? "clamp(2rem, 5.5vw, 3.75rem)"
                            : "1.5rem",
                        }}
                      >
                        {reelWindow.current.name}
                      </span>
                    </div>
                    <div
                      className="w-full px-gutter-xl flex items-center justify-center"
                      style={{ height: `${rowHeightPx}px` }}
                    >
                      <span className="font-body text-body-sm text-on-surface-variant/65">
                        Locking in spotlight…
                      </span>
                    </div>
                  </div>
                ) : pickedStudent ? (
                  /* Landed Celebratory Winner State */
                  <div className="relative z-10 w-full h-full flex flex-col">
                    <div
                      className="w-full px-gutter-xl flex items-center justify-center"
                      style={{ height: `${rowHeightPx}px` }}
                    >
                      <span
                        className="truncate max-w-full font-title text-on-surface-variant/55"
                        style={{
                          fontSize: isProjector
                            ? "clamp(1.15rem, 2.6vw, 1.75rem)"
                            : "0.9rem",
                        }}
                      >
                        {lastLandedWindow?.prev?.name ?? ""}
                      </span>
                    </div>
                    <div
                      key={revealCount}
                      className="picker-reveal-pop w-full px-gutter-xl flex items-center justify-center gap-gutter-sm"
                      style={{ height: `${rowHeightPx}px` }}
                    >
                      <span
                        className="truncate max-w-full font-display font-bold text-primary"
                        style={{
                          fontSize: isProjector
                            ? "clamp(2.1rem, 5.8vw, 4rem)"
                            : "1.6rem",
                        }}
                      >
                        {pickedStudent.name}
                      </span>
                    </div>
                    <div
                      className="w-full px-gutter-xl flex items-center justify-center"
                      style={{ height: `${rowHeightPx}px` }}
                    >
                      <span
                        className="truncate max-w-full font-title text-on-surface-variant/55"
                        style={{
                          fontSize: isProjector
                            ? "clamp(1.15rem, 2.6vw, 1.75rem)"
                            : "0.9rem",
                        }}
                      >
                        {lastLandedWindow?.next?.name ?? ""}
                      </span>
                    </div>
                  </div>
                ) : (
                  /* Idle 3-Row Preview */
                  <div className="relative z-10 w-full h-full flex flex-col">
                    <div
                      className="w-full px-gutter-xl flex items-center justify-center"
                      style={{ height: `${rowHeightPx}px` }}
                    >
                      <span className="truncate max-w-full font-title text-body-md text-on-surface-variant/50">
                        {presentStudents[0]?.name ?? ""}
                      </span>
                    </div>
                    <div
                      className="w-full px-gutter-xl flex items-center justify-center"
                      style={{ height: `${rowHeightPx}px` }}
                    >
                      <span className="font-title text-title-lg text-on-surface-variant">
                        Ready to pick a student
                      </span>
                    </div>
                    <div
                      className="w-full px-gutter-xl flex items-center justify-center"
                      style={{ height: `${rowHeightPx}px` }}
                    >
                      <span className="truncate max-w-full font-title text-body-md text-on-surface-variant/50">
                        {presentStudents[1]?.name ?? ""}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-gutter-xs">
              {!isAnimating && pickedStudent && !poolExhausted && (
                <span className="px-gutter-sm py-0.5 rounded-full bg-success-container text-on-success-container font-label text-label-sm">
                  Selected
                </span>
              )}
              {isAnimating && (
                <span className="px-gutter-sm py-0.5 rounded-full bg-warning-container text-on-warning-container font-label text-label-sm">
                  {isSingleStudentSpotlight
                    ? "Spotlight lock-in…"
                    : "Spinning Recitation Pool…"}
                </span>
              )}
              <span className="font-body text-body-sm text-on-surface-variant">
                {sectionName} · Present: {presentStudents.length}/
                {totalStudents} · Pool remaining: {remainingInPoolCount}
              </span>
            </div>
          </div>
        ) : (
          /* Instant / Reduced-Motion Direct Reveal Card */
          <div
            className={`w-full rounded-md bg-surface-container-low border border-primary flex flex-col items-center gap-gutter-xs ${
              isProjector ? "py-gutter-xl px-gutter-xl" : "py-gutter-lg px-gutter-md"
            }`}
          >
            {poolExhausted ? (
              <p className="font-title text-title-lg text-on-surface-variant">
                {exhaustedMessage}
              </p>
            ) : pickedStudent ? (
              <p
                className="font-display font-bold text-primary text-balance leading-tight"
                style={
                  isProjector
                    ? { fontSize: "clamp(2.5rem, 8vw, 5.5rem)" }
                    : undefined
                }
              >
                <span className={isProjector ? "" : "text-display-lg"}>
                  {pickedStudent.name}
                </span>
              </p>
            ) : (
              <p className="font-title text-title-lg text-on-surface-variant">
                Ready to pick a student
              </p>
            )}
            <span className="font-body text-body-sm text-on-surface-variant">
              {sectionName} · Present: {presentStudents.length}/{totalStudents}{" "}
              · Pool remaining: {remainingInPoolCount}
            </span>
          </div>
        )}

        {/* Recitation Pool Replacement Toggle */}
        <label
          className={`inline-flex items-center gap-gutter-sm ${
            isAnimating ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
          }`}
        >
          <input
            type="checkbox"
            checked={removePickedFromPool}
            disabled={isAnimating}
            onChange={(e) => onRemovePickedFromPoolChange(e.target.checked)}
            className="accent-primary"
          />
          <span className="font-body text-body-sm text-on-surface">
            Remove picked student from pool until reset (no repeats)
          </span>
        </label>

        {/* Action Buttons */}
        <div className="flex flex-wrap justify-center items-center gap-gutter-sm pt-gutter-xs">
          <button
            type="button"
            disabled={presentStudents.length === 0 || isAnimating}
            onClick={onPickStudent}
            className="shrink-0 whitespace-nowrap inline-flex items-center gap-gutter-sm px-gutter-lg py-gutter-sm rounded bg-primary text-on-primary font-label text-label-lg hover:bg-primary-container focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change disabled:opacity-50"
          >
            <span
              className="material-symbols-outlined text-title-md"
              aria-hidden="true"
            >
              casino
            </span>
            <span>{isAnimating ? "Picking…" : "Pick Random Student"}</span>
          </button>

          {isAnimating && (
            <button
              type="button"
              onClick={onSkip}
              className="shrink-0 whitespace-nowrap inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-sm rounded bg-secondary text-on-secondary font-label text-label-lg hover:bg-secondary/90 focus-visible:outline-2 focus-visible:outline-secondary transition-colors duration-state-change"
            >
              <span
                className="material-symbols-outlined text-title-md"
                aria-hidden="true"
              >
                skip_next
              </span>
              <span>Skip</span>
            </button>
          )}

          <button
            type="button"
            disabled={isAnimating}
            onClick={onResetPool}
            className="shrink-0 whitespace-nowrap inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-sm rounded bg-surface-container-lowest border border-outline-variant font-label text-label-lg text-on-surface hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change disabled:opacity-50"
          >
            <span
              className="material-symbols-outlined text-title-md"
              aria-hidden="true"
            >
              refresh
            </span>
            <span>Reset Pool</span>
          </button>
        </div>
      </div>
    </div>
  );
}
