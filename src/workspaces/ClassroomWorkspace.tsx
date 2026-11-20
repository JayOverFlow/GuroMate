import { useId } from "react";
import type { GroupGenerationOptions } from "../engine/classroomTools";
import { GRADE_LEVELS, type GradeLevel } from "../engine/types";
import {
  formatClock,
  TIMER_PRESET_MINUTES,
  type ClassroomTimerState,
} from "../hooks/useClassroomTimer";
import {
  emptySectionForm,
  formFromSection,
  TOOL_TABS,
  useClassroomWorkspace,
} from "../hooks/useClassroomWorkspace";

interface ClassroomWorkspaceProps {
  timer: ClassroomTimerState;
  openTimerTabSignal?: number;
}

const INPUT_CLASS =
  "w-full px-gutter-md py-gutter-sm rounded bg-surface-container-lowest border border-outline-variant text-body-md text-on-surface focus:border-primary focus-visible:outline-2 focus-visible:outline-primary";

export function ClassroomWorkspace({
  timer,
  openTimerTabSignal = 0,
}: ClassroomWorkspaceProps) {
  const headingId = useId();
  const baseId = useId();

  const {
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
  } = useClassroomWorkspace(timer, openTimerTabSignal);

  const timerStatusLabel = timer.timerExpired
    ? "Time's up!"
    : timer.timerRunning
      ? "Running"
      : timer.remainingSeconds === timer.durationSeconds
        ? "Ready"
        : "Paused";

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-gutter-lg"
    >
      {/* Page Title & Section Selector */}
      <div className="flex flex-wrap items-end justify-between gap-gutter-md">
        <div className="flex flex-col gap-gutter-xs">
          <h1
            id={headingId}
            tabIndex={-1}
            className="font-headline text-headline-lg text-on-surface text-balance"
          >
            Classroom Management Suite
          </h1>
          <p className="font-body text-body-md text-on-surface-variant">
            Manage <strong>Class Sections</strong> locally (
            <code className="font-mono text-mono-md">
              ./data/class-sections.json
            </code>
            ) and run projector-ready Random Student Picker, Group Maker, and
            Classroom Timer.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-gutter-sm">
          {sections.length > 0 && (
            <select
              id={`${baseId}-active-section`}
              aria-label="Active Class Section"
              value={selectedSectionId}
              onChange={(e) => setSelectedSectionId(e.target.value)}
              className="px-gutter-md py-gutter-sm rounded bg-surface-container-lowest border border-outline-variant text-body-md text-on-surface focus:border-primary focus-visible:outline-2 focus-visible:outline-primary"
            >
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  Grade {section.gradeLevel} — {section.sectionName} (
                  {section.students.length} students)
                </option>
              ))}
            </select>
          )}

          {activeSection && (
            <>
              <button
                type="button"
                onClick={() => {
                  setSectionForm(formFromSection(activeSection));
                  setShowSectionForm(true);
                }}
                className="inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-sm rounded bg-surface-container-lowest border border-outline-variant font-label text-label-md text-on-surface hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span
                  className="material-symbols-outlined text-title-md"
                  aria-hidden="true"
                >
                  edit
                </span>
                <span>Edit Section</span>
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteSection()}
                className="inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-sm rounded bg-surface-container-lowest border border-outline-variant font-label text-label-md text-error hover:bg-error-container/30 focus-visible:outline-2 focus-visible:outline-error"
              >
                <span
                  className="material-symbols-outlined text-title-md"
                  aria-hidden="true"
                >
                  delete
                </span>
                <span>Delete</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => {
              setSectionForm(emptySectionForm());
              setShowSectionForm((prev) =>
                prev && !sectionForm.id ? false : true,
              );
            }}
            className="shrink-0 whitespace-nowrap inline-flex items-center justify-center gap-gutter-sm px-gutter-md py-gutter-sm rounded bg-primary text-on-primary font-label text-label-lg hover:bg-primary-container focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change"
          >
            <span
              className="material-symbols-outlined text-title-md"
              aria-hidden="true"
            >
              {showSectionForm && !sectionForm.id ? "close" : "add"}
            </span>
            <span>
              {showSectionForm && !sectionForm.id
                ? "Close Form"
                : "New Section"}
            </span>
          </button>
        </div>
      </div>

      {/* Status Banner */}
      <div
        role="status"
        aria-live="polite"
        hidden={!status}
        className={`rounded-md border p-gutter-md flex items-center gap-gutter-sm font-body text-body-md ${
          status?.tone === "error"
            ? "border-error bg-error-container text-on-error-container"
            : "border-success bg-success-container/60 text-on-success-container"
        }`}
      >
        <span
          className="material-symbols-outlined text-title-lg shrink-0"
          aria-hidden="true"
        >
          {status?.tone === "error" ? "error" : "check_circle"}
        </span>
        <span>{status?.text ?? ""}</span>
      </div>

      {/* Add / Edit Class Section Form */}
      {showSectionForm && (
        <form
          onSubmit={(e) => void handleSaveSection(e)}
          className="bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-lg flex flex-col gap-gutter-md"
        >
          <h2 className="font-title text-title-lg text-on-surface">
            {sectionForm.id ? "Edit Class Section" : "New Class Section"}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter-md">
            <div className="flex flex-col gap-gutter-xs">
              <label
                htmlFor={`${baseId}-section-grade`}
                className="font-label text-label-md text-on-surface"
              >
                Grade Level *
              </label>
              <select
                id={`${baseId}-section-grade`}
                value={String(sectionForm.gradeLevel)}
                onChange={(e) =>
                  setSectionForm((prev) => ({
                    ...prev,
                    gradeLevel: Number(e.target.value) as GradeLevel,
                  }))
                }
                className={INPUT_CLASS}
              >
                {GRADE_LEVELS.map((g) => (
                  <option key={g} value={String(g)}>
                    Grade {g}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-gutter-xs">
              <label
                htmlFor={`${baseId}-section-name`}
                className="font-label text-label-md text-on-surface"
              >
                Section Name *
              </label>
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
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div className="flex flex-col gap-gutter-xs">
            <label
              htmlFor={`${baseId}-section-roster`}
              className="font-label text-label-md text-on-surface"
            >
              Student Roster (paste one student name per line) *
            </label>
            <span
              id={`${baseId}-section-roster-hint`}
              className="font-body text-body-sm text-on-surface-variant"
            >
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
              className={INPUT_CLASS}
            />
          </div>

          <div className="flex flex-wrap items-center gap-gutter-sm">
            <button
              type="submit"
              disabled={savingSection}
              className="inline-flex items-center justify-center gap-gutter-sm px-gutter-md py-gutter-sm rounded bg-primary text-on-primary font-label text-label-lg hover:bg-primary-container focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60"
            >
              {savingSection
                ? "Saving..."
                : sectionForm.id
                  ? "Update Class Section"
                  : "Save Class Section"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowSectionForm(false);
                setSectionForm(emptySectionForm());
              }}
              className="inline-flex items-center justify-center gap-gutter-sm px-gutter-md py-gutter-sm rounded bg-surface-container-lowest border border-outline-variant font-label text-label-lg text-on-surface hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-primary"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Persistent Classroom Timer Dock */}
      <section className="bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-md flex flex-wrap items-center justify-between gap-gutter-md">
        <div className="flex flex-wrap items-center gap-gutter-md">
          <div
            className={`px-gutter-md py-gutter-sm rounded flex items-center gap-gutter-sm ${
              timer.timerExpired
                ? "bg-error text-on-error"
                : "bg-primary text-on-primary"
            }`}
          >
            <span
              className="material-symbols-outlined text-title-lg"
              aria-hidden="true"
            >
              timer
            </span>
            <span className="font-mono text-display-lg tabular-nums leading-none">
              {formatClock(timer.remainingSeconds)}
            </span>
          </div>

          <div className="flex flex-col gap-gutter-xs">
            <div className="flex items-center gap-gutter-sm">
              <span className="font-title text-title-md text-on-surface">
                Classroom Timer
              </span>
              <span
                className={`px-gutter-sm py-0.5 rounded-full font-label text-label-sm ${
                  timer.timerExpired
                    ? "bg-error-container text-on-error-container"
                    : timer.timerRunning
                      ? "bg-success-container text-on-success-container"
                      : "bg-surface-variant text-on-surface-variant"
                }`}
              >
                {timerStatusLabel}
              </span>
            </div>
            <div
              className="flex flex-wrap items-center gap-gutter-xs"
              role="group"
              aria-label="Timer presets"
            >
              {TIMER_PRESET_MINUTES.map((mins) => {
                const isSelected = timer.durationSeconds === mins * 60;
                return (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => timer.selectPreset(mins)}
                    className={`px-gutter-sm py-gutter-xs rounded-sm text-label-sm font-mono transition-colors duration-state-change ${
                      isSelected
                        ? "bg-primary text-on-primary"
                        : "bg-surface-container text-on-surface hover:bg-surface-container-high"
                    }`}
                  >
                    {mins}m
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-gutter-sm">
          <button
            type="button"
            onClick={timer.timerRunning ? timer.pauseTimer : timer.startTimer}
            className="shrink-0 whitespace-nowrap inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-sm rounded bg-surface-container-low border border-outline-variant text-label-md font-label text-on-surface hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change"
          >
            <span
              className="material-symbols-outlined text-title-md text-primary"
              aria-hidden="true"
            >
              {timer.timerRunning ? "pause" : "play_arrow"}
            </span>
            <span>
              {timer.timerRunning
                ? "Pause"
                : timer.remainingSeconds < timer.durationSeconds &&
                    timer.remainingSeconds > 0
                  ? "Resume"
                  : "Start"}
            </span>
          </button>
          <button
            type="button"
            onClick={timer.resetTimer}
            className="shrink-0 whitespace-nowrap inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-sm rounded bg-surface-container-low border border-outline-variant text-label-md font-label text-on-surface hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change"
          >
            <span
              className="material-symbols-outlined text-title-md"
              aria-hidden="true"
            >
              replay
            </span>
            <span>Reset</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("timer");
              void toggleFullscreen();
            }}
            className="shrink-0 whitespace-nowrap inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-sm rounded bg-primary text-on-primary text-label-md font-label hover:bg-primary-container focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change"
          >
            <span
              className="material-symbols-outlined text-title-md"
              aria-hidden="true"
            >
              fullscreen
            </span>
            <span>Projector View</span>
          </button>
        </div>
      </section>

      {loading && (
        <div className="rounded-md border border-outline-variant bg-surface-container-lowest p-gutter-md font-body text-body-md text-on-surface-variant">
          Loading Class Sections...
        </div>
      )}

      {!loading && sections.length === 0 && (
        <div className="rounded-md border border-outline-variant bg-surface-container-low p-gutter-md font-body text-body-md text-on-surface-variant">
          No Class Sections saved yet. Click <strong>New Section</strong> to
          add a roster for the Random Student Picker and Group Maker, or use the
          Classroom Timer right away.
        </div>
      )}

      {/* Tool Tabs */}
      <div className="flex flex-col gap-gutter-md">
        <div
          role="tablist"
          aria-label="Classroom Tools"
          className="inline-flex flex-wrap items-center gap-gutter-xs p-gutter-xs rounded bg-surface-container border border-outline-variant self-start"
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
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(e) => handleTabKeyDown(e, idx)}
                className={`inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-xs rounded-sm font-label text-label-lg transition-colors duration-state-change focus-visible:outline-2 focus-visible:outline-primary ${
                  selected
                    ? "bg-surface-container-lowest text-primary border border-outline-variant"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                <span
                  className="material-symbols-outlined text-title-md"
                  aria-hidden="true"
                >
                  {tab.icon}
                </span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Panel 1: Random Student Picker */}
        <div
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-picker`}
          hidden={activeTab !== "picker"}
        >
          {!activeSection ? (
            <div className="bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-lg font-body text-body-md text-on-surface-variant">
              Create or select a Class Section above to pick students.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter-lg items-start">
              {/* Spotlight Draw Card */}
              <div className="lg:col-span-5 bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-xl flex flex-col items-center text-center gap-gutter-md">
                <span className="font-label text-label-md text-on-surface-variant uppercase tracking-wider">
                  Selected Student
                </span>
                <div
                  role="status"
                  aria-live="polite"
                  className="w-full py-gutter-lg px-gutter-md rounded-md bg-surface-container-low border border-primary flex flex-col items-center gap-gutter-xs"
                >
                  {poolExhausted ? (
                    <p className="font-title text-title-lg text-on-surface-variant">
                      {presentStudents.length === 0
                        ? "All students are marked absent."
                        : "Every present student has been called. Reset pool to draw again."}
                    </p>
                  ) : pickedStudent ? (
                    <p className="font-display text-display-lg text-primary text-balance">
                      {pickedStudent.name}
                    </p>
                  ) : (
                    <p className="font-title text-title-lg text-on-surface-variant">
                      Ready to pick a student
                    </p>
                  )}
                  <span className="font-body text-body-sm text-on-surface-variant">
                    {activeSection.sectionName} · Present:{" "}
                    {presentStudents.length}/{activeSection.students.length} ·
                    Pool remaining: {remainingInPoolCount}
                  </span>
                </div>

                <label className="inline-flex items-center gap-gutter-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={removePickedFromPool}
                    onChange={(e) => {
                      setRemovePickedFromPool(e.target.checked);
                      setPoolExhausted(false);
                    }}
                    className="accent-primary"
                  />
                  <span className="font-body text-body-sm text-on-surface">
                    Remove picked student from pool until reset (no repeats)
                  </span>
                </label>

                <div className="flex flex-wrap justify-center items-center gap-gutter-sm pt-gutter-xs">
                  <button
                    type="button"
                    disabled={presentStudents.length === 0}
                    onClick={handlePickStudent}
                    className="shrink-0 whitespace-nowrap inline-flex items-center gap-gutter-sm px-gutter-lg py-gutter-sm rounded bg-primary text-on-primary font-label text-label-lg hover:bg-primary-container focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change disabled:opacity-50"
                  >
                    <span
                      className="material-symbols-outlined text-title-md"
                      aria-hidden="true"
                    >
                      casino
                    </span>
                    <span>Pick Random Student</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleResetPool}
                    className="shrink-0 whitespace-nowrap inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-sm rounded bg-surface-container-lowest border border-outline-variant font-label text-label-lg text-on-surface hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change"
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

              {/* Roster Attendance & Recitation Pool */}
              <AttendancePoolGrid
                students={activeSection.students}
                absentIndices={absentIndices}
                usedIndices={usedIndices}
                onToggle={toggleAbsent}
                onResetAll={resetAllAttendance}
              />
            </div>
          )}
        </div>

        {/* Panel 2: Group Maker */}
        <div
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-groups`}
          hidden={activeTab !== "groups"}
        >
          {!activeSection ? (
            <div className="bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-lg font-body text-body-md text-on-surface-variant">
              Create or select a Class Section above to make groups.
            </div>
          ) : (
            <div className="flex flex-col gap-gutter-lg">
              <div className="bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-lg flex flex-col gap-gutter-md">
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
                        onChange={(e) =>
                          setGroupMode(
                            e.target.value as GroupGenerationOptions["mode"],
                          )
                        }
                        className="px-gutter-md py-gutter-sm rounded bg-surface-container-lowest border border-outline-variant text-body-md text-on-surface focus:border-primary focus-visible:outline-2 focus-visible:outline-primary"
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
                        max={Math.max(1, presentStudents.length)}
                        value={groupValue}
                        onChange={(e) =>
                          setGroupValue(
                            Math.max(
                              1,
                              Number.parseInt(e.target.value || "1", 10),
                            ),
                          )
                        }
                        className="w-28 px-gutter-md py-gutter-sm rounded bg-surface-container-lowest border border-outline-variant font-mono text-mono-md text-on-surface tabular-nums focus:border-primary focus-visible:outline-2 focus-visible:outline-primary"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={presentStudents.length === 0}
                    onClick={handleGenerateGroups}
                    className="inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-sm rounded bg-primary text-on-primary font-label text-label-lg hover:bg-primary-container focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
                  >
                    <span
                      className="material-symbols-outlined text-title-md"
                      aria-hidden="true"
                    >
                      shuffle
                    </span>
                    <span>
                      {groups.length > 0
                        ? "Reshuffle Groups"
                        : "Generate Groups"}
                    </span>
                  </button>
                </div>

                {groups.length > 0 ? (
                  <div className="flex flex-col gap-gutter-sm">
                    <p className="font-body text-body-sm text-on-surface-variant">
                      {swapSelection
                        ? "Select a second student to complete the swap (or click the same student to cancel)."
                        : "Click any two students across groups to swap them manually."}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-gutter-md">
                      {groups.map((group, groupIndex) => (
                        <section
                          key={groupIndex}
                          aria-label={`Group ${groupIndex + 1}`}
                          className="p-gutter-md rounded-md border border-outline-variant bg-surface-container-low flex flex-col gap-gutter-sm"
                        >
                          <h3 className="font-title text-title-md text-on-surface flex items-center justify-between">
                            <span>Group {groupIndex + 1}</span>
                            <span className="px-gutter-sm py-0.5 rounded-full bg-surface-container-lowest border border-outline-variant font-mono text-label-sm tabular-nums">
                              {group.length}
                            </span>
                          </h3>
                          <ul className="flex flex-col gap-gutter-xs">
                            {group.map((student, studentIndex) => {
                              const isSelected =
                                swapSelection?.groupIndex === groupIndex &&
                                swapSelection?.studentIndex === studentIndex;
                              return (
                                <li key={`${student.index}-${studentIndex}`}>
                                  <button
                                    type="button"
                                    aria-pressed={isSelected}
                                    onClick={() =>
                                      handleGroupStudentClick({
                                        groupIndex,
                                        studentIndex,
                                      })
                                    }
                                    className={`w-full text-left px-gutter-sm py-gutter-xs rounded border font-body text-body-sm transition-colors duration-state-change focus-visible:outline-2 focus-visible:outline-primary ${
                                      isSelected
                                        ? "bg-primary text-on-primary border-primary font-semibold"
                                        : "bg-surface-container-lowest border-outline-variant text-on-surface hover:border-primary"
                                    }`}
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
                ) : (
                  <p className="font-body text-body-sm text-on-surface-variant">
                    Configure group count or max group size and click{" "}
                    <strong>Generate Groups</strong> ({presentStudents.length}{" "}
                    present students).
                  </p>
                )}
              </div>

              <AttendancePoolGrid
                students={activeSection.students}
                absentIndices={absentIndices}
                usedIndices={usedIndices}
                onToggle={toggleAbsent}
                onResetAll={resetAllAttendance}
              />
            </div>
          )}
        </div>

        {/* Panel 3: Classroom Timer (Full Projector Mode & Custom Duration) */}
        <div
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-timer`}
          hidden={activeTab !== "timer"}
        >
          <div
            ref={timerBoxRef}
            className={`bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-xl flex flex-col items-center gap-gutter-lg ${
              isFullscreenOverlay
                ? "fixed inset-0 z-50 rounded-none border-0 justify-center overflow-auto bg-surface"
                : ""
            }`}
          >
            <div
              className="flex flex-wrap justify-center gap-gutter-sm"
              role="group"
              aria-label="Timer Presets"
            >
              {TIMER_PRESET_MINUTES.map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => timer.selectPreset(mins)}
                  className={`px-gutter-md py-gutter-xs rounded font-mono text-label-lg transition-colors duration-state-change ${
                    timer.durationSeconds === mins * 60
                      ? "bg-primary text-on-primary"
                      : "bg-surface-container border border-outline-variant text-on-surface hover:bg-surface-container-high"
                  }`}
                >
                  {mins} min
                </button>
              ))}
            </div>

            <div
              className={`w-full max-w-2xl py-gutter-xl px-gutter-lg rounded-md border flex flex-col items-center gap-gutter-sm ${
                timer.timerExpired
                  ? "bg-error-container border-error text-on-error-container"
                  : "bg-surface-container-low border-outline-variant text-on-surface"
              }`}
            >
              <span className="font-label text-label-lg uppercase tracking-wider">
                {timerStatusLabel}
              </span>
              <p
                className="font-mono font-bold tabular-nums leading-none"
                style={{
                  fontSize: isFullscreenActive
                    ? "clamp(5rem, 16vw, 11rem)"
                    : "clamp(3.5rem, 10vw, 6.5rem)",
                }}
                aria-live="off"
              >
                {formatClock(timer.remainingSeconds)}
              </p>
              <div className="visually-hidden" role="status" aria-live="polite">
                {timer.timerExpired
                  ? "Classroom timer finished. Time is up."
                  : ""}
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-gutter-sm">
              <button
                type="button"
                onClick={
                  timer.timerRunning ? timer.pauseTimer : timer.startTimer
                }
                className="px-gutter-lg py-gutter-sm rounded bg-primary text-on-primary font-label text-label-lg hover:bg-primary-container focus-visible:outline-2 focus-visible:outline-primary"
              >
                {timer.timerRunning
                  ? "Pause"
                  : timer.remainingSeconds < timer.durationSeconds &&
                      timer.remainingSeconds > 0
                    ? "Resume"
                    : "Start"}
              </button>
              <button
                type="button"
                onClick={timer.resetTimer}
                className="px-gutter-lg py-gutter-sm rounded bg-surface-container-lowest border border-outline-variant font-label text-label-lg text-on-surface hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-primary"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => void toggleFullscreen()}
                className="px-gutter-lg py-gutter-sm rounded bg-surface-container-lowest border border-outline-variant font-label text-label-lg text-on-surface hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-primary"
              >
                {isFullscreenActive ? "Exit Fullscreen" : "Fullscreen"}
              </button>
            </div>

            <form
              onSubmit={handleCustomDurationSubmit}
              className="flex flex-wrap items-end justify-center gap-gutter-md pt-gutter-md border-t border-outline-variant"
            >
              <div className="flex flex-col gap-gutter-xs w-28">
                <label
                  htmlFor={`${baseId}-custom-mins`}
                  className="font-label text-label-md text-on-surface"
                >
                  Minutes
                </label>
                <input
                  id={`${baseId}-custom-mins`}
                  type="number"
                  min={0}
                  max={180}
                  value={timer.customMinutes}
                  onChange={(e) =>
                    timer.setCustomMinutes(
                      Math.max(
                        0,
                        Number.parseInt(e.target.value || "0", 10) || 0,
                      ),
                    )
                  }
                  className={INPUT_CLASS}
                />
              </div>
              <div className="flex flex-col gap-gutter-xs w-28">
                <label
                  htmlFor={`${baseId}-custom-secs`}
                  className="font-label text-label-md text-on-surface"
                >
                  Seconds
                </label>
                <input
                  id={`${baseId}-custom-secs`}
                  type="number"
                  min={0}
                  max={59}
                  value={timer.customSeconds}
                  onChange={(e) =>
                    timer.setCustomSeconds(
                      Math.min(
                        59,
                        Math.max(
                          0,
                          Number.parseInt(e.target.value || "0", 10) || 0,
                        ),
                      ),
                    )
                  }
                  className={INPUT_CLASS}
                />
              </div>
              <button
                type="submit"
                className="px-gutter-md py-gutter-sm rounded bg-surface-container-low border border-outline-variant font-label text-label-lg text-on-surface hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-primary"
              >
                Set Custom Time
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}

function AttendancePoolGrid({
  students,
  absentIndices,
  usedIndices,
  onToggle,
  onResetAll,
}: {
  students: readonly string[];
  absentIndices: ReadonlySet<number>;
  usedIndices: ReadonlySet<number>;
  onToggle: (index: number) => void;
  onResetAll: () => void;
}) {
  const presentCount = students.length - absentIndices.size;
  const calledCount = [...usedIndices].filter(
    (idx) => !absentIndices.has(idx),
  ).length;

  return (
    <div className="lg:col-span-7 bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-lg flex flex-col gap-gutter-md">
      <div className="flex flex-wrap items-center justify-between gap-gutter-sm">
        <div className="flex flex-col">
          <h2 className="font-title text-title-md text-on-surface">
            Attendance &amp; Recitation Pool
          </h2>
          <p className="font-body text-body-sm text-on-surface-variant">
            Click a student to toggle Absent / Present before drawing or
            grouping.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-gutter-xs font-label text-label-sm">
          <span className="px-gutter-sm py-0.5 rounded-full bg-surface-variant text-on-surface-variant">
            Present ({presentCount})
          </span>
          <span className="px-gutter-sm py-0.5 rounded-full bg-success-container text-on-success-container">
            Called ({calledCount})
          </span>
          <span className="px-gutter-sm py-0.5 rounded-full bg-warning-container text-on-warning-container">
            Absent ({absentIndices.size})
          </span>
          {absentIndices.size > 0 && (
            <button
              type="button"
              onClick={onResetAll}
              className="px-gutter-sm py-0.5 rounded border border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container"
            >
              Mark All Present
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-gutter-sm">
        {students.map((name, index) => {
          const isAbsent = absentIndices.has(index);
          const isCalled = !isAbsent && usedIndices.has(index);
          return (
            <button
              key={`${name}-${index}`}
              type="button"
              aria-pressed={!isAbsent}
              onClick={() => onToggle(index)}
              className={`p-gutter-sm rounded border text-left flex items-center justify-between gap-gutter-xs transition-colors duration-state-change focus-visible:outline-2 focus-visible:outline-primary ${
                isAbsent
                  ? "bg-warning-container border-outline-variant text-on-warning-container"
                  : isCalled
                    ? "bg-success-container border-outline-variant text-on-success-container"
                    : "bg-surface-container-low border-outline-variant text-on-surface hover:border-primary"
              }`}
            >
              <span
                className={`font-body text-body-sm truncate ${
                  isAbsent ? "line-through" : ""
                }`}
              >
                {name}
              </span>
              <span className="font-label text-label-sm shrink-0">
                {isAbsent ? "Absent" : isCalled ? "Called" : "Present"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
