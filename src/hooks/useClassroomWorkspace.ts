import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { flushSync } from "react-dom";
import {
  createClassroomAudioPlayer,
  type ClassroomAudioPlayer,
} from "../engine/classroomAudio";
import {
  loadClassroomPreferences,
  resolveEffectiveGroupMode,
  resolveEffectivePickerMode,
  saveClassroomPreferences,
  shouldPlayClassroomCue,
  type ClassroomPreferences,
  type GroupAnimationMode,
  type PickerAnimationMode,
} from "../engine/classroomPreferences";
import {
  filterPresentStudents,
  generateStudentGroups,
  swapGroupStudents,
  type GroupGenerationOptions,
  type GroupSlot,
  type RosterStudent,
} from "../engine/classroomTools";
import {
  advanceGroupPlayback,
  INITIAL_GROUP_PLAYBACK_STATE,
  isGroupSwapAllowed,
  shouldPlayCardDealTick,
  skipGroupPlayback,
  startGroupPlayback,
  type GroupPlaybackState,
} from "../engine/groupAnimation";
import {
  commitPendingDraw,
  createInitialPickerState,
  isPickerLocked,
  resetPickerPool,
  sampleCardFlipFrame,
  sampleSlotReelWindow,
  startPickerDraw,
  type CardFlipFrame,
  type PickerLifecycleState,
  type SlotReelWindow,
} from "../engine/pickerAnimation";
import { type ClassSection, type GradeLevel } from "../engine/types";
import type { ClassroomTimerState } from "./useClassroomTimer";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

export type ToolTab = "picker" | "groups" | "timer";

export const TOOL_TABS: ReadonlyArray<{
  id: ToolTab;
  label: string;
  icon: string;
}> = [
  { id: "picker", label: "Random Student Picker", icon: "casino" },
  { id: "groups", label: "Group Maker", icon: "diversity_3" },
  { id: "timer", label: "Classroom Timer", icon: "timer" },
];

export interface ClassroomStatusState {
  tone: "success" | "error";
  text: string;
}

export interface RevealedMysteryCard {
  drawId: number;
  cardCount: number;
  chosenSlotIndex: number;
  winner: RosterStudent;
}

export interface SectionFormState {
  id?: string;
  gradeLevel: GradeLevel;
  sectionName: string;
  rosterText: string;
}

export function emptySectionForm(): SectionFormState {
  return { gradeLevel: 7, sectionName: "", rosterText: "" };
}

export function formFromSection(section: ClassSection): SectionFormState {
  return {
    id: section.id,
    gradeLevel: section.gradeLevel,
    sectionName: section.sectionName,
    rosterText: section.students.join("\n"),
  };
}

export function parseRosterText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string; message?: string };
    return data.error || data.message || `Request failed (HTTP ${res.status}).`;
  } catch {
    return `Request failed (HTTP ${res.status}).`;
  }
}

export function useClassroomWorkspace(
  timer: ClassroomTimerState,
  openTimerTabSignal = 0,
) {
  const stageRefs = useRef<Record<ToolTab, HTMLDivElement | null>>({
    picker: null,
    groups: null,
    timer: null,
  });
  const tabRefs = useRef<Record<ToolTab, HTMLButtonElement | null>>({
    picker: null,
    groups: null,
    timer: null,
  });

  const prefersReducedMotion = usePrefersReducedMotion();
  const [preferences, setPreferences] = useState<ClassroomPreferences>(() =>
    loadClassroomPreferences(),
  );
  const classroomAudio: ClassroomAudioPlayer = useMemo(
    () => createClassroomAudioPlayer(),
    [],
  );

  const [sections, setSections] = useState<ClassSection[]>([]);
  const [selectedSectionId, setSelectedSectionIdState] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ClassroomStatusState | null>(null);
  const [showSectionForm, setShowSectionForm] = useState(false);
  const [sectionForm, setSectionForm] = useState<SectionFormState>(
    emptySectionForm,
  );
  const [savingSection, setSavingSection] = useState(false);

  const [activeTab, setActiveTab] = useState<ToolTab>("picker");
  const [absentIndices, setAbsentIndices] = useState<Set<number>>(
    () => new Set(),
  );

  const [removePickedFromPool, setRemovePickedFromPoolState] = useState(true);
  const [pickerState, setPickerState] = useState<PickerLifecycleState>(
    createInitialPickerState,
  );
  const pickerStateRef = useRef<PickerLifecycleState>(pickerState);
  const pickerRafRef = useRef<number | null>(null);
  const [pickerReelWindow, setPickerReelWindow] =
    useState<SlotReelWindow | null>(null);
  const [pickerLastLandedWindow, setPickerLastLandedWindow] =
    useState<SlotReelWindow | null>(null);
  const [pickerCardFlipFrame, setPickerCardFlipFrame] =
    useState<CardFlipFrame | null>(null);
  const [pickerRevealedCard, setPickerRevealedCard] =
    useState<RevealedMysteryCard | null>(null);
  const [pickerRevealCount, setPickerRevealCount] = useState(0);

  const updatePickerState = useCallback((next: PickerLifecycleState) => {
    pickerStateRef.current = next;
    setPickerState(next);
  }, []);

  const cancelPickerFrame = useCallback(() => {
    if (pickerRafRef.current !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(pickerRafRef.current);
      pickerRafRef.current = null;
    }
  }, []);

  const [groupMode, setGroupMode] =
    useState<GroupGenerationOptions["mode"]>("count");
  const [groupValue, setGroupValue] = useState<number>(4);
  const [groups, setGroups] = useState<RosterStudent[][]>([]);
  const [swapSelection, setSwapSelection] = useState<GroupSlot | null>(null);
  const [groupPlayback, setGroupPlayback] = useState<GroupPlaybackState>(
    INITIAL_GROUP_PLAYBACK_STATE,
  );
  const [groupGenerationCount, setGroupGenerationCount] = useState(0);
  const groupRafRef = useRef<number | null>(null);

  const [projectorOverlayTab, setProjectorOverlayTab] =
    useState<ToolTab | null>(null);
  const [nativeFullscreenTab, setNativeFullscreenTab] =
    useState<ToolTab | null>(null);

  const isGroupAnimating = groupPlayback.phase === "animating";
  const isGroupAnimatingRef = useRef(isGroupAnimating);
  isGroupAnimatingRef.current = isGroupAnimating;

  const { setSoundEnabled: setTimerSoundEnabled } = timer;
  useEffect(() => {
    setTimerSoundEnabled(preferences.soundEnabled);
  }, [setTimerSoundEnabled, preferences.soundEnabled]);

  const cancelGroupAnimation = useCallback(() => {
    if (groupRafRef.current !== null) {
      cancelAnimationFrame(groupRafRef.current);
      groupRafRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cancelPickerFrame();
      cancelGroupAnimation();
      classroomAudio.dispose();
    };
  }, [cancelPickerFrame, cancelGroupAnimation, classroomAudio]);

  useEffect(() => {
    if (prefersReducedMotion && groupPlayback.phase === "animating") {
      cancelGroupAnimation();
      setGroupPlayback((prev) => skipGroupPlayback(prev));
    }
  }, [prefersReducedMotion, groupPlayback.phase, cancelGroupAnimation]);

  useEffect(() => {
    if (openTimerTabSignal > 0) {
      setActiveTab("timer");
    }
  }, [openTimerTabSignal]);

  const updatePreferences = useCallback(
    (updater: (prev: ClassroomPreferences) => ClassroomPreferences) => {
      setPreferences((prev) => {
        const next = updater(prev);
        saveClassroomPreferences(next);
        return next;
      });
    },
    [],
  );

  const setPickerAnimationMode = useCallback(
    (pickerMode: PickerAnimationMode) => {
      if (isPickerLocked(pickerStateRef.current)) return;
      setPickerRevealedCard(null);
      updatePreferences((prev) => ({ ...prev, pickerMode }));
    },
    [updatePreferences],
  );

  const setGroupAnimationMode = useCallback(
    (groupModePref: GroupAnimationMode) => {
      if (isGroupAnimatingRef.current) return;
      updatePreferences((prev) => ({ ...prev, groupMode: groupModePref }));
    },
    [updatePreferences],
  );

  const toggleSound = useCallback(() => {
    updatePreferences((prev) => ({
      ...prev,
      soundEnabled: !prev.soundEnabled,
    }));
  }, [updatePreferences]);

  const reportError = useCallback((err: unknown) => {
    setStatus({
      tone: "error",
      text: `Error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }, []);

  const loadSections = useCallback(async (preferredId?: string) => {
    const res = await fetch("/api/class-sections");
    if (!res.ok) throw new Error(await readErrorMessage(res));
    const list = (await res.json()) as ClassSection[];
    setSections(list);
    setSelectedSectionIdState((prev) => {
      const target = preferredId ?? prev;
      if (target && list.some((s) => s.id === target)) return target;
      return list[0]?.id ?? "";
    });
  }, []);

  const setSelectedSectionId = useCallback((id: string) => {
    if (isPickerLocked(pickerStateRef.current) || isGroupAnimatingRef.current) {
      return;
    }
    setSelectedSectionIdState(id);
  }, []);

  const setRemovePickedFromPool = useCallback((checked: boolean) => {
    if (isPickerLocked(pickerStateRef.current)) return;
    setPickerRevealedCard(null);
    setRemovePickedFromPoolState(checked);
  }, []);

  const setPoolExhausted = useCallback(
    (exhausted: boolean) => {
      if (isPickerLocked(pickerStateRef.current)) return;
      updatePickerState({
        ...pickerStateRef.current,
        poolExhausted: exhausted,
      });
    },
    [updatePickerState],
  );

  useEffect(() => {
    let active = true;
    void loadSections()
      .catch((err) => {
        if (active) reportError(err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadSections, reportError]);

  const activeSection = useMemo(
    () => sections.find((s) => s.id === selectedSectionId) ?? null,
    [sections, selectedSectionId],
  );

  const resetRosterState = useCallback(() => {
    cancelPickerFrame();
    cancelGroupAnimation();
    setAbsentIndices(new Set());
    updatePickerState(createInitialPickerState());
    setPickerReelWindow(null);
    setPickerLastLandedWindow(null);
    setPickerCardFlipFrame(null);
    setPickerRevealedCard(null);
    setPickerRevealCount(0);
    setGroups([]);
    setSwapSelection(null);
    setGroupPlayback(INITIAL_GROUP_PLAYBACK_STATE);
    setGroupGenerationCount(0);
  }, [cancelPickerFrame, cancelGroupAnimation, updatePickerState]);

  useEffect(() => {
    resetRosterState();
  }, [selectedSectionId, resetRosterState]);

  const presentStudents = useMemo(
    () =>
      activeSection
        ? filterPresentStudents(activeSection.students, absentIndices)
        : [],
    [activeSection, absentIndices],
  );

  const usedIndices = pickerState.usedIndices;
  const pickedStudent = pickerState.pickedStudent;
  const poolExhausted = pickerState.poolExhausted;
  const isPickerAnimating = isPickerLocked(pickerState);
  const isAnyPlaybackActive = isPickerAnimating || isGroupAnimating;

  const remainingInPoolCount = useMemo(() => {
    if (!removePickedFromPool) return presentStudents.length;
    return presentStudents.filter((s) => !usedIndices.has(s.index)).length;
  }, [presentStudents, usedIndices, removePickedFromPool]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const currentEl = document.fullscreenElement;
      if (!currentEl) {
        setNativeFullscreenTab(null);
        return;
      }
      const matchedTab =
        (Object.keys(stageRefs.current) as ToolTab[]).find(
          (tab) => stageRefs.current[tab] === currentEl,
        ) ?? null;
      setNativeFullscreenTab(matchedTab);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!projectorOverlayTab) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setProjectorOverlayTab(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [projectorOverlayTab]);

  useEffect(() => {
    if (!projectorOverlayTab) return;
    const el = stageRefs.current[projectorOverlayTab];
    if (el && !el.contains(document.activeElement)) {
      el.focus();
    }
  }, [projectorOverlayTab]);

  useEffect(() => {
    if (projectorOverlayTab && projectorOverlayTab !== activeTab) {
      setProjectorOverlayTab(null);
    }
    if (
      nativeFullscreenTab &&
      nativeFullscreenTab !== activeTab &&
      document.fullscreenElement
    ) {
      void document.exitFullscreen().catch(() => {});
    }
  }, [activeTab, projectorOverlayTab, nativeFullscreenTab]);

  useEffect(() => {
    if (
      !activeSection &&
      (projectorOverlayTab === "picker" || projectorOverlayTab === "groups")
    ) {
      setProjectorOverlayTab(null);
    }
  }, [activeSection, projectorOverlayTab]);

  async function handleSaveSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPickerLocked(pickerStateRef.current) || isGroupAnimatingRef.current) {
      return;
    }
    setSavingSection(true);
    setStatus(null);
    try {
      const students = parseRosterText(sectionForm.rosterText);
      const isEdit = Boolean(sectionForm.id);
      const url = isEdit
        ? `/api/class-sections/${encodeURIComponent(sectionForm.id!)}`
        : "/api/class-sections";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gradeLevel: sectionForm.gradeLevel,
          sectionName: sectionForm.sectionName,
          students,
        }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const saved = (await res.json()) as ClassSection;
      setShowSectionForm(false);
      setSectionForm(emptySectionForm());
      if (isEdit && saved.id === selectedSectionId) {
        resetRosterState();
      }
      await loadSections(saved.id);
      setStatus({
        tone: "success",
        text: isEdit
          ? `Class Section "${saved.sectionName}" updated.`
          : `Class Section "${saved.sectionName}" saved to local disk.`,
      });
    } catch (err) {
      reportError(err);
    } finally {
      setSavingSection(false);
    }
  }

  async function handleDeleteSection() {
    if (
      !activeSection ||
      isPickerLocked(pickerStateRef.current) ||
      isGroupAnimatingRef.current
    ) {
      return;
    }
    setStatus(null);
    try {
      const res = await fetch(
        `/api/class-sections/${encodeURIComponent(activeSection.id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const deletedName = activeSection.sectionName;
      await loadSections();
      setShowSectionForm(false);
      setStatus({
        tone: "success",
        text: `Class Section "${deletedName}" deleted.`,
      });
    } catch (err) {
      reportError(err);
    }
  }

  function clearAfterAttendanceChange() {
    setPoolExhausted(false);
    setPickerLastLandedWindow(null);
    setPickerRevealedCard(null);
    setGroups([]);
    setSwapSelection(null);
    setGroupPlayback(INITIAL_GROUP_PLAYBACK_STATE);
  }

  function toggleAbsent(index: number) {
    if (isPickerLocked(pickerStateRef.current) || isGroupAnimatingRef.current) {
      return;
    }
    setAbsentIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
    clearAfterAttendanceChange();
  }

  function resetAllAttendance() {
    if (isPickerLocked(pickerStateRef.current) || isGroupAnimatingRef.current) {
      return;
    }
    setAbsentIndices(new Set());
    clearAfterAttendanceChange();
  }

  const canPlayClassroomCue = useCallback(
    (isInstant = false) =>
      shouldPlayClassroomCue({
        soundEnabled: preferences.soundEnabled,
        prefersReducedMotion,
        isInstant,
      }),
    [preferences.soundEnabled, prefersReducedMotion],
  );
  const canPlayClassroomCueRef = useRef(canPlayClassroomCue);
  canPlayClassroomCueRef.current = canPlayClassroomCue;

  const finalizePickerDraw = useCallback(
    (expectedDrawId?: number, playChime = true) => {
      cancelPickerFrame();
      const pending = pickerStateRef.current.pendingDraw;
      const landedWindow =
        pending?.mode === "slot" ? sampleSlotReelWindow(pending.plan, 1) : null;
      const revealedCard: RevealedMysteryCard | null =
        pending?.mode === "card-flip"
          ? {
              drawId: pending.drawId,
              cardCount: pending.plan.cardCount,
              chosenSlotIndex: pending.plan.chosenSlotIndex,
              winner: pending.winner,
            }
          : null;
      const committed = commitPendingDraw(
        pickerStateRef.current,
        expectedDrawId,
      );
      if (!committed.committed) return;

      updatePickerState(committed.state);
      setPickerReelWindow(null);
      setPickerCardFlipFrame(null);
      setPickerLastLandedWindow(landedWindow);
      setPickerRevealedCard(revealedCard);
      setPickerRevealCount((count) => count + 1);
      if (playChime && canPlayClassroomCueRef.current(false)) {
        classroomAudio.playRevealChime();
      }
    },
    [cancelPickerFrame, classroomAudio, updatePickerState],
  );

  useEffect(() => {
    const pendingDraw = pickerState.pendingDraw;
    if (!pendingDraw) return;

    if (prefersReducedMotion) {
      finalizePickerDraw(pendingDraw.drawId, false);
      return;
    }

    let cancelled = false;
    const startTime = performance.now();

    if (pendingDraw.mode === "card-flip") {
      const plan = pendingDraw.plan;
      let lastShuffleStep = -1;
      let lastPhase: CardFlipFrame["phase"] | null = null;
      let lastActiveSlot = -1;
      let playedFlipSound = false;

      if (plan.shuffleDurationMs === 0) {
        playedFlipSound = true;
        if (canPlayClassroomCueRef.current(false)) {
          classroomAudio.playCardFlip();
        }
      }

      const tickCardFlip = (now: number) => {
        if (cancelled) return;
        const frame = sampleCardFlipFrame(plan, now - startTime);

        if (
          frame.phase === "shuffling" &&
          frame.shuffleStep > lastShuffleStep
        ) {
          lastShuffleStep = frame.shuffleStep;
          if (canPlayClassroomCueRef.current(false)) {
            classroomAudio.playCardDeal(frame.progress);
          }
        }

        if (frame.phase === "flipping" && !playedFlipSound) {
          playedFlipSound = true;
          if (canPlayClassroomCueRef.current(false)) {
            classroomAudio.playCardFlip();
          }
        }

        if (frame.isComplete) {
          finalizePickerDraw(pendingDraw.drawId, true);
          return;
        }

        if (
          frame.phase !== lastPhase ||
          frame.activeSlotIndex !== lastActiveSlot
        ) {
          lastPhase = frame.phase;
          lastActiveSlot = frame.activeSlotIndex;
          setPickerCardFlipFrame(frame);
        }

        pickerRafRef.current = window.requestAnimationFrame(tickCardFlip);
      };

      pickerRafRef.current = window.requestAnimationFrame(tickCardFlip);

      return () => {
        cancelled = true;
        cancelPickerFrame();
      };
    }

    let lastStepIndex = 0;
    let lastTickSoundAt = 0;

    if (
      pendingDraw.plan.isSingleStudentSpotlight &&
      canPlayClassroomCueRef.current(false)
    ) {
      classroomAudio.playReelTick(0.85);
    }

    const tick = (now: number) => {
      if (cancelled) return;
      const progress = Math.min(
        1,
        (now - startTime) / pendingDraw.plan.durationMs,
      );
      const frame = sampleSlotReelWindow(pendingDraw.plan, progress);

      if (
        !pendingDraw.plan.isSingleStudentSpotlight &&
        frame.stepIndex > lastStepIndex
      ) {
        lastStepIndex = frame.stepIndex;
        if (
          now - lastTickSoundAt >= 42 &&
          canPlayClassroomCueRef.current(false)
        ) {
          lastTickSoundAt = now;
          classroomAudio.playReelTick(frame.progress);
        }
      }

      if (frame.isComplete) {
        finalizePickerDraw(pendingDraw.drawId, true);
        return;
      }

      setPickerReelWindow(frame);
      pickerRafRef.current = window.requestAnimationFrame(tick);
    };

    pickerRafRef.current = window.requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelPickerFrame();
    };
  }, [
    pickerState.pendingDraw,
    prefersReducedMotion,
    classroomAudio,
    cancelPickerFrame,
    finalizePickerDraw,
  ]);

  function triggerPickerDraw(requestedSlotIndex?: number) {
    if (isPickerLocked(pickerStateRef.current)) return;

    const effectiveMode = resolveEffectivePickerMode(
      preferences.pickerMode,
      prefersReducedMotion,
    );
    if (canPlayClassroomCue(effectiveMode === "instant")) {
      classroomAudio.unlock();
    }

    const result = startPickerDraw(pickerStateRef.current, {
      presentStudents,
      removeFromPool: removePickedFromPool,
      effectiveMode,
      requestedSlotIndex,
    });

    if (result.outcome === "ignored-locked") return;
    updatePickerState(result.state);

    if (result.outcome === "instant-revealed") {
      setPickerReelWindow(null);
      setPickerLastLandedWindow(null);
      setPickerCardFlipFrame(null);
      setPickerRevealedCard(null);
      setPickerRevealCount((count) => count + 1);
    } else if (result.outcome === "animating") {
      setPickerLastLandedWindow(null);
      setPickerRevealedCard(null);
      if (result.pendingDraw.mode === "card-flip") {
        setPickerReelWindow(null);
        setPickerCardFlipFrame(sampleCardFlipFrame(result.pendingDraw.plan, 0));
      } else {
        setPickerCardFlipFrame(null);
        setPickerReelWindow(sampleSlotReelWindow(result.pendingDraw.plan, 0));
      }
    }
  }

  function handlePickStudent() {
    triggerPickerDraw();
  }

  function handlePickCardSlot(slotIndex: number) {
    triggerPickerDraw(slotIndex);
  }

  function handleSkipPicker() {
    finalizePickerDraw(undefined, true);
  }

  function handleResetPool() {
    if (isPickerLocked(pickerStateRef.current)) return;
    updatePickerState(resetPickerPool(pickerStateRef.current));
    setPickerReelWindow(null);
    setPickerLastLandedWindow(null);
    setPickerCardFlipFrame(null);
    setPickerRevealedCard(null);
    setPickerRevealCount(0);
  }

  function handleGenerateGroups() {
    if (isGroupAnimating) return;
    cancelGroupAnimation();
    const next = generateStudentGroups(presentStudents, {
      mode: groupMode,
      value: groupValue,
    });
    setGroups(next);
    setSwapSelection(null);

    if (next.length === 0) {
      setGroupPlayback(INITIAL_GROUP_PLAYBACK_STATE);
      return;
    }

    setGroupGenerationCount((count) => count + 1);

    const activeMode = resolveEffectiveGroupMode(
      preferences.groupMode,
      prefersReducedMotion,
    );
    const isInstant = activeMode === "instant";
    if (!isInstant && canPlayClassroomCueRef.current(false)) {
      classroomAudio.unlock();
    }

    const initial = startGroupPlayback(
      next,
      preferences.groupMode,
      prefersReducedMotion,
    );
    setGroupPlayback(initial);

    if (initial.phase !== "animating") {
      return;
    }

    let currentState = initial;
    let lastRevealed = 0;
    let lastTickAt = -1;
    const startedAt = performance.now();

    const stepFrame = (now: number) => {
      const nextState = advanceGroupPlayback(currentState, now - startedAt);
      if (
        currentState.mode === "card-deal" &&
        currentState.plan &&
        shouldPlayCardDealTick(
          lastRevealed,
          nextState.revealedCount,
          now,
          lastTickAt,
        )
      ) {
        if (canPlayClassroomCueRef.current(false)) {
          classroomAudio.playCardDeal(
            nextState.revealedCount / currentState.plan.totalCards,
          );
        }
        lastTickAt = now;
      } else if (
        currentState.mode === "group-yourselves" &&
        currentState.mingleBeat === "mingle" &&
        nextState.mingleBeat === "cluster" &&
        nextState.phase === "animating"
      ) {
        if (canPlayClassroomCueRef.current(false)) {
          classroomAudio.playClusterCue();
        }
      }

      const changed =
        currentState.mode === "card-deal" ||
        nextState.revealedCount !== lastRevealed ||
        nextState.mingleBeat !== currentState.mingleBeat ||
        nextState.phase !== currentState.phase;
      currentState = nextState;
      lastRevealed = nextState.revealedCount;

      if (changed) {
        setGroupPlayback(nextState);
      }

      if (nextState.phase === "settled") {
        groupRafRef.current = null;
        if (canPlayClassroomCueRef.current(false)) {
          classroomAudio.playRevealChime();
        }
        return;
      }

      groupRafRef.current = requestAnimationFrame(stepFrame);
    };

    groupRafRef.current = requestAnimationFrame(stepFrame);
  }

  function handleSkipGroupAnimation() {
    cancelGroupAnimation();
    setGroupPlayback((prev) => skipGroupPlayback(prev));
  }

  function handleGroupStudentClick(slot: GroupSlot) {
    if (!isGroupSwapAllowed(groupPlayback, groups.length)) {
      return;
    }
    if (!swapSelection) {
      setSwapSelection(slot);
      return;
    }
    if (
      swapSelection.groupIndex === slot.groupIndex &&
      swapSelection.studentIndex === slot.studentIndex
    ) {
      setSwapSelection(null);
      return;
    }
    setGroups((prev) => swapGroupStudents(prev, swapSelection, slot));
    setSwapSelection(null);
  }

  function handleCustomDurationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const total = timer.customMinutes * 60 + timer.customSeconds;
    if (total <= 0) {
      setStatus({
        tone: "error",
        text: "Error: Enter a custom timer duration greater than 0 seconds.",
      });
      return;
    }
    setStatus(null);
    timer.applyCustomTime();
  }

  const projectorTab: ToolTab | null =
    nativeFullscreenTab ?? projectorOverlayTab;

  async function exitProjectorView() {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    }
    setProjectorOverlayTab(null);
  }

  async function toggleProjectorView(tab: ToolTab) {
    if (projectorTab === tab) {
      await exitProjectorView();
      return;
    }
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    }
    setProjectorOverlayTab(null);

    if (activeTab !== tab) {
      // Flush tab switch synchronously so requestFullscreen keeps user activation on a visible stage.
      flushSync(() => {
        setActiveTab(tab);
      });
    }

    const el = stageRefs.current[tab];
    if (!el) return;

    if (typeof el.requestFullscreen === "function") {
      try {
        await el.requestFullscreen();
        return;
      } catch {
        // Fall through to full-viewport Escape-to-exit overlay when Fullscreen API is unavailable.
      }
    }
    setProjectorOverlayTab(tab);
  }

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    idx: number,
  ) {
    let nextIdx: number | null = null;
    if (event.key === "ArrowRight") nextIdx = (idx + 1) % TOOL_TABS.length;
    else if (event.key === "ArrowLeft")
      nextIdx = (idx - 1 + TOOL_TABS.length) % TOOL_TABS.length;
    else if (event.key === "Home") nextIdx = 0;
    else if (event.key === "End") nextIdx = TOOL_TABS.length - 1;

    if (nextIdx !== null) {
      event.preventDefault();
      const target = TOOL_TABS[nextIdx]!;
      setActiveTab(target.id);
      tabRefs.current[target.id]?.focus();
    }
  }

  const parsedFormCount = parseRosterText(sectionForm.rosterText).length;
  const effectivePickerMode = resolveEffectivePickerMode(
    preferences.pickerMode,
    prefersReducedMotion,
  );

  return {
    stageRefs,
    tabRefs,
    preferences,
    prefersReducedMotion,
    effectivePickerMode,
    soundEnabled: preferences.soundEnabled,
    setPickerAnimationMode,
    setGroupAnimationMode,
    toggleSound,
    classroomAudio,
    sections,
    selectedSectionId,
    setSelectedSectionId,
    activeSection,
    loading,
    status,
    showSectionForm,
    setShowSectionForm,
    sectionForm,
    setSectionForm,
    savingSection,
    parsedFormCount,
    activeTab,
    setActiveTab,
    absentIndices,
    presentStudents,
    removePickedFromPool,
    setRemovePickedFromPool,
    usedIndices,
    pickedStudent,
    poolExhausted,
    setPoolExhausted,
    remainingInPoolCount,
    isPickerAnimating,
    isAnyPlaybackActive,
    isPickerSingleSpotlight:
      pickerState.pendingDraw?.mode === "slot" &&
      pickerState.pendingDraw.plan.isSingleStudentSpotlight,
    pickerReelWindow,
    pickerLastLandedWindow,
    pickerCardFlipPlan:
      pickerState.pendingDraw?.mode === "card-flip"
        ? pickerState.pendingDraw.plan
        : null,
    pickerCardFlipDrawId:
      pickerState.pendingDraw?.mode === "card-flip"
        ? pickerState.pendingDraw.drawId
        : null,
    pickerCardFlipWinner:
      pickerState.pendingDraw?.mode === "card-flip"
        ? pickerState.pendingDraw.winner
        : null,
    pickerCardFlipFrame,
    pickerRevealedCard,
    pickerRevealCount,
    groupMode,
    setGroupMode,
    groupValue,
    setGroupValue,
    groups,
    swapSelection,
    groupPlayback,
    isGroupAnimating,
    groupGenerationCount,
    projectorTab,
    projectorOverlayTab,
    handleSaveSection,
    handleDeleteSection,
    toggleAbsent,
    resetAllAttendance,
    handlePickStudent,
    handlePickCardSlot,
    handleSkipPicker,
    handleResetPool,
    handleGenerateGroups,
    handleSkipGroupAnimation,
    handleGroupStudentClick,
    handleCustomDurationSubmit,
    toggleProjectorView,
    handleTabKeyDown,
  };
}
