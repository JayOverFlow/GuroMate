import type { RefObject } from "react";
import {
  CLASSROOM_FACILITY_LABELS,
  DELIVERY_MODALITY_LABELS,
  formatPeriodPresetLabel,
} from "../engine/lessonHelpers";
import {
  CLASSROOM_FACILITIES,
  DELIVERY_MODALITIES,
  MAX_PERIOD_MINUTES,
  MIN_PERIOD_MINUTES,
  PERIOD_LENGTH_PRESETS,
  type ClassroomContext,
  type ClassroomFacility,
  type DeliveryModality,
} from "../engine/types";
import { buildDescribedBy } from "../utils/formValidation";
import { FieldError, fieldBorderClass } from "./FieldError";

const SELECT_CLASS =
  "w-full px-gutter-sm py-gutter-xs rounded bg-surface-container-lowest border border-outline-variant text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary focus:border-primary";

export interface ClassroomContextFieldsetProps {
  baseId: string;
  value: ClassroomContext;
  periodDraft: string;
  periodInputRef?: RefObject<HTMLInputElement | null>;
  periodError?: string;
  inheritedNote?: string;
  onSelectPresetMinutes: (minutes: number) => void;
  onChangePeriodDraft: (value: string) => void;
  onBlurPeriodDraft?: () => void;
  onChangeFacility: (facility: ClassroomFacility) => void;
  onChangeModality: (modality: DeliveryModality) => void;
}

export function ClassroomContextFieldset({
  baseId,
  value,
  periodDraft,
  periodInputRef,
  periodError,
  inheritedNote,
  onSelectPresetMinutes,
  onChangePeriodDraft,
  onBlurPeriodDraft,
  onChangeFacility,
  onChangeModality,
}: ClassroomContextFieldsetProps) {
  const periodInputId = `${baseId}-period-minutes`;
  const periodErrId = `${baseId}-period-minutes-err`;
  const facilityId = `${baseId}-facility`;
  const modalityId = `${baseId}-modality`;
  const periodInvalid = Boolean(periodError);

  return (
    <div className="p-gutter-md rounded bg-surface-container-low border border-outline-variant flex flex-col gap-gutter-md">
      <div className="flex flex-wrap items-baseline justify-between gap-gutter-xs">
        <span className="font-title text-title-md text-on-surface">
          Classroom Context
        </span>
        <span className="font-body text-body-sm text-on-surface-variant">
          {inheritedNote ||
            "Shapes pacing and realistic tools/facilities — never written into Learner Context."}
        </span>
      </div>

      <div className="flex flex-col gap-gutter-xs">
        <span className="font-label text-label-md text-on-surface">
          Period Length
        </span>
        <div className="flex flex-wrap items-center gap-gutter-xs">
          {PERIOD_LENGTH_PRESETS.map((minutes) => {
            const active =
              !periodInvalid && Number(periodDraft.trim()) === minutes;
            return (
              <button
                key={minutes}
                type="button"
                aria-pressed={active}
                onClick={() => onSelectPresetMinutes(minutes)}
                className={`px-gutter-sm py-gutter-xs rounded border font-label text-label-md transition-colors duration-state-change focus-visible:outline-2 focus-visible:outline-primary ${
                  active
                    ? "bg-primary text-on-primary border-primary"
                    : "bg-surface-container-lowest text-on-surface border-outline-variant hover:bg-surface-container"
                }`}
              >
                {formatPeriodPresetLabel(minutes)}
              </button>
            );
          })}

          <div className="flex items-center gap-gutter-xs ml-auto">
            <label
              htmlFor={periodInputId}
              className="font-label text-label-sm text-on-surface-variant whitespace-nowrap"
            >
              Custom (min)
            </label>
            <input
              ref={periodInputRef}
              id={periodInputId}
              data-field="periodMinutes"
              type="number"
              inputMode="numeric"
              min={MIN_PERIOD_MINUTES}
              max={MAX_PERIOD_MINUTES}
              step={1}
              aria-invalid={periodInvalid}
              aria-describedby={buildDescribedBy(
                null,
                periodErrId,
                periodInvalid,
              )}
              value={periodDraft}
              onChange={(e) => onChangePeriodDraft(e.target.value)}
              onBlur={onBlurPeriodDraft}
              className={`w-24 px-gutter-sm py-gutter-xs rounded bg-surface-container-lowest border text-body-md font-mono tabular-nums text-on-surface focus-visible:outline-2 focus-visible:outline-primary ${fieldBorderClass(periodInvalid)}`}
            />
          </div>
        </div>
        <FieldError id={periodErrId} message={periodError} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter-md">
        <div className="flex flex-col gap-gutter-xs">
          <label
            htmlFor={facilityId}
            className="font-label text-label-md text-on-surface"
          >
            Facility / Equipment Level
          </label>
          <select
            id={facilityId}
            value={value.facility}
            onChange={(e) =>
              onChangeFacility(e.target.value as ClassroomFacility)
            }
            className={SELECT_CLASS}
          >
            {CLASSROOM_FACILITIES.map((facility) => (
              <option key={facility} value={facility}>
                {CLASSROOM_FACILITY_LABELS[facility]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-gutter-xs">
          <label
            htmlFor={modalityId}
            className="font-label text-label-md text-on-surface"
          >
            Delivery Modality
          </label>
          <select
            id={modalityId}
            value={value.modality}
            onChange={(e) =>
              onChangeModality(e.target.value as DeliveryModality)
            }
            className={SELECT_CLASS}
          >
            {DELIVERY_MODALITIES.map((modality) => (
              <option key={modality} value={modality}>
                {DELIVERY_MODALITY_LABELS[modality]}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
