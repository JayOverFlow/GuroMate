import { useId } from "react";
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
import { GroupMakerStage } from "./classroom/GroupMakerStage";
import { PickerStage } from "./classroom/PickerStage";

interface ClassroomWorkspaceProps {
  timer: ClassroomTimerState;
  openTimerTabSignal?: number;
}

const INPUT_CLASS =
  "w-full px-gutter-md py-gutter-sm rounded bg-surface-container-lowest border border-outline-variant text-body-md text-on-surface focus:border-primary focus-visible:outline-2 focus-visible:outline-primary";

const OVERLAY_STAGE_CLASS =
  "fixed inset-0 z-50 rounded-none border-0 overflow-auto bg-surface p-gutter-xl";

export function ClassroomWorkspace({
  timer,
  openTimerTabSignal = 0,
}: ClassroomWorkspaceProps) {
  const headingId = useId();
  const baseId = useId();

  const {
    stageRefs,
    tabRefs,
    preferences,
    prefersReducedMotion,
    effectivePickerMode,
    soundEnabled,
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
    isPickerSingleSpotlight,
    pickerReelWindow,
    pickerLastLandedWindow,
    pickerCardFlipPlan,
    pickerCardFlipDrawId,
    pickerCardFlipWinner,
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
    handleResetCardSpread,
    handleSkipPicker,
    handleResetPool,
    handleGenerateGroups,
    handleSkipGroupAnimation,
    handleGroupStudentClick,
    handleCustomDurationSubmit,
    toggleProjectorView,
    handleTabKeyDown,
  } = useClassroomWorkspace(timer, openTimerTabSignal);

  const timerStatusLabel = timer.timerExpired
    ? "Time's up!"
    : timer.timerRunning
      ? "Running"
      : timer.remainingSeconds === timer.durationSeconds
        ? "Ready"
        : "Paused";

  const isPickerProjector = projectorTab === "picker";
  const isPickerOverlay = projectorOverlayTab === "picker";
  const isGroupsProjector = projectorTab === "groups";
  const isGroupsOverlay = projectorOverlayTab === "groups";
  const isTimerProjector = projectorTab === "timer";
  const isTimerOverlay = projectorOverlayTab === "timer";

  function handleSoundToggle() {
    if (!soundEnabled) {
      classroomAudio.unlock();
    }
    toggleSound();
  }

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
              disabled={isPickerAnimating || isGroupAnimating}
              onChange={(e) => setSelectedSectionId(e.target.value)}
              className="px-gutter-md py-gutter-sm rounded bg-surface-container-lowest border border-outline-variant text-body-md text-on-surface focus:border-primary focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
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
                disabled={isPickerAnimating || isGroupAnimating}
                onClick={() => {
                  setSectionForm(formFromSection(activeSection));
                  setShowSectionForm(true);
                }}
                className="inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-sm rounded bg-surface-container-lowest border border-outline-variant font-label text-label-md text-on-surface hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
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
                disabled={isPickerAnimating || isGroupAnimating}
                onClick={() => void handleDeleteSection()}
                className="inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-sm rounded bg-surface-container-lowest border border-outline-variant font-label text-label-md text-error hover:bg-error-container/30 focus-visible:outline-2 focus-visible:outline-error disabled:opacity-50"
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
            disabled={isPickerAnimating || isGroupAnimating}
            onClick={() => {
              setSectionForm(emptySectionForm());
              setShowSectionForm((prev) =>
                prev && !sectionForm.id ? false : true,
              );
            }}
            className="shrink-0 whitespace-nowrap inline-flex items-center justify-center gap-gutter-sm px-gutter-md py-gutter-sm rounded bg-primary text-on-primary font-label text-label-lg hover:bg-primary-container focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change disabled:opacity-50"
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
            onClick={() => void toggleProjectorView("timer")}
            className="shrink-0 whitespace-nowrap inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-sm rounded bg-primary text-on-primary text-label-md font-label hover:bg-primary-container focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change"
          >
            <span
              className="material-symbols-outlined text-title-md"
              aria-hidden="true"
            >
              {isTimerProjector ? "fullscreen_exit" : "fullscreen"}
            </span>
            <span>
              {isTimerProjector ? "Exit Projector View" : "Projector View"}
            </span>
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

      {/* Tool Tabs & Shared Classroom Audio Control */}
      <div className="flex flex-col gap-gutter-md">
        <div className="flex flex-wrap items-center justify-between gap-gutter-sm">
          <div
            role="tablist"
            aria-label="Classroom Tools"
            className="inline-flex flex-wrap items-center gap-gutter-xs p-gutter-xs rounded bg-surface-container border border-outline-variant"
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

          <SoundToggleButton
            soundEnabled={soundEnabled}
            prefersReducedMotion={prefersReducedMotion}
            onToggle={handleSoundToggle}
          />
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
              {/* Random Student Picker Stage (Projector View + Slot Machine / Card Flip / Instant) */}
              <PickerStage
                stageRef={(el) => {
                  stageRefs.current.picker = el;
                }}
                isProjector={isPickerProjector}
                isOverlay={isPickerOverlay}
                sectionName={activeSection.sectionName}
                totalStudents={activeSection.students.length}
                presentStudents={presentStudents}
                remainingInPoolCount={remainingInPoolCount}
                removePickedFromPool={removePickedFromPool}
                onRemovePickedFromPoolChange={(checked) => {
                  setRemovePickedFromPool(checked);
                  setPoolExhausted(false);
                }}
                pickerMode={preferences.pickerMode}
                effectivePickerMode={effectivePickerMode}
                prefersReducedMotion={prefersReducedMotion}
                onPickerModeChange={setPickerAnimationMode}
                pickedStudent={pickedStudent}
                poolExhausted={poolExhausted}
                isAnimating={isPickerAnimating}
                isSingleStudentSpotlight={isPickerSingleSpotlight}
                reelWindow={pickerReelWindow}
                lastLandedWindow={pickerLastLandedWindow}
                cardFlipPlan={pickerCardFlipPlan}
                cardFlipDrawId={pickerCardFlipDrawId}
                cardFlipWinner={pickerCardFlipWinner}
                cardFlipFrame={pickerCardFlipFrame}
                revealedCard={pickerRevealedCard}
                revealCount={pickerRevealCount}
                onPickStudent={handlePickStudent}
                onPickCardSlot={handlePickCardSlot}
                onResetCardSpread={handleResetCardSpread}
                onSkip={handleSkipPicker}
                onResetPool={handleResetPool}
                soundControl={
                  <SoundToggleButton
                    soundEnabled={soundEnabled}
                    prefersReducedMotion={prefersReducedMotion}
                    onToggle={handleSoundToggle}
                  />
                }
                projectorControl={
                  <ProjectorToggleButton
                    active={isPickerProjector}
                    onToggle={() => void toggleProjectorView("picker")}
                  />
                }
              />

              {/* Roster Attendance & Recitation Pool */}
              <AttendancePoolGrid
                students={activeSection.students}
                absentIndices={absentIndices}
                usedIndices={usedIndices}
                disabled={isPickerAnimating}
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
              <GroupMakerStage
                baseId={baseId}
                stageRef={(el) => {
                  stageRefs.current.groups = el;
                }}
                isProjector={isGroupsProjector}
                isProjectorOverlay={isGroupsOverlay}
                presentCount={presentStudents.length}
                groupMode={groupMode}
                onGroupModeChange={setGroupMode}
                groupValue={groupValue}
                onGroupValueChange={setGroupValue}
                groups={groups}
                swapSelection={swapSelection}
                animationMode={preferences.groupMode}
                prefersReducedMotion={prefersReducedMotion}
                onAnimationModeChange={setGroupAnimationMode}
                playback={groupPlayback}
                isAnimating={isGroupAnimating}
                generationCount={groupGenerationCount}
                onGenerateGroups={handleGenerateGroups}
                onSkipAnimation={handleSkipGroupAnimation}
                onStudentClick={handleGroupStudentClick}
                soundToggle={
                  <SoundToggleButton
                    soundEnabled={soundEnabled}
                    prefersReducedMotion={prefersReducedMotion}
                    onToggle={handleSoundToggle}
                  />
                }
                projectorToggle={
                  <ProjectorToggleButton
                    active={isGroupsProjector}
                    onToggle={() => void toggleProjectorView("groups")}
                  />
                }
              />

              <AttendancePoolGrid
                students={activeSection.students}
                absentIndices={absentIndices}
                usedIndices={usedIndices}
                disabled={isGroupAnimating}
                onToggle={toggleAbsent}
                onResetAll={resetAllAttendance}
              />
            </div>
          )}
        </div>

        {/* Panel 3: Classroom Timer (Projector View & Custom Duration) */}
        <div
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-timer`}
          hidden={activeTab !== "timer"}
        >
          <div
            ref={(el) => {
              stageRefs.current.timer = el;
            }}
            role={isTimerOverlay ? "dialog" : undefined}
            aria-modal={isTimerOverlay ? true : undefined}
            aria-label={
              isTimerOverlay ? "Classroom Timer Projector View" : undefined
            }
            tabIndex={isTimerOverlay ? -1 : undefined}
            className={`classroom-projector-stage bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-xl flex flex-col items-center gap-gutter-lg ${
              isTimerOverlay ? `${OVERLAY_STAGE_CLASS} justify-center` : ""
            }`}
          >
            <div
              className={`w-full flex flex-col items-center gap-gutter-lg ${
                isTimerProjector ? "max-w-3xl mx-auto my-auto" : ""
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
                    fontSize: isTimerProjector
                      ? "clamp(5rem, 16vw, 11rem)"
                      : "clamp(3.5rem, 10vw, 6.5rem)",
                  }}
                  aria-live="off"
                >
                  {formatClock(timer.remainingSeconds)}
                </p>
                <div
                  className="visually-hidden"
                  role="status"
                  aria-live="polite"
                >
                  {timer.timerExpired
                    ? "Classroom timer finished. Time is up."
                    : ""}
                </div>
              </div>

              <div className="flex flex-wrap justify-center items-center gap-gutter-sm">
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
                <ProjectorToggleButton
                  active={isTimerProjector}
                  onToggle={() => void toggleProjectorView("timer")}
                />
                {isTimerProjector && (
                  <SoundToggleButton
                    soundEnabled={soundEnabled}
                    prefersReducedMotion={prefersReducedMotion}
                    onToggle={handleSoundToggle}
                  />
                )}
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
      </div>
    </section>
  );
}

function SoundToggleButton({
  soundEnabled,
  prefersReducedMotion,
  onToggle,
}: {
  soundEnabled: boolean;
  prefersReducedMotion: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-label="Sound"
      aria-pressed={soundEnabled}
      title={
        prefersReducedMotion
          ? "Classroom cues are silenced while reduced motion is active"
          : soundEnabled
            ? "Mute classroom sound cues"
            : "Enable classroom sound cues"
      }
      onClick={onToggle}
      className={`shrink-0 whitespace-nowrap inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-sm rounded border font-label text-label-md transition-colors duration-state-change focus-visible:outline-2 focus-visible:outline-primary ${
        soundEnabled && !prefersReducedMotion
          ? "bg-surface-container-lowest border-primary/40 text-primary hover:bg-surface-container-low"
          : "bg-surface-container-low border-outline-variant text-on-surface-variant hover:bg-surface-container"
      }`}
    >
      <span
        className="material-symbols-outlined text-title-md"
        aria-hidden="true"
      >
        {soundEnabled ? "volume_up" : "volume_off"}
      </span>
      <span aria-hidden="true">{soundEnabled ? "Sound On" : "Sound Off"}</span>
    </button>
  );
}

function ProjectorToggleButton({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`shrink-0 whitespace-nowrap inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-sm rounded border font-label text-label-md transition-colors duration-state-change focus-visible:outline-2 focus-visible:outline-primary ${
        active
          ? "bg-secondary text-on-secondary border-secondary hover:bg-secondary/90"
          : "bg-surface-container-lowest border-outline-variant text-on-surface hover:bg-surface-container-low"
      }`}
    >
      <span
        className="material-symbols-outlined text-title-md"
        aria-hidden="true"
      >
        {active ? "fullscreen_exit" : "fullscreen"}
      </span>
      <span>{active ? "Exit Projector View" : "Projector View"}</span>
    </button>
  );
}

function AttendancePoolGrid({
  students,
  absentIndices,
  usedIndices,
  disabled = false,
  onToggle,
  onResetAll,
}: {
  students: readonly string[];
  absentIndices: ReadonlySet<number>;
  usedIndices: ReadonlySet<number>;
  disabled?: boolean;
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
              disabled={disabled}
              onClick={onResetAll}
              className="px-gutter-sm py-0.5 rounded border border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container disabled:opacity-50"
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
              disabled={disabled}
              aria-pressed={!isAbsent}
              onClick={() => onToggle(index)}
              className={`p-gutter-sm rounded border text-left flex items-center justify-between gap-gutter-xs transition-colors duration-state-change focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50 ${
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
