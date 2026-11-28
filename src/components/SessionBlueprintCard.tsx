import { formatLearningAreas } from "../engine/lessonHelpers";
import type {
  BlueprintActivityOption,
  BlueprintAssessmentOption,
  FormativeAssessmentType,
  TleComponent,
} from "../engine/types";

export interface SessionBlueprintCardProps {
  baseId: string;
  heading: string;
  components: TleComponent[];
  progressionFocus: string;
  learningObjectives: string;
  activityOptions: BlueprintActivityOption[];
  selectedActivityId: string;
  assessmentOptions: BlueprintAssessmentOption[];
  selectedAssessmentType?: FormativeAssessmentType;
  disabled?: boolean;
  locked?: boolean;
  lockNotice?: string;
  onChangeObjectives: (value: string) => void;
  onSelectActivity: (activityId: string) => void;
  onSelectAssessment: (assessmentType: FormativeAssessmentType) => void;
}

/** Interactive Lesson Blueprint card for a single instructional Session (reusable for DLL and DLP). */
export function SessionBlueprintCard({
  baseId,
  heading,
  components,
  progressionFocus,
  learningObjectives,
  activityOptions,
  selectedActivityId,
  assessmentOptions,
  selectedAssessmentType,
  disabled = false,
  locked = false,
  lockNotice,
  onChangeObjectives,
  onSelectActivity,
  onSelectAssessment,
}: SessionBlueprintCardProps) {
  const objectivesId = `${baseId}-objectives`;
  const controlsDisabled = disabled || locked;

  return (
    <article className="rounded-md border border-outline-variant bg-surface-container-lowest p-gutter-md flex flex-col gap-gutter-md">
      <header className="flex flex-wrap items-center justify-between gap-gutter-xs pb-gutter-xs border-b border-outline-variant">
        <div className="flex flex-wrap items-center gap-gutter-xs">
          <h3 className="font-mono text-mono-md font-semibold text-on-surface">
            {heading}
          </h3>
          {components.length > 0 && (
            <span className="px-gutter-sm py-0.5 rounded-full bg-tertiary-container text-on-tertiary-container font-label text-label-sm">
              {formatLearningAreas(components)}
            </span>
          )}
          {locked && (
            <span className="inline-flex items-center gap-1 px-gutter-sm py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-label text-label-sm">
              <span
                className="material-symbols-outlined text-body-sm"
                aria-hidden="true"
              >
                lock
              </span>
              <span>Locked to Parent DLL Session</span>
            </span>
          )}
        </div>
        {progressionFocus.trim() && (
          <span className="font-body text-body-sm text-on-surface-variant">
            {progressionFocus}
          </span>
        )}
      </header>

      {lockNotice && (
        <div className="rounded border border-outline-variant bg-surface-container-low px-gutter-sm py-gutter-xs flex items-start gap-gutter-xs font-body text-body-sm text-on-surface-variant">
          <span
            className="material-symbols-outlined text-title-md text-primary shrink-0"
            aria-hidden="true"
          >
            lock
          </span>
          <span>{lockNotice}</span>
        </div>
      )}

      {/* Inline Editable Learning Objectives */}
      <div className="flex flex-col gap-gutter-xs">
        <div className="flex flex-wrap items-center justify-between gap-gutter-xs">
          <label
            htmlFor={objectivesId}
            className="font-label text-label-md text-on-surface"
          >
            {locked
              ? "Learning Objectives (locked to parent DLL Session)"
              : "Learning Objectives (3 SMART bullets, editable)"}
          </label>
          <span className="font-body text-body-sm text-on-surface-variant">
            Cognitive → Psychomotor → Affective (no domain prefixes)
          </span>
        </div>
        <textarea
          id={objectivesId}
          rows={3}
          disabled={disabled}
          readOnly={locked}
          aria-readonly={locked || undefined}
          value={learningObjectives}
          onChange={(e) => {
            if (!locked) onChangeObjectives(e.target.value);
          }}
          className="w-full px-gutter-sm py-gutter-xs rounded bg-surface-container-low border border-outline-variant text-body-sm text-on-surface focus:border-primary focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60 read-only:opacity-85"
        />
      </div>

      {/* Learning Experience Activity Options */}
      <div className="flex flex-col gap-gutter-xs">
        <span className="font-label text-label-md text-on-surface">
          {locked
            ? "Learning Experience Activity (locked to parent DLL Session)"
            : "Learning Experience Activity (choose one)"}
        </span>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter-sm">
          {activityOptions.map((option) => {
            const active = option.id === selectedActivityId;
            return (
              <button
                key={option.id}
                type="button"
                disabled={controlsDisabled}
                aria-pressed={active}
                onClick={() => onSelectActivity(option.id)}
                className={`text-left rounded-md border p-gutter-sm flex flex-col gap-gutter-xs transition-colors duration-state-change focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-75 ${
                  active
                    ? "bg-primary-container/25 border-primary text-on-surface"
                    : "bg-surface-container-low border-outline-variant text-on-surface hover:bg-surface-container"
                }`}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-label text-label-md font-semibold text-on-surface">
                    {option.title}
                  </span>
                  {option.recommended && (
                    <span className="px-1.5 py-0.5 rounded-full bg-primary text-on-primary font-label text-label-sm">
                      (Recommended)
                    </span>
                  )}
                  {option.source === "bow" && (
                    <span className="px-1.5 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label text-label-sm">
                      BoW
                    </span>
                  )}
                  {option.source === "derived" && (
                    <span className="px-1.5 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label text-label-sm">
                      Parent DLL
                    </span>
                  )}
                </div>
                <p className="font-body text-body-sm text-on-surface-variant">
                  {option.summary}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Formative Assessment Type Selector (5 DO 8, s. 2015 types) */}
      <div className="flex flex-col gap-gutter-xs">
        <span className="font-label text-label-md text-on-surface">
          {locked
            ? "Formative Assessment Type (locked to parent DLL Session)"
            : "Formative Assessment Type (choose one)"}
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-gutter-xs">
          {assessmentOptions.map((option) => {
            const active = option.type === selectedAssessmentType;
            return (
              <button
                key={option.type}
                type="button"
                disabled={controlsDisabled}
                aria-pressed={active}
                onClick={() => onSelectAssessment(option.type)}
                className={`text-left rounded-md border p-gutter-sm flex flex-col gap-1 transition-colors duration-state-change focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-75 ${
                  active
                    ? "bg-primary-container/25 border-primary text-on-surface"
                    : "bg-surface-container-low border-outline-variant text-on-surface hover:bg-surface-container"
                }`}
              >
                <div className="flex flex-wrap items-center gap-1">
                  <span className="font-label text-label-sm font-semibold text-on-surface">
                    {option.label}
                  </span>
                  {option.recommended && (
                    <span className="px-1.5 py-0.5 rounded-full bg-primary text-on-primary font-label text-label-sm">
                      (Recommended)
                    </span>
                  )}
                </div>
                <p className="font-body text-body-sm text-on-surface-variant">
                  {option.preview}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </article>
  );
}
