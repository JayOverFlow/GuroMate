import { useMemo, type CSSProperties, type ReactNode } from "react";
import {
  resolveEffectiveGroupMode,
  type GroupAnimationMode,
} from "../../engine/classroomPreferences";
import type {
  GroupGenerationOptions,
  GroupSlot,
  RosterStudent,
} from "../../engine/classroomTools";
import {
  createSettledMingleLayout,
  getRemainingDeckCount,
  isGroupCardRevealed,
  type ChipDensityTier,
  type GroupPlaybackState,
  type MingleChipPlan,
  type MingleSettledChip,
} from "../../engine/groupAnimation";
import { OVERLAY_STAGE_CLASS } from "./projectorStyles";

const GROUP_MODE_OPTIONS: ReadonlyArray<{
  value: GroupAnimationMode;
  label: string;
  icon: string;
}> = [
  { value: "card-deal", label: "Card Deal", icon: "style" },
  { value: "group-yourselves", label: "Group Yourselves", icon: "groups" },
  { value: "instant", label: "Instant", icon: "bolt" },
];

const FLOOR_HEIGHT_CLASS: Record<
  ChipDensityTier,
  { inline: string; projector: string }
> = {
  comfortable: {
    inline: "min-h-[280px] sm:min-h-[320px]",
    projector: "min-h-[44vh]",
  },
  standard: {
    inline: "min-h-[320px] sm:min-h-[360px]",
    projector: "min-h-[48vh]",
  },
  compact: {
    inline: "min-h-[360px] sm:min-h-[420px]",
    projector: "min-h-[52vh]",
  },
};

const DOT_SIZE_CLASS: Record<
  ChipDensityTier,
  { inline: string; projector: string }
> = {
  comfortable: {
    inline: "w-4 h-4",
    projector: "w-6 h-6",
  },
  standard: {
    inline: "w-3.5 h-3.5",
    projector: "w-5 h-5",
  },
  compact: {
    inline: "w-3 h-3",
    projector: "w-4 h-4",
  },
};

function isAnimatedMingleChip(
  chip: MingleChipPlan | MingleSettledChip,
): chip is MingleChipPlan {
  return "mingleX" in chip;
}

export interface GroupMakerStageProps {
  baseId: string;
  stageRef: (el: HTMLDivElement | null) => void;
  isProjector: boolean;
  isProjectorOverlay: boolean;
  presentCount: number;
  groupMode: GroupGenerationOptions["mode"];
  onGroupModeChange: (mode: GroupGenerationOptions["mode"]) => void;
  groupValue: number;
  onGroupValueChange: (value: number) => void;
  groups: readonly (readonly RosterStudent[])[];
  swapSelection: GroupSlot | null;
  animationMode: GroupAnimationMode;
  prefersReducedMotion: boolean;
  onAnimationModeChange: (mode: GroupAnimationMode) => void;
  playback: GroupPlaybackState;
  isAnimating: boolean;
  generationCount: number;
  onGenerateGroups: () => void;
  onSkipAnimation: () => void;
  onStudentClick: (slot: GroupSlot) => void;
  soundToggle: ReactNode;
  projectorToggle: ReactNode;
}

export function GroupMakerStage({
  baseId,
  stageRef,
  isProjector,
  isProjectorOverlay,
  presentCount,
  groupMode,
  onGroupModeChange,
  groupValue,
  onGroupValueChange,
  groups,
  swapSelection,
  animationMode,
  prefersReducedMotion,
  onAnimationModeChange,
  playback,
  isAnimating,
  generationCount,
  onGenerateGroups,
  onSkipAnimation,
  onStudentClick,
  soundToggle,
  projectorToggle,
}: GroupMakerStageProps) {
  const selectedUiMode = animationMode;
  const effectiveMode = resolveEffectiveGroupMode(
    animationMode,
    prefersReducedMotion,
  );
  const totalStudentsInGroups = groups.reduce(
    (sum, group) => sum + group.length,
    0,
  );
  const remainingCards = playback.plan
    ? getRemainingDeckCount(playback.plan, playback.revealedCount)
    : 0;
  const minglePlan =
    isAnimating && playback.mode === "group-yourselves"
      ? playback.minglePlan
      : null;
  const isMingleAnimating = Boolean(minglePlan);
  const isClusterBeat = playback.mingleBeat === "cluster";
  const settledFromMingle =
    playback.phase === "settled" && playback.mode === "group-yourselves";
  const showRetainedMingleStage =
    !isAnimating && groups.length > 0 && animationMode === "group-yourselves";
  const settledMingleLayout = useMemo(
    () => (showRetainedMingleStage ? createSettledMingleLayout(groups) : null),
    [groups, showRetainedMingleStage],
  );
  const activeMingleLayout = minglePlan ?? settledMingleLayout;
  const showMingleStage = Boolean(activeMingleLayout);
  const stageBeat: "mingle" | "cluster" | "settled" = isMingleAnimating
    ? isClusterBeat
      ? "cluster"
      : "mingle"
    : "settled";
  const isZoneHighlighted = stageBeat !== "mingle";
  const orderedStageDots = useMemo(() => {
    if (!activeMingleLayout) return [];
    return [...activeMingleLayout.chips].sort(
      (a, b) => a.student.index - b.student.index,
    );
  }, [activeMingleLayout]);

  const settledAnnouncement =
    playback.phase === "settled" && groups.length > 0
      ? `Groups ready: ${groups.length} ${groups.length === 1 ? "group" : "groups"} formed from ${totalStudentsInGroups} present ${totalStudentsInGroups === 1 ? "student" : "students"}${generationCount > 1 ? ` (shuffle ${generationCount})` : ""}.`
      : "";

  return (
    <div
      ref={stageRef}
      role={isProjectorOverlay ? "dialog" : undefined}
      aria-modal={isProjectorOverlay ? true : undefined}
      aria-label={isProjectorOverlay ? "Group Maker Projector View" : undefined}
      tabIndex={isProjectorOverlay ? -1 : undefined}
      className={`classroom-projector-stage bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-lg flex flex-col gap-gutter-md ${
        isProjectorOverlay ? OVERLAY_STAGE_CLASS : ""
      }`}
    >
      <div
        className={`w-full flex flex-col gap-gutter-md ${
          isProjector ? "max-w-7xl mx-auto my-auto" : ""
        }`}
      >
        <div className="flex flex-wrap items-end justify-between gap-gutter-md pb-gutter-md border-b border-outline-variant">
          <div className="flex flex-wrap items-end gap-gutter-md">
            <div className="flex flex-col gap-gutter-xs">
              <label
                htmlFor={`${baseId}-group-mode`}
                className="font-label text-label-md text-on-surface"
              >
                Split By
              </label>
              <select
                id={`${baseId}-group-mode`}
                value={groupMode}
                disabled={isAnimating}
                onChange={(e) =>
                  onGroupModeChange(
                    e.target.value as GroupGenerationOptions["mode"],
                  )
                }
                className="px-gutter-md py-gutter-sm rounded bg-surface-container-lowest border border-outline-variant text-body-md text-on-surface focus:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
              >
                <option value="count">Number of Groups</option>
                <option value="size">Students per Group</option>
              </select>
            </div>

            <div className="flex flex-col gap-gutter-xs">
              <label
                htmlFor={`${baseId}-group-value`}
                className="font-label text-label-md text-on-surface"
              >
                {groupMode === "count"
                  ? "Number of Groups"
                  : "Max Students per Group"}
              </label>
              <input
                id={`${baseId}-group-value`}
                type="number"
                min={1}
                max={Math.max(1, presentCount)}
                value={groupValue}
                disabled={isAnimating}
                onChange={(e) =>
                  onGroupValueChange(
                    Math.max(1, Number.parseInt(e.target.value || "1", 10)),
                  )
                }
                className="w-28 px-gutter-md py-gutter-sm rounded bg-surface-container-lowest border border-outline-variant font-mono text-mono-md text-on-surface tabular-nums focus:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
              />
            </div>

            <div className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-md text-on-surface">
                Reveal Style
              </span>
              <div
                role="group"
                aria-label="Group Maker animation mode"
                className="inline-flex items-center gap-gutter-xs p-gutter-xs rounded bg-surface-container border border-outline-variant"
              >
                {GROUP_MODE_OPTIONS.map((option) => {
                  const isSelected = selectedUiMode === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={isSelected}
                      disabled={isAnimating}
                      onClick={() => onAnimationModeChange(option.value)}
                      className={`inline-flex items-center gap-gutter-xs px-gutter-sm py-gutter-xs rounded-sm font-label text-label-md transition-colors duration-state-change focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 ${
                        isSelected
                          ? "bg-primary text-on-primary"
                          : "text-on-surface-variant hover:text-on-surface"
                      }`}
                    >
                      <span
                        className="material-symbols-outlined text-title-md"
                        aria-hidden="true"
                      >
                        {option.icon}
                      </span>
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-gutter-sm">
            <button
              type="button"
              disabled={presentCount === 0 || isAnimating}
              onClick={onGenerateGroups}
              className="inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-sm rounded bg-primary text-on-primary font-label text-label-lg hover:bg-primary-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
            >
              <span
                className="material-symbols-outlined text-title-md"
                aria-hidden="true"
              >
                shuffle
              </span>
              <span>
                {groups.length > 0 ? "Reshuffle Groups" : "Generate Groups"}
              </span>
            </button>

            {isProjector && soundToggle}
            {projectorToggle}
          </div>
        </div>

        <div className="visually-hidden" role="status" aria-live="polite">
          {settledAnnouncement}
        </div>

        {groups.length > 0 ? (
          <div className="flex flex-col gap-gutter-md">
            <div className="min-h-11 flex flex-wrap items-center justify-between gap-gutter-sm">
              {isAnimating ? (
                <>
                  <div className="flex-1 flex justify-center">
                    {isMingleAnimating && minglePlan ? (
                      <div
                        className={`inline-flex items-center gap-gutter-sm px-gutter-md py-gutter-xs rounded-full border transition-colors duration-surface-enter ${
                          isClusterBeat
                            ? "bg-primary/10 border-primary/40 text-primary"
                            : "bg-secondary-container/25 border-secondary/40 text-on-secondary-container"
                        }`}
                      >
                        <span
                          className={`inline-flex items-center justify-center w-7 h-7 rounded ${
                            isClusterBeat
                              ? "bg-primary text-on-primary"
                              : "bg-secondary text-on-secondary"
                          }`}
                          aria-hidden="true"
                        >
                          <span className="material-symbols-outlined text-title-md">
                            {isClusterBeat ? "groups" : "diversity_3"}
                          </span>
                        </span>
                        <span className="font-label text-label-md text-on-surface">
                          {isClusterBeat
                            ? "Locking into groups…"
                            : "Find your groupmates…"}
                        </span>
                        <span
                          className={`px-gutter-sm py-0.5 rounded-full font-mono text-label-sm tabular-nums ${
                            isClusterBeat
                              ? "bg-primary text-on-primary"
                              : "bg-secondary text-on-secondary"
                          }`}
                        >
                          {isClusterBeat
                            ? `${minglePlan.groupCount} ${minglePlan.groupCount === 1 ? "group" : "groups"}`
                            : `${minglePlan.totalStudents} present`}
                        </span>
                      </div>
                    ) : (
                      <div className="classroom-deck-badge inline-flex items-center gap-gutter-sm px-gutter-md py-gutter-xs rounded-full bg-secondary-container/25 border border-secondary/40 text-on-secondary-container">
                        <span
                          className="inline-flex items-center justify-center w-7 h-7 rounded bg-primary text-on-primary"
                          aria-hidden="true"
                        >
                          <span className="material-symbols-outlined text-title-md">
                            style
                          </span>
                        </span>
                        <span className="font-label text-label-md text-on-surface">
                          Shuffled Deck
                        </span>
                        <span className="px-gutter-sm py-0.5 rounded-full bg-secondary text-on-secondary font-mono text-label-sm tabular-nums">
                          {remainingCards}{" "}
                          {remainingCards === 1 ? "card" : "cards"} left
                        </span>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={onSkipAnimation}
                    className="shrink-0 inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-xs rounded bg-surface-container-lowest border border-secondary text-secondary font-label text-label-md hover:bg-secondary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors duration-state-change"
                  >
                    <span
                      className="material-symbols-outlined text-title-md"
                      aria-hidden="true"
                    >
                      skip_next
                    </span>
                    <span>Skip</span>
                  </button>
                </>
              ) : (
                <p className="font-body text-body-sm text-on-surface-variant">
                  {swapSelection
                    ? "Select a second student to complete the swap (or click the same student to cancel)."
                    : "Click any two students across groups to swap them manually."}
                  {prefersReducedMotion && selectedUiMode !== "instant"
                    ? " Reduced motion is active, so groups reveal instantly."
                    : ""}
                </p>
              )}
            </div>

            {showMingleStage && activeMingleLayout ? (
              <div
                aria-label="Group Yourselves floor stage"
                aria-busy={isMingleAnimating || undefined}
                className={`relative w-full rounded-md border border-outline-variant bg-surface-container-low overflow-hidden select-none ${
                  isProjector
                    ? FLOOR_HEIGHT_CLASS[activeMingleLayout.densityTier]
                        .projector
                    : FLOOR_HEIGHT_CLASS[activeMingleLayout.densityTier].inline
                }`}
              >
                {/* Always-visible Group 1..N containers across mingle, cluster, and settled states */}
                {activeMingleLayout.zones.map((zone) => {
                  const isEmeraldZone = zone.groupIndex % 2 === 0;
                  return (
                    <div
                      key={zone.groupIndex}
                      data-beat={stageBeat}
                      aria-hidden="true"
                      style={{
                        left: `${zone.leftPct}%`,
                        top: `${zone.topPct}%`,
                        width: `${zone.widthPct}%`,
                        height: `${zone.heightPct}%`,
                      }}
                      className={`classroom-mingle-zone absolute rounded-md border p-gutter-xs sm:p-gutter-sm flex flex-col justify-between ${
                        isZoneHighlighted
                          ? isEmeraldZone
                            ? "border-primary/45 bg-primary/[0.06]"
                            : "border-secondary/45 bg-secondary/[0.06]"
                          : "border-dashed border-outline/60 bg-surface-container-lowest/75"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-gutter-xs">
                        <span
                          className={`font-title truncate ${
                            isProjector ? "text-title-md" : "text-label-md"
                          } ${
                            isZoneHighlighted
                              ? isEmeraldZone
                                ? "text-primary"
                                : "text-secondary"
                              : "text-on-surface"
                          }`}
                        >
                          {zone.label}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded-full font-mono text-label-sm tabular-nums ${
                            isZoneHighlighted
                              ? isEmeraldZone
                                ? "bg-primary/15 text-primary"
                                : "bg-secondary/15 text-secondary"
                              : "bg-surface-container text-on-surface-variant"
                          }`}
                        >
                          {zone.studentCount}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* Compositor-only student dots gliding from mingle positions into Group 1..N containers */}
                {orderedStageDots.map((dot) => {
                  const isEmeraldZone = dot.groupIndex % 2 === 0;
                  const isMingleBeat = stageBeat === "mingle";
                  const animatedChip = isAnimatedMingleChip(dot) ? dot : null;
                  const x =
                    isMingleBeat && animatedChip
                      ? animatedChip.mingleX
                      : dot.targetX;
                  const y =
                    isMingleBeat && animatedChip
                      ? animatedChip.mingleY
                      : dot.targetY;
                  const settleBuffer = minglePlan
                    ? Math.min(220, Math.floor(minglePlan.clusterDurationMs * 0.15))
                    : 0;
                  const glideMs =
                    minglePlan && animatedChip
                      ? Math.max(
                          220,
                          minglePlan.clusterDurationMs -
                            animatedChip.clusterDelayMs -
                            settleBuffer,
                        )
                      : 380;
                  const slotStyle = {
                    transform: `translate3d(${x}%, ${y}%, 0)`,
                    "--cluster-duration": `${glideMs}ms`,
                    "--cluster-delay": `${
                      stageBeat === "cluster" && animatedChip
                        ? animatedChip.clusterDelayMs
                        : 0
                    }ms`,
                  } as CSSProperties;
                  const dotStyle = animatedChip
                    ? ({
                        "--drift-x": `${animatedChip.driftX}px`,
                        "--drift-y": `${animatedChip.driftY}px`,
                        "--drift-duration": `${1800 + (dot.student.index % 5) * 180}ms`,
                      } as CSSProperties)
                    : undefined;
                  const dotSizeClass = isProjector
                    ? DOT_SIZE_CLASS[activeMingleLayout.densityTier].projector
                    : DOT_SIZE_CLASS[activeMingleLayout.densityTier].inline;
                  const isSwapSelected =
                    !isMingleAnimating &&
                    swapSelection?.groupIndex === dot.groupIndex &&
                    swapSelection?.studentIndex === dot.studentIndex;

                  return (
                    <div
                      key={dot.student.index}
                      data-beat={stageBeat}
                      style={slotStyle}
                      className="classroom-mingle-slot"
                    >
                      <div className="classroom-mingle-anchor">
                        <span
                          role="img"
                          tabIndex={0}
                          title={dot.student.name}
                          aria-label={
                            isMingleBeat
                              ? dot.student.name
                              : `${dot.student.name}, Group ${dot.groupIndex + 1}`
                          }
                          data-beat={stageBeat}
                          style={dotStyle}
                          className={`classroom-mingle-dot pointer-events-auto block rounded-full shadow-xs cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${dotSizeClass} ${
                            isMingleBeat
                              ? "bg-outline ring-2 ring-surface-container-lowest"
                              : isEmeraldZone
                                ? "bg-primary ring-2 ring-surface-container-lowest"
                                : "bg-secondary ring-2 ring-surface-container-lowest"
                          } ${
                            isSwapSelected
                              ? "ring-primary ring-offset-2 ring-offset-surface-container-low"
                              : ""
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {!isMingleAnimating ? (
              <div
                className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-gutter-md ${
                  settledFromMingle ? "classroom-group-settle-in" : ""
                }`}
              >
                {groups.map((group, groupIndex) => {
                  const dealtInGroup = isAnimating
                    ? group.reduce(
                        (count, _student, studentIndex) =>
                          count +
                          (isGroupCardRevealed(
                            playback,
                            groupIndex,
                            studentIndex,
                          )
                            ? 1
                            : 0),
                        0,
                      )
                    : group.length;

                  return (
                    <section
                      key={groupIndex}
                      aria-label={`Group ${groupIndex + 1}`}
                      className="p-gutter-md rounded-md border border-outline-variant bg-surface-container-low flex flex-col gap-gutter-sm"
                    >
                      <h3
                        className={`font-title text-on-surface flex items-center justify-between ${
                          isProjector ? "text-title-lg" : "text-title-md"
                        }`}
                      >
                        <span>Group {groupIndex + 1}</span>
                        <span className="px-gutter-sm py-0.5 rounded-full bg-surface-container-lowest border border-outline-variant font-mono text-label-sm tabular-nums">
                          {isAnimating
                            ? `${dealtInGroup}/${group.length}`
                            : group.length}
                        </span>
                      </h3>
                      <ul className="flex flex-col gap-gutter-xs">
                        {group.map((student, studentIndex) => {
                          const revealed = isGroupCardRevealed(
                            playback,
                            groupIndex,
                            studentIndex,
                          );
                          const isSelected =
                            !isAnimating &&
                            swapSelection?.groupIndex === groupIndex &&
                            swapSelection?.studentIndex === studentIndex;
                          const sizeClass = isProjector
                            ? "text-body-md"
                            : "text-body-sm";

                          return (
                            <li key={`${student.index}-${studentIndex}`}>
                              {revealed ? (
                                <button
                                  type="button"
                                  disabled={isAnimating}
                                  aria-pressed={isSelected}
                                  onClick={() =>
                                    onStudentClick({
                                      groupIndex,
                                      studentIndex,
                                    })
                                  }
                                  className={`w-full text-left px-gutter-sm py-gutter-xs rounded border font-body transition-colors duration-state-change focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${sizeClass} ${
                                    isAnimating && effectiveMode === "card-deal"
                                      ? "classroom-card-deal-in"
                                      : ""
                                  } ${
                                    isSelected
                                      ? "bg-primary text-on-primary border-primary font-semibold"
                                      : isAnimating
                                        ? "bg-surface-container-lowest border-primary/40 text-on-surface cursor-default"
                                        : "bg-surface-container-lowest border-outline-variant text-on-surface hover:border-primary"
                                  }`}
                                >
                                  {student.name}
                                </button>
                              ) : (
                                <div
                                  aria-hidden="true"
                                  className={`w-full px-gutter-sm py-gutter-xs rounded border border-dashed border-outline-variant/60 bg-surface-container/50 font-body select-none ${sizeClass}`}
                                >
                                  <span className="invisible">
                                    {student.name}
                                  </span>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="font-body text-body-sm text-on-surface-variant">
            Configure group count or max group size and click{" "}
            <strong>Generate Groups</strong> ({presentCount} present students).
          </p>
        )}
      </div>
    </div>
  );
}
