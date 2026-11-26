import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
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
  getInFlightCardSteps,
  getRemainingDeckCount,
  getSolitaireCascadeTier,
  isGroupCardRevealed,
  type ChipDensityTier,
  type GroupPlaybackState,
  type SolitaireCascadeTier,
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
    inline: "min-h-[340px] sm:min-h-[380px]",
    projector: "min-h-[58vh]",
  },
  standard: {
    inline: "min-h-[400px] sm:min-h-[440px]",
    projector: "min-h-[64vh]",
  },
  compact: {
    inline: "min-h-[460px] sm:min-h-[520px]",
    projector: "min-h-[70vh]",
  },
};

const CHIP_SIZE_CLASS: Record<
  ChipDensityTier,
  { inline: string; projector: string }
> = {
  comfortable: {
    inline: "px-3 py-1.5 text-body-sm max-w-[164px]",
    projector: "px-4 py-2 text-body-lg max-w-[228px]",
  },
  standard: {
    inline: "px-2.5 py-1 text-label-md max-w-[138px]",
    projector: "px-3 py-1.5 text-body-md max-w-[184px]",
  },
  compact: {
    inline: "px-2 py-0.5 text-label-sm max-w-[114px]",
    projector: "px-2.5 py-1 text-body-sm max-w-[154px]",
  },
};

const SOLITAIRE_SUITS = ["♠", "♦", "♣", "♥"] as const;

interface SolitaireCascadeStyle {
  overlap: string;
  apron: string;
  lastApron: string;
  headerPad: string;
  nameText: string;
  slotStepPx: number;
}

const SOLITAIRE_CASCADE_STYLES: Record<
  SolitaireCascadeTier,
  { inline: SolitaireCascadeStyle; projector: SolitaireCascadeStyle }
> = {
  comfortable: {
    inline: {
      overlap: "-mt-6",
      apron: "h-7",
      lastApron: "h-12",
      headerPad: "px-3 py-2",
      nameText: "text-body-md",
      slotStepPx: 42,
    },
    projector: {
      overlap: "-mt-7",
      apron: "h-8",
      lastApron: "h-14",
      headerPad: "px-3.5 py-2.5",
      nameText: "text-body-lg",
      slotStepPx: 50,
    },
  },
  standard: {
    inline: {
      overlap: "-mt-4",
      apron: "h-5",
      lastApron: "h-9",
      headerPad: "px-2.5 py-1.5",
      nameText: "text-body-sm",
      slotStepPx: 34,
    },
    projector: {
      overlap: "-mt-5",
      apron: "h-6",
      lastApron: "h-11",
      headerPad: "px-3 py-2",
      nameText: "text-body-md",
      slotStepPx: 42,
    },
  },
  compact: {
    inline: {
      overlap: "-mt-3",
      apron: "h-4",
      lastApron: "h-7",
      headerPad: "px-2.5 py-1",
      nameText: "text-body-sm",
      slotStepPx: 28,
    },
    projector: {
      overlap: "-mt-3.5",
      apron: "h-5",
      lastApron: "h-8",
      headerPad: "px-3 py-1.5",
      nameText: "text-body-md",
      slotStepPx: 34,
    },
  },
};

interface DealFlightGeometry {
  deckX: number;
  deckY: number;
  targets: Array<{ x: number; topY: number; width: number }>;
}

function easeOutCubic(t: number): number {
  const inv = 1 - t;
  return 1 - inv * inv * inv;
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
  const maxGroupSize = groups.reduce(
    (max, group) => Math.max(max, group.length),
    0,
  );
  const isCardDealAnimating =
    isAnimating && playback.mode === "card-deal" && playback.plan !== null;
  const isSolitaireLayout =
    isCardDealAnimating || (!isAnimating && selectedUiMode === "card-deal");
  const inFlightCards =
    isCardDealAnimating && playback.plan
      ? getInFlightCardSteps(playback.plan, playback.elapsedMs)
      : [];
  const remainingCards = playback.plan
    ? getRemainingDeckCount(
        playback.plan,
        playback.revealedCount + inFlightCards.length,
      )
    : 0;
  const deckThicknessLayers =
    playback.plan && remainingCards > 0
      ? Math.min(
          4,
          Math.max(1, Math.ceil((remainingCards / playback.plan.totalCards) * 4)),
        )
      : 0;
  const solitaireTier = getSolitaireCascadeTier(
    totalStudentsInGroups,
    maxGroupSize,
  );
  const solitaireStyle = isProjector
    ? SOLITAIRE_CASCADE_STYLES[solitaireTier].projector
    : SOLITAIRE_CASCADE_STYLES[solitaireTier].inline;

  const dealStageRef = useRef<HTMLDivElement | null>(null);
  const dealerDeckRef = useRef<HTMLDivElement | null>(null);
  const groupSectionRefs = useRef<Array<HTMLElement | null>>([]);
  const [flightGeometry, setFlightGeometry] =
    useState<DealFlightGeometry | null>(null);

  useLayoutEffect(() => {
    if (!isCardDealAnimating || prefersReducedMotion) {
      setFlightGeometry(null);
      return;
    }

    const measure = () => {
      const stageEl = dealStageRef.current;
      const deckEl = dealerDeckRef.current;
      if (!stageEl || !deckEl) return;
      const stageRect = stageEl.getBoundingClientRect();
      const deckRect = deckEl.getBoundingClientRect();
      const targets = groups.map((_, groupIndex) => {
        const sectionEl = groupSectionRefs.current[groupIndex];
        if (!sectionEl) {
          return {
            x: stageRect.width / 2,
            topY: deckRect.bottom - stageRect.top + 80,
            width: 180,
          };
        }
        const secRect = sectionEl.getBoundingClientRect();
        return {
          x: secRect.left - stageRect.left + secRect.width / 2,
          topY: secRect.top - stageRect.top + (isProjector ? 66 : 56),
          width: Math.max(120, secRect.width - 28),
        };
      });
      setFlightGeometry({
        deckX: deckRect.left - stageRect.left + deckRect.width / 2,
        deckY: deckRect.top - stageRect.top + deckRect.height / 2,
        targets,
      });
    };

    measure();
    if (typeof window === "undefined") return;
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [
    isCardDealAnimating,
    prefersReducedMotion,
    groups,
    isProjector,
    generationCount,
  ]);
  const minglePlan =
    isAnimating && playback.mode === "group-yourselves"
      ? playback.minglePlan
      : null;
  const isMingleAnimating = Boolean(minglePlan);
  const isClusterBeat = playback.mingleBeat === "cluster";
  const settledFromMingle =
    playback.phase === "settled" && playback.mode === "group-yourselves";

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
          <div ref={dealStageRef} className="relative flex flex-col gap-gutter-md">
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
                      <div className="inline-flex items-center gap-gutter-md px-gutter-md py-gutter-xs rounded-md bg-surface-container-low border border-outline-variant shadow-xs">
                        <div
                          ref={dealerDeckRef}
                          aria-hidden="true"
                          className={`relative shrink-0 ${
                            isProjector ? "w-14 h-20" : "w-11 h-16"
                          }`}
                        >
                          {deckThicknessLayers > 0 ? (
                            Array.from({ length: deckThicknessLayers }).map(
                              (_, layerIdx) => {
                                const isTop =
                                  layerIdx === deckThicknessLayers - 1;
                                const offsetPx =
                                  (deckThicknessLayers - 1 - layerIdx) * 2.5;
                                return (
                                  <div
                                    key={layerIdx}
                                    style={{
                                      transform: `translate3d(${offsetPx}px, ${offsetPx}px, 0)`,
                                    }}
                                    className={`absolute inset-0 rounded border border-surface-container-lowest/80 bg-primary classroom-dealer-card-back shadow-xs flex items-center justify-center ${
                                      isTop ? "classroom-dealer-deck-top" : ""
                                    }`}
                                  >
                                    {isTop && (
                                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-surface-container-lowest/15 border border-surface-container-lowest/35 text-on-primary">
                                        <span className="material-symbols-outlined text-body-md">
                                          style
                                        </span>
                                      </span>
                                    )}
                                  </div>
                                );
                              },
                            )
                          ) : (
                            <div className="absolute inset-0 rounded border border-dashed border-outline-variant/70 bg-surface-container/60" />
                          )}
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-title text-label-lg text-on-surface">
                            Dealer Deck
                          </span>
                          <span className="inline-flex items-center self-start px-gutter-sm py-0.5 rounded-full bg-secondary text-on-secondary font-mono text-label-sm tabular-nums">
                            {remainingCards}{" "}
                            {remainingCards === 1 ? "card" : "cards"} left
                          </span>
                        </div>
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

            {isMingleAnimating && minglePlan ? (
              <div
                aria-label="Group Yourselves floor stage"
                aria-busy="true"
                className={`relative w-full rounded-md border border-outline-variant bg-surface-container-low overflow-hidden select-none ${
                  isProjector
                    ? FLOOR_HEIGHT_CLASS[minglePlan.densityTier].projector
                    : FLOOR_HEIGHT_CLASS[minglePlan.densityTier].inline
                }`}
              >
                {/* Beat 2 group zone targets */}
                {minglePlan.zones.map((zone) => {
                  const isEmeraldZone = zone.groupIndex % 2 === 0;
                  return (
                    <div
                      key={zone.groupIndex}
                      data-beat={isClusterBeat ? "cluster" : "mingle"}
                      aria-hidden="true"
                      style={{
                        left: `${zone.leftPct}%`,
                        top: `${zone.topPct}%`,
                        width: `${zone.widthPct}%`,
                        height: `${zone.heightPct}%`,
                      }}
                      className={`classroom-mingle-zone absolute rounded-md border p-gutter-xs sm:p-gutter-sm flex flex-col justify-between ${
                        isClusterBeat
                          ? isEmeraldZone
                            ? "border-primary/45 bg-primary/[0.06]"
                            : "border-secondary/45 bg-secondary/[0.06]"
                          : "border-dashed border-outline-variant/60 bg-surface-container/30"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-gutter-xs">
                        <span
                          className={`font-title truncate ${
                            isProjector ? "text-title-md" : "text-label-md"
                          } ${
                            isClusterBeat
                              ? isEmeraldZone
                                ? "text-primary"
                                : "text-secondary"
                              : "text-on-surface-variant"
                          }`}
                        >
                          {zone.label}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded-full font-mono text-label-sm tabular-nums ${
                            isClusterBeat
                              ? isEmeraldZone
                                ? "bg-primary/15 text-primary"
                                : "bg-secondary/15 text-secondary"
                              : "bg-surface-container-lowest/70 text-on-surface-variant"
                          }`}
                        >
                          {zone.studentCount}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* Compositor-only student chips gliding from mingle positions to group zones */}
                {minglePlan.chips.map((chip, idx) => {
                  const isEmeraldZone = chip.groupIndex % 2 === 0;
                  const x = isClusterBeat ? chip.targetX : chip.mingleX;
                  const y = isClusterBeat ? chip.targetY : chip.mingleY;
                  const glideMs = Math.max(
                    420,
                    minglePlan.clusterDurationMs - chip.clusterDelayMs - 140,
                  );
                  const slotStyle = {
                    transform: `translate3d(${x}%, ${y}%, 0)`,
                    "--cluster-duration": `${glideMs}ms`,
                    "--cluster-delay": `${chip.clusterDelayMs}ms`,
                  } as CSSProperties;
                  const chipStyle = {
                    "--drift-x": `${chip.driftX}px`,
                    "--drift-y": `${chip.driftY}px`,
                    "--drift-duration": `${1100 + (idx % 5) * 140}ms`,
                  } as CSSProperties;
                  const chipSizeClass = isProjector
                    ? CHIP_SIZE_CLASS[minglePlan.densityTier].projector
                    : CHIP_SIZE_CLASS[minglePlan.densityTier].inline;

                  return (
                    <div
                      key={`${chip.student.index}-${chip.groupIndex}-${chip.studentIndex}`}
                      data-beat={isClusterBeat ? "cluster" : "mingle"}
                      style={slotStyle}
                      className="classroom-mingle-slot"
                    >
                      <div className="classroom-mingle-anchor">
                        <span
                          data-beat={isClusterBeat ? "cluster" : "mingle"}
                          style={chipStyle}
                          className={`classroom-mingle-chip inline-flex items-center gap-1.5 rounded-full border font-body font-medium shadow-xs truncate ${chipSizeClass} ${
                            isClusterBeat
                              ? isEmeraldZone
                                ? "bg-surface-container-lowest border-primary/60 text-on-surface"
                                : "bg-surface-container-lowest border-secondary/60 text-on-surface"
                              : "bg-surface-container-lowest border-outline-variant text-on-surface"
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`shrink-0 w-2 h-2 rounded-full ${
                              isClusterBeat
                                ? isEmeraldZone
                                  ? "bg-primary"
                                  : "bg-secondary"
                                : "bg-outline"
                            }`}
                          />
                          <span className="truncate">{chip.student.name}</span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <>
                {isCardDealAnimating &&
                  !prefersReducedMotion &&
                  flightGeometry &&
                  inFlightCards.length > 0 && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 z-20 overflow-visible"
                    >
                      {inFlightCards.map((flight) => {
                        const target =
                          flightGeometry.targets[flight.step.groupIndex];
                        if (!target) return null;
                        const p = flight.progress;
                        const eased = easeOutCubic(p);
                        const targetY =
                          target.topY +
                          flight.step.studentIndex * solitaireStyle.slotStepPx;
                        const x =
                          flightGeometry.deckX +
                          (target.x - flightGeometry.deckX) * eased;
                        const arcLift =
                          Math.sin(p * Math.PI) * (isProjector ? 34 : 26);
                        const y =
                          flightGeometry.deckY +
                          (targetY - flightGeometry.deckY) * eased -
                          arcLift;
                        const tiltDeg =
                          (flight.step.dealOrder % 2 === 0 ? -9 : 9) *
                          (1 - eased);
                        const scale = 0.68 + 0.32 * eased;
                        const flipProgress =
                          p <= 0.45 ? 0 : Math.min(1, (p - 0.45) / 0.55);
                        const flipDeg = flipProgress * 180;
                        const cardWidth = Math.min(
                          Math.max(150, target.width),
                          isProjector ? 260 : 210,
                        );
                        const isEmeraldGroup =
                          flight.step.groupIndex % 2 === 0;
                        const suit =
                          SOLITAIRE_SUITS[
                            flight.step.groupIndex % SOLITAIRE_SUITS.length
                          ] ?? "♠";

                        return (
                          <div
                            key={flight.step.dealOrder}
                            className="classroom-deal-flight-card"
                            style={{
                              width: `${cardWidth}px`,
                              transform: `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) rotate(${tiltDeg}deg) scale(${scale})`,
                              zIndex: 20 + flight.step.dealOrder,
                            }}
                          >
                            <div
                              className="classroom-deal-flight-inner"
                              style={{
                                transform: `rotateY(${flipDeg}deg)`,
                              }}
                            >
                              <div className="classroom-deal-flight-face rounded-md border border-surface-container-lowest/80 bg-primary classroom-dealer-card-back shadow-md flex items-center justify-center">
                                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-surface-container-lowest/15 border border-surface-container-lowest/35 text-on-primary">
                                  <span className="material-symbols-outlined text-title-md">
                                    style
                                  </span>
                                </span>
                              </div>
                              <div
                                className={`classroom-deal-flight-face classroom-deal-flight-front rounded-md border bg-surface-container-lowest shadow-md flex flex-col justify-between p-2.5 ${
                                  isEmeraldGroup
                                    ? "border-primary/45"
                                    : "border-secondary/45"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-gutter-xs">
                                  <span className="flex items-baseline gap-1.5 min-w-0">
                                    <span
                                      className={`shrink-0 font-mono text-label-sm tabular-nums ${
                                        isEmeraldGroup
                                          ? "text-primary"
                                          : "text-secondary"
                                      }`}
                                    >
                                      {flight.step.studentIndex + 1}
                                      {suit}
                                    </span>
                                    <span
                                      className={`font-body font-medium text-on-surface leading-snug truncate ${solitaireStyle.nameText}`}
                                    >
                                      {flight.step.student.name}
                                    </span>
                                  </span>
                                </div>
                                <div className="flex items-center justify-between pt-1 border-t border-outline-variant/40 text-label-sm text-on-surface-variant">
                                  <span className="font-label">
                                    Group {flight.step.groupIndex + 1}
                                  </span>
                                  <span
                                    className={
                                      isEmeraldGroup
                                        ? "text-primary"
                                        : "text-secondary"
                                    }
                                  >
                                    {suit}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

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
                    const isEmeraldGroup = groupIndex % 2 === 0;
                    const suit =
                      SOLITAIRE_SUITS[groupIndex % SOLITAIRE_SUITS.length] ??
                      "♠";

                    return (
                      <section
                        key={groupIndex}
                        ref={(el) => {
                          groupSectionRefs.current[groupIndex] = el;
                        }}
                        aria-label={`Group ${groupIndex + 1}`}
                        className="p-gutter-md rounded-md border border-outline-variant bg-surface-container-low flex flex-col gap-gutter-sm"
                      >
                        <h3
                          className={`font-title text-on-surface flex items-center justify-between ${
                            isProjector ? "text-title-lg" : "text-title-md"
                          }`}
                        >
                          <span className="inline-flex items-center gap-gutter-xs">
                            {isSolitaireLayout && (
                              <span
                                aria-hidden="true"
                                className={`inline-flex items-center justify-center w-6 h-6 rounded-sm text-label-md font-bold ${
                                  isEmeraldGroup
                                    ? "bg-primary/12 text-primary"
                                    : "bg-secondary/12 text-secondary"
                                }`}
                              >
                                {suit}
                              </span>
                            )}
                            <span>Group {groupIndex + 1}</span>
                          </span>
                          <span className="px-gutter-sm py-0.5 rounded-full bg-surface-container-lowest border border-outline-variant font-mono text-label-sm tabular-nums">
                            {isAnimating
                              ? `${dealtInGroup}/${group.length}`
                              : group.length}
                          </span>
                        </h3>

                        {isSolitaireLayout ? (
                          <ul
                            className="flex flex-col pt-gutter-xs"
                            data-solitaire-density={solitaireTier}
                          >
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
                              const isLastCard =
                                studentIndex === group.length - 1;

                              return (
                                <li
                                  key={`${student.index}-${studentIndex}`}
                                  className={`relative ${
                                    studentIndex > 0
                                      ? solitaireStyle.overlap
                                      : ""
                                  }`}
                                  style={{
                                    zIndex: isSelected ? 30 : studentIndex + 1,
                                  }}
                                >
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
                                      className={`classroom-solitaire-card w-full text-left rounded-md border overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                                        isCardDealAnimating &&
                                        effectiveMode === "card-deal"
                                          ? "classroom-card-deal-in"
                                          : ""
                                      } ${
                                        isSelected
                                          ? "is-selected bg-primary text-on-primary border-primary ring-2 ring-primary/30 shadow-md"
                                          : isAnimating
                                            ? isEmeraldGroup
                                              ? "bg-surface-container-lowest border-primary/40 text-on-surface shadow-xs cursor-default"
                                              : "bg-surface-container-lowest border-secondary/40 text-on-surface shadow-xs cursor-default"
                                            : isEmeraldGroup
                                              ? "bg-surface-container-lowest border-outline-variant text-on-surface shadow-xs hover:border-primary"
                                              : "bg-surface-container-lowest border-outline-variant text-on-surface shadow-xs hover:border-secondary"
                                      }`}
                                    >
                                      <span
                                        className={`flex items-start justify-between gap-gutter-xs ${solitaireStyle.headerPad}`}
                                      >
                                        <span className="flex items-baseline gap-gutter-xs min-w-0">
                                          <span
                                            aria-hidden="true"
                                            className={`shrink-0 font-mono text-label-sm tabular-nums ${
                                              isSelected
                                                ? "text-on-primary/90"
                                                : isEmeraldGroup
                                                  ? "text-primary"
                                                  : "text-secondary"
                                            }`}
                                          >
                                            {studentIndex + 1}
                                            {suit}
                                          </span>
                                          <span
                                            className={`font-body leading-snug break-words ${solitaireStyle.nameText} ${
                                              isSelected
                                                ? "font-semibold text-on-primary"
                                                : "font-medium text-on-surface"
                                            }`}
                                          >
                                            {student.name}
                                          </span>
                                        </span>
                                        <span
                                          aria-hidden="true"
                                          className={`shrink-0 text-label-sm leading-none pt-0.5 ${
                                            isSelected
                                              ? "text-on-primary/85"
                                              : isEmeraldGroup
                                                ? "text-primary/60"
                                                : "text-secondary/60"
                                          }`}
                                        >
                                          {suit}
                                        </span>
                                      </span>
                                      <span
                                        aria-hidden="true"
                                        className={`flex items-end justify-between px-3 pb-1.5 border-t ${
                                          isLastCard
                                            ? solitaireStyle.lastApron
                                            : solitaireStyle.apron
                                        } ${
                                          isSelected
                                            ? "border-on-primary/20 bg-primary-container/25"
                                            : "border-outline-variant/35 bg-surface-container-low/45"
                                        }`}
                                      >
                                        {isLastCard && (
                                          <>
                                            <span
                                              className={`font-label text-label-sm ${
                                                isSelected
                                                  ? "text-on-primary/80"
                                                  : "text-on-surface-variant/75"
                                              }`}
                                            >
                                              Group {groupIndex + 1}
                                            </span>
                                            <span
                                              className={`font-mono text-label-sm tabular-nums ${
                                                isSelected
                                                  ? "text-on-primary/85"
                                                  : isEmeraldGroup
                                                    ? "text-primary/70"
                                                    : "text-secondary/70"
                                              }`}
                                            >
                                              {studentIndex + 1}
                                              {suit}
                                            </span>
                                          </>
                                        )}
                                      </span>
                                    </button>
                                  ) : (
                                    <div
                                      aria-hidden="true"
                                      className="w-full rounded-md border border-dashed border-outline-variant/60 bg-surface-container/45 select-none overflow-hidden"
                                    >
                                      <div className={solitaireStyle.headerPad}>
                                        <span
                                          className={`invisible block leading-snug ${solitaireStyle.nameText}`}
                                        >
                                          {student.name}
                                        </span>
                                      </div>
                                      <div
                                        className={
                                          isLastCard
                                            ? solitaireStyle.lastApron
                                            : solitaireStyle.apron
                                        }
                                      />
                                    </div>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
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
                                        isAnimating &&
                                        effectiveMode === "card-deal"
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
                        )}
                      </section>
                    );
                  })}
                </div>
              </>
            )}
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
