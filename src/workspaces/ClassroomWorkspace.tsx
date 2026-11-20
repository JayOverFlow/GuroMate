import {
  useCallback,
  useEffect,
  useId,
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
import { GRADE_LEVELS, type ClassSection, type GradeLevel } from "../engine/types";

type ToolTab = "picker" | "groups" | "timer";

const TOOL_TABS: ReadonlyArray<{ id: ToolTab; label: string }> = [
  { id: "picker", label: "Random Student Picker" },
  { id: "groups", label: "Group Maker" },
  { id: "timer", label: "Classroom Timer" },
];

const TIMER_PRESET_MINUTES = [1, 3, 5, 10, 15] as const;

interface StatusState {
  tone: "success" | "error";
  text: string;
}

interface SectionFormState {
  id?: string;
  gradeLevel: GradeLevel;
  sectionName: string;
  rosterText: string;
}

function emptySectionForm(): SectionFormState {
  return { gradeLevel: 7, sectionName: "", rosterText: "" };
}

function formFromSection(section: ClassSection): SectionFormState {
  return {
    id: section.id,
    gradeLevel: section.gradeLevel,
    sectionName: section.sectionName,
    rosterText: section.students.join("\n"),
  };
}

function parseRosterText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatClock(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string; message?: string };
    return data.error || data.message || `Request failed (HTTP ${res.status}).`;
  } catch {
    return `Request failed (HTTP ${res.status}).`;
  }
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

export function ClassroomWorkspace() {
  const headingId = useId();
  const baseId = useId();
  const timerBoxRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<ToolTab, HTMLButtonElement | null>>({
    picker: null,
    groups: null,
    timer: null,
  });

  // Class Sections state
  const [sections, setSections] = useState<ClassSection[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusState | null>(null);
  const [showSectionForm, setShowSectionForm] = useState(false);
  const [sectionForm, setSectionForm] = useState<SectionFormState>(
    emptySectionForm,
  );
  const [savingSection, setSavingSection] = useState(false);

  // Active tool tab & attendance
  const [activeTab, setActiveTab] = useState<ToolTab>("picker");
  const [absentIndices, setAbsentIndices] = useState<Set<number>>(
    () => new Set(),
  );

  // Random Student Picker state
  const [removePickedFromPool, setRemovePickedFromPool] = useState(true);
  const [usedIndices, setUsedIndices] = useState<Set<number>>(() => new Set());
  const [pickedStudent, setPickedStudent] = useState<RosterStudent | null>(
    null,
  );
  const [poolExhausted, setPoolExhausted] = useState(false);

  // Group Maker state
  const [groupMode, setGroupMode] =
    useState<GroupGenerationOptions["mode"]>("count");
  const [groupValue, setGroupValue] = useState<number>(4);
  const [groups, setGroups] = useState<RosterStudent[][]>([]);
  const [swapSelection, setSwapSelection] = useState<GroupSlot | null>(null);

  // Persistent Classroom Timer state (kept in parent so tab switches never interrupt ticking)
  const [durationSeconds, setDurationSeconds] = useState<number>(5 * 60);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(5 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerExpired, setTimerExpired] = useState(false);
  const [customMinutes, setCustomMinutes] = useState(2);
  const [customSeconds, setCustomSeconds] = useState(30);
  const [isFullscreenOverlay, setIsFullscreenOverlay] = useState(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const endTimeRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

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

  // Reset per-section ephemeral classroom state when switching sections
  useEffect(() => {
    resetRosterState();
  }, [selectedSectionId, resetRosterState]);

  useEffect(() => {
    return () => {
      void audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

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

  // Persistent timer tick loop driven by wall-clock deadline to prevent drift
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
        playAlarmChime(audioCtxRef.current);
      }
    };

    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [timerRunning]);

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

  function applyTimerDuration(seconds: number, autoStart = false) {
    const safeSeconds = Math.max(1, Math.floor(seconds));
    endTimeRef.current = autoStart ? Date.now() + safeSeconds * 1000 : null;
    setDurationSeconds(safeSeconds);
    setRemainingSeconds(safeSeconds);
    setTimerExpired(false);
    setTimerRunning(autoStart);
  }

  function handleStartOrPauseTimer() {
    if (timerRunning) {
      endTimeRef.current = null;
      setTimerRunning(false);
      return;
    }
    const AudioCtx = getAudioContextConstructor();
    if (!audioCtxRef.current && AudioCtx) {
      audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current?.state === "suspended") {
      void audioCtxRef.current.resume().catch(() => {});
    }
    const baseSeconds =
      remainingSeconds <= 0 ? durationSeconds : remainingSeconds;
    endTimeRef.current = Date.now() + baseSeconds * 1000;
    setRemainingSeconds(baseSeconds);
    setTimerExpired(false);
    setTimerRunning(true);
  }

  function handleResetTimer() {
    endTimeRef.current = null;
    setTimerRunning(false);
    setTimerExpired(false);
    setRemainingSeconds(durationSeconds);
  }

  function handleCustomDurationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const total = customMinutes * 60 + customSeconds;
    if (total <= 0) {
      setStatus({
        tone: "error",
        text: "Error: Enter a custom timer duration greater than 0 seconds.",
      });
      return;
    }
    setStatus(null);
    applyTimerDuration(total, false);
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

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, idx: number) {
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

  return (
    <section className="classroom-workspace" aria-labelledby={headingId}>
      <div className="workspace-header curriculum-header-row">
        <div>
          <h1 id={headingId} tabIndex={-1}>
            Class Sections &amp; Classroom Tools
          </h1>
          <p className="workspace-subtitle">
            Manage <strong>Class Sections</strong> locally (
            <code>./data/class-sections.json</code>) and run projector-ready{" "}
            <strong>Random Student Picker</strong>,{" "}
            <strong>Group Maker</strong>, and <strong>Classroom Timer</strong>.
          </p>
        </div>
        <div className="actions-row">
          {(timerRunning || timerExpired) && activeTab !== "timer" && (
            <button
              type="button"
              className="btn-secondary timer-pill"
              onClick={() => setActiveTab("timer")}
            >
              {timerExpired
                ? "Timer: Time's up!"
                : `Timer: ${formatClock(remainingSeconds)}`}
            </button>
          )}
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setSectionForm(emptySectionForm());
              setShowSectionForm((prev) =>
                prev && !sectionForm.id ? false : true,
              );
            }}
          >
            {showSectionForm && !sectionForm.id
              ? "Close Form"
              : "Add Class Section"}
          </button>
        </div>
      </div>

      <div
        className="status-banner"
        role="status"
        aria-live="polite"
        data-tone={status?.tone}
        hidden={!status}
      >
        {status?.text ?? ""}
      </div>

      {showSectionForm && (
        <form
          className="card classroom-section-form"
          onSubmit={(e) => void handleSaveSection(e)}
        >
          <h2>
            {sectionForm.id ? "Edit Class Section" : "New Class Section"}
          </h2>

          <div className="classroom-form-row">
            <div className="field">
              <label htmlFor={`${baseId}-section-grade`}>Grade Level *</label>
              <select
                id={`${baseId}-section-grade`}
                value={String(sectionForm.gradeLevel)}
                onChange={(e) =>
                  setSectionForm((prev) => ({
                    ...prev,
                    gradeLevel: Number(e.target.value) as GradeLevel,
                  }))
                }
              >
                {GRADE_LEVELS.map((g) => (
                  <option key={g} value={String(g)}>
                    Grade {g}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor={`${baseId}-section-name`}>Section Name *</label>
              <input
                id={`${baseId}-section-name`}
                type="text"
                required
                placeholder="e.g. 7-Rizal"
                value={sectionForm.sectionName}
                onChange={(e) =>
                  setSectionForm((prev) => ({
                    ...prev,
                    sectionName: e.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor={`${baseId}-section-roster`}>
              Student Roster (paste one student name per line) *
            </label>
            <span id={`${baseId}-section-roster-hint`} className="hint">
              {parsedFormCount}{" "}
              {parsedFormCount === 1 ? "student" : "students"} detected.
            </span>
            <textarea
              id={`${baseId}-section-roster`}
              required
              rows={7}
              aria-describedby={`${baseId}-section-roster-hint`}
              placeholder={"Dela Cruz, Juan\nReyes, Maria\nSantos, Carlo"}
              value={sectionForm.rosterText}
              onChange={(e) =>
                setSectionForm((prev) => ({
                  ...prev,
                  rosterText: e.target.value,
                }))
              }
            />
          </div>

          <div className="actions-row">
            <button
              type="submit"
              className="btn-primary"
              disabled={savingSection}
            >
              {savingSection
                ? "Saving..."
                : sectionForm.id
                  ? "Update Class Section"
                  : "Save Class Section"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setShowSectionForm(false);
                setSectionForm(emptySectionForm());
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="card classroom-section-bar">
        {loading ? (
          <p>Loading Class Sections...</p>
        ) : sections.length === 0 ? (
          <p className="classroom-empty-note">
            No Class Sections saved yet. Add a Class Section to use the Random
            Student Picker and Group Maker, or switch directly to the Classroom
            Timer.
          </p>
        ) : (
          <div className="classroom-selector-row">
            <div className="field classroom-selector-field">
              <label htmlFor={`${baseId}-active-section`}>
                Active Class Section
              </label>
              <select
                id={`${baseId}-active-section`}
                value={selectedSectionId}
                onChange={(e) => setSelectedSectionId(e.target.value)}
              >
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    Grade {section.gradeLevel} — {section.sectionName} (
                    {section.students.length} students)
                  </option>
                ))}
              </select>
            </div>

            {activeSection && (
              <div className="actions-row">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setSectionForm(formFromSection(activeSection));
                    setShowSectionForm(true);
                  }}
                >
                  Edit Section
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => void handleDeleteSection()}
                >
                  Delete Section
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="classroom-tabs">
        <div
          className="classroom-tablist"
          role="tablist"
          aria-label="Classroom Tools"
        >
          {TOOL_TABS.map((tab, idx) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[tab.id] = el;
                }}
                id={`${baseId}-tab-${tab.id}`}
                type="button"
                role="tab"
                className="classroom-tab"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(e) => handleTabKeyDown(e, idx)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Random Student Picker Panel */}
        <div
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-picker`}
          hidden={activeTab !== "picker"}
        >
          <div className="card classroom-panel-body">
            {!activeSection ? (
              <p>Create or select a Class Section above to pick students.</p>
            ) : (
              <>
                <div className="classroom-picker-controls">
                  <label className="classroom-checkbox-label">
                    <input
                      type="checkbox"
                      checked={removePickedFromPool}
                      onChange={(e) => {
                        setRemovePickedFromPool(e.target.checked);
                        setPoolExhausted(false);
                      }}
                    />
                    <span>
                      Remove picked student from pool until reset (no repeats)
                    </span>
                  </label>

                  <div className="actions-row">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={presentStudents.length === 0}
                      onClick={handlePickStudent}
                    >
                      Pick Random Student
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleResetPool}
                    >
                      Reset Pool
                    </button>
                  </div>
                </div>

                <div
                  className="projector-stage"
                  role="status"
                  aria-live="polite"
                >
                  <span className="projector-meta">
                    {activeSection.sectionName} — Present:{" "}
                    {presentStudents.length}/{activeSection.students.length} |
                    Pool remaining: {remainingInPoolCount}
                  </span>
                  {poolExhausted ? (
                    <p className="projector-name projector-empty">
                      {presentStudents.length === 0
                        ? "All students are marked absent."
                        : "Every present student has been called. Reset pool to draw again."}
                    </p>
                  ) : pickedStudent ? (
                    <p className="projector-name">{pickedStudent.name}</p>
                  ) : (
                    <p className="projector-name projector-empty">
                      Ready to pick a student
                    </p>
                  )}
                </div>

                <AttendanceToggleList
                  students={activeSection.students}
                  absentIndices={absentIndices}
                  onToggle={toggleAbsent}
                  onResetAll={resetAllAttendance}
                />
              </>
            )}
          </div>
        </div>

        {/* Group Maker Panel */}
        <div
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-groups`}
          hidden={activeTab !== "groups"}
        >
          <div className="card classroom-panel-body">
            {!activeSection ? (
              <p>Create or select a Class Section above to make groups.</p>
            ) : (
              <>
                <div className="classroom-group-controls">
                  <div className="field">
                    <label htmlFor={`${baseId}-group-mode`}>Split By</label>
                    <select
                      id={`${baseId}-group-mode`}
                      value={groupMode}
                      onChange={(e) =>
                        setGroupMode(
                          e.target.value as GroupGenerationOptions["mode"],
                        )
                      }
                    >
                      <option value="count">Number of Groups</option>
                      <option value="size">Students per Group</option>
                    </select>
                  </div>

                  <div className="field">
                    <label htmlFor={`${baseId}-group-value`}>
                      {groupMode === "count"
                        ? "Number of Groups"
                        : "Max Students per Group"}
                    </label>
                    <input
                      id={`${baseId}-group-value`}
                      type="number"
                      min={1}
                      max={Math.max(1, presentStudents.length)}
                      value={groupValue}
                      onChange={(e) =>
                        setGroupValue(
                          Math.max(1, Number.parseInt(e.target.value || "1", 10)),
                        )
                      }
                    />
                  </div>

                  <div className="actions-row classroom-group-action">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={presentStudents.length === 0}
                      onClick={handleGenerateGroups}
                    >
                      {groups.length > 0 ? "Reshuffle Groups" : "Generate Groups"}
                    </button>
                  </div>
                </div>

                {groups.length > 0 && (
                  <div className="classroom-groups-section">
                    <p className="hint">
                      {swapSelection
                        ? "Select a second student to complete the swap (or click the same student to cancel)."
                        : "Click any two students to swap them between groups."}
                    </p>
                    <div className="classroom-groups-grid">
                      {groups.map((group, groupIndex) => (
                        <section
                          key={groupIndex}
                          className="classroom-group-card"
                          aria-label={`Group ${groupIndex + 1}`}
                        >
                          <h3>
                            Group {groupIndex + 1}{" "}
                            <span className="badge">{group.length}</span>
                          </h3>
                          <ul className="classroom-group-members">
                            {group.map((student, studentIndex) => {
                              const isSelected =
                                swapSelection?.groupIndex === groupIndex &&
                                swapSelection?.studentIndex === studentIndex;
                              return (
                                <li key={`${student.index}-${studentIndex}`}>
                                  <button
                                    type="button"
                                    className={`group-member-btn${isSelected ? " is-swap-selected" : ""}`}
                                    aria-pressed={isSelected}
                                    onClick={() =>
                                      handleGroupStudentClick({
                                        groupIndex,
                                        studentIndex,
                                      })
                                    }
                                  >
                                    {student.name}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </section>
                      ))}
                    </div>
                  </div>
                )}

                <AttendanceToggleList
                  students={activeSection.students}
                  absentIndices={absentIndices}
                  onToggle={toggleAbsent}
                  onResetAll={resetAllAttendance}
                />
              </>
            )}
          </div>
        </div>

        {/* Classroom Timer Panel */}
        <div
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-timer`}
          hidden={activeTab !== "timer"}
        >
          <div
            ref={timerBoxRef}
            className={`card classroom-panel-body classroom-timer-box${isFullscreenOverlay ? " is-fullscreen-overlay" : ""}`}
          >
            <div className="timer-presets" role="group" aria-label="Timer Presets">
              {TIMER_PRESET_MINUTES.map((mins) => (
                <button
                  key={mins}
                  type="button"
                  className="btn-secondary"
                  onClick={() => applyTimerDuration(mins * 60, false)}
                >
                  {mins} min
                </button>
              ))}
            </div>

            <div
              className={`projector-stage timer-stage${timerExpired ? " is-expired" : ""}`}
            >
              <span className="projector-meta">
                {timerExpired
                  ? "Time's up!"
                  : timerRunning
                    ? "Running"
                    : remainingSeconds === durationSeconds
                      ? "Ready"
                      : "Paused"}
              </span>
              <p className="projector-clock" aria-live="off">
                {formatClock(remainingSeconds)}
              </p>
              <div className="visually-hidden" role="status" aria-live="polite">
                {timerExpired ? "Classroom timer finished. Time is up." : ""}
              </div>
            </div>

            <div className="actions-row timer-main-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={handleStartOrPauseTimer}
              >
                {timerRunning
                  ? "Pause"
                  : remainingSeconds < durationSeconds && remainingSeconds > 0
                    ? "Resume"
                    : "Start"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleResetTimer}
              >
                Reset
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void toggleFullscreen()}
              >
                {isFullscreenActive ? "Exit Fullscreen" : "Fullscreen"}
              </button>
            </div>

            <form
              className="timer-custom-form"
              onSubmit={handleCustomDurationSubmit}
            >
              <div className="field">
                <label htmlFor={`${baseId}-custom-mins`}>Minutes</label>
                <input
                  id={`${baseId}-custom-mins`}
                  type="number"
                  min={0}
                  max={180}
                  value={customMinutes}
                  onChange={(e) =>
                    setCustomMinutes(
                      Math.max(0, Number.parseInt(e.target.value || "0", 10) || 0),
                    )
                  }
                />
              </div>
              <div className="field">
                <label htmlFor={`${baseId}-custom-secs`}>Seconds</label>
                <input
                  id={`${baseId}-custom-secs`}
                  type="number"
                  min={0}
                  max={59}
                  value={customSeconds}
                  onChange={(e) =>
                    setCustomSeconds(
                      Math.min(
                        59,
                        Math.max(0, Number.parseInt(e.target.value || "0", 10) || 0),
                      ),
                    )
                  }
                />
              </div>
              <button type="submit" className="btn-secondary">
                Set Custom Time
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}

function AttendanceToggleList({
  students,
  absentIndices,
  onToggle,
  onResetAll,
}: {
  students: readonly string[];
  absentIndices: ReadonlySet<number>;
  onToggle: (index: number) => void;
  onResetAll: () => void;
}) {
  return (
    <details className="classroom-attendance" open>
      <summary>
        Attendance ({students.length - absentIndices.size}/{students.length}{" "}
        present — click to mark absent)
      </summary>
      <div className="classroom-attendance-body">
        {absentIndices.size > 0 && (
          <button
            type="button"
            className="btn-secondary btn-compact"
            onClick={onResetAll}
          >
            Mark All Present
          </button>
        )}
        <div className="classroom-student-pills">
          {students.map((name, index) => {
            const isAbsent = absentIndices.has(index);
            return (
              <button
                key={`${name}-${index}`}
                type="button"
                className={`student-pill${isAbsent ? " is-absent" : ""}`}
                aria-pressed={!isAbsent}
                onClick={() => onToggle(index)}
              >
                <span>{name}</span>
                <span className="pill-state">
                  {isAbsent ? "Absent" : "Present"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </details>
  );
}
