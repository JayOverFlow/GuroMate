import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  drawRandomStudent,
  filterPresentStudents,
  generateStudentGroups,
  swapGroupStudents,
  type GroupGenerationOptions,
  type GroupSlot,
  type RosterStudent,
} from "../engine/classroomTools";
import { type ClassSection, type GradeLevel } from "../engine/types";
import type { ClassroomTimerState } from "./useClassroomTimer";

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
  const timerBoxRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<ToolTab, HTMLButtonElement | null>>({
    picker: null,
    groups: null,
    timer: null,
  });

  const [sections, setSections] = useState<ClassSection[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");
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

  const [removePickedFromPool, setRemovePickedFromPool] = useState(true);
  const [usedIndices, setUsedIndices] = useState<Set<number>>(() => new Set());
  const [pickedStudent, setPickedStudent] = useState<RosterStudent | null>(
    null,
  );
  const [poolExhausted, setPoolExhausted] = useState(false);

  const [groupMode, setGroupMode] =
    useState<GroupGenerationOptions["mode"]>("count");
  const [groupValue, setGroupValue] = useState<number>(4);
  const [groups, setGroups] = useState<RosterStudent[][]>([]);
  const [swapSelection, setSwapSelection] = useState<GroupSlot | null>(null);

  const [isFullscreenOverlay, setIsFullscreenOverlay] = useState(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);

  useEffect(() => {
    if (openTimerTabSignal > 0) {
      setActiveTab("timer");
    }
  }, [openTimerTabSignal]);

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
    setSelectedSectionId((prev) => {
      const target = preferredId ?? prev;
      if (target && list.some((s) => s.id === target)) return target;
      return list[0]?.id ?? "";
    });
  }, []);

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
    setAbsentIndices(new Set());
    setUsedIndices(new Set());
    setPickedStudent(null);
    setPoolExhausted(false);
    setGroups([]);
    setSwapSelection(null);
  }, []);

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

  const remainingInPoolCount = useMemo(() => {
    if (!removePickedFromPool) return presentStudents.length;
    return presentStudents.filter((s) => !usedIndices.has(s.index)).length;
  }, [presentStudents, usedIndices, removePickedFromPool]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsNativeFullscreen(document.fullscreenElement === timerBoxRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!isFullscreenOverlay) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setIsFullscreenOverlay(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFullscreenOverlay]);

  async function handleSaveSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    if (!activeSection) return;
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

  function toggleAbsent(index: number) {
    setAbsentIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
    setPoolExhausted(false);
    setGroups([]);
    setSwapSelection(null);
  }

  function resetAllAttendance() {
    setAbsentIndices(new Set());
    setPoolExhausted(false);
    setGroups([]);
    setSwapSelection(null);
  }

  function handlePickStudent() {
    const result = drawRandomStudent(
      presentStudents,
      usedIndices,
      removePickedFromPool,
    );
    setUsedIndices(result.nextUsedIndices);
    setPoolExhausted(result.exhausted);
    if (result.picked) {
      setPickedStudent(result.picked);
    }
  }

  function handleResetPool() {
    setUsedIndices(new Set());
    setPickedStudent(null);
    setPoolExhausted(false);
  }

  function handleGenerateGroups() {
    const next = generateStudentGroups(presentStudents, {
      mode: groupMode,
      value: groupValue,
    });
    setGroups(next);
    setSwapSelection(null);
  }

  function handleGroupStudentClick(slot: GroupSlot) {
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

  async function toggleFullscreen() {
    if (isNativeFullscreen) {
      await document.exitFullscreen().catch(() => {});
      return;
    }
    if (isFullscreenOverlay) {
      setIsFullscreenOverlay(false);
      return;
    }
    const el = timerBoxRef.current;
    if (el?.requestFullscreen) {
      try {
        await el.requestFullscreen();
        return;
      } catch {
        // Fall through to CSS projector overlay when Fullscreen API is unavailable.
      }
    }
    setIsFullscreenOverlay(true);
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
  const isFullscreenActive = isNativeFullscreen || isFullscreenOverlay;

  return {
    timerBoxRef,
    tabRefs,
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
    groupMode,
    setGroupMode,
    groupValue,
    setGroupValue,
    groups,
    swapSelection,
    isFullscreenOverlay,
    isFullscreenActive,
    handleSaveSection,
    handleDeleteSection,
    toggleAbsent,
    resetAllAttendance,
    handlePickStudent,
    handleResetPool,
    handleGenerateGroups,
    handleGroupStudentClick,
    handleCustomDurationSubmit,
    toggleFullscreen,
    handleTabKeyDown,
  };
}
