import { useEffect, useMemo, useState } from "react";
import {
  BOW_TERMS,
  GRADE_LEVELS,
  QUARTERS,
  TLE_COMPONENTS,
  type BowTerm,
  type CurriculumCompetency,
  type GradeLevel,
  type QuarterNumber,
  type TleComponent,
} from "../engine/types";
import { COMPONENT_SHORT_LABELS } from "../hooks/useCurriculumWorkspace";
import {
  filterPickerCompetencies,
  formatCompetencyOptionLabel,
  listAvailableSectors,
} from "./competencyPickerFilters";

interface CurriculumCompetencyPickerProps {
  baseId: string;
  curriculum: CurriculumCompetency[];
  pickedCompetencyId: string;
  onPickCompetencyId: (id: string) => void;
}

const CONTROL_CLASS =
  "w-full px-gutter-sm py-gutter-sm rounded bg-surface-container-lowest border border-outline-variant text-body-md text-on-surface focus:border-primary focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60";

export function CurriculumCompetencyPicker({
  baseId,
  curriculum,
  pickedCompetencyId,
  onPickCompetencyId,
}: CurriculumCompetencyPickerProps) {
  const [filterGrade, setFilterGrade] = useState<GradeLevel | "">("");
  const [filterQuarter, setFilterQuarter] = useState<QuarterNumber | "">("");
  const [filterComponent, setFilterComponent] = useState<TleComponent | "">("");
  const [filterSector, setFilterSector] = useState("");
  const [filterBowTerm, setFilterBowTerm] = useState<BowTerm | "">("");
  const [filterBowOnly, setFilterBowOnly] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");

  const availableSectors = useMemo(
    () =>
      listAvailableSectors(curriculum, {
        grade: filterGrade,
        component: filterComponent,
      }),
    [curriculum, filterGrade, filterComponent],
  );

  const filteredCurriculum = useMemo(
    () =>
      filterPickerCompetencies(curriculum, {
        grade: filterGrade,
        quarter: filterQuarter,
        component: filterComponent,
        sector: filterSector,
        bowTerm: filterBowTerm,
        bowOnly: filterBowOnly,
        query: filterQuery,
      }),
    [
      curriculum,
      filterGrade,
      filterQuarter,
      filterComponent,
      filterSector,
      filterBowTerm,
      filterBowOnly,
      filterQuery,
    ],
  );

  const pickedCompetency = useMemo(
    () =>
      filteredCurriculum.find((item) => item.id === pickedCompetencyId) ?? null,
    [filteredCurriculum, pickedCompetencyId],
  );

  useEffect(() => {
    if (
      filteredCurriculum.length > 0 &&
      !filteredCurriculum.some((c) => c.id === pickedCompetencyId)
    ) {
      onPickCompetencyId(filteredCurriculum[0]!.id);
    } else if (filteredCurriculum.length === 0 && pickedCompetencyId !== "") {
      onPickCompetencyId("");
    }
  }, [filteredCurriculum, pickedCompetencyId, onPickCompetencyId]);

  function clearSectorIfOutOfScope(
    nextGrade: GradeLevel | "",
    nextComponent: TleComponent | "",
  ) {
    if (
      filterSector &&
      !listAvailableSectors(curriculum, {
        grade: nextGrade,
        component: nextComponent,
      }).includes(filterSector)
    ) {
      setFilterSector("");
    }
  }

  function handleGradeChange(raw: string) {
    const nextGrade = raw ? (Number(raw) as GradeLevel) : "";
    setFilterGrade(nextGrade);
    clearSectorIfOutOfScope(nextGrade, filterComponent);
  }

  function handleComponentChange(raw: string) {
    const nextComponent = raw ? (raw as TleComponent) : "";
    setFilterComponent(nextComponent);
    clearSectorIfOutOfScope(filterGrade, nextComponent);
  }

  const pickedBow = pickedCompetency?.budgetOfWork;

  return (
    <div className="flex flex-col gap-gutter-md">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter-sm">
        <div className="flex flex-col gap-gutter-xs">
          <label
            htmlFor={`${baseId}-f-grade`}
            className="font-label text-label-md text-on-surface"
          >
            Grade
          </label>
          <select
            id={`${baseId}-f-grade`}
            value={filterGrade}
            onChange={(e) => handleGradeChange(e.target.value)}
            className={CONTROL_CLASS}
          >
            <option value="">All Grades (7–12)</option>
            {GRADE_LEVELS.map((g) => (
              <option key={g} value={g}>
                Grade {g}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-gutter-xs">
          <label
            htmlFor={`${baseId}-f-comp`}
            className="font-label text-label-md text-on-surface"
          >
            Component
          </label>
          <select
            id={`${baseId}-f-comp`}
            value={filterComponent}
            onChange={(e) => handleComponentChange(e.target.value)}
            className={CONTROL_CLASS}
          >
            <option value="">All Components</option>
            {TLE_COMPONENTS.map((c) => (
              <option key={c} value={c}>
                {COMPONENT_SHORT_LABELS[c]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-gutter-xs">
          <label
            htmlFor={`${baseId}-f-sector`}
            className="font-label text-label-md text-on-surface"
          >
            Sector
          </label>
          <select
            id={`${baseId}-f-sector`}
            value={filterSector}
            onChange={(e) => setFilterSector(e.target.value)}
            disabled={availableSectors.length === 0}
            className={CONTROL_CLASS}
          >
            <option value="">
              {availableSectors.length === 0
                ? "None available"
                : "All Sectors"}
            </option>
            {availableSectors.map((sector) => (
              <option key={sector} value={sector}>
                {sector}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-gutter-xs">
          <label
            htmlFor={`${baseId}-f-quarter`}
            className="font-label text-label-md text-on-surface"
          >
            Quarter
          </label>
          <select
            id={`${baseId}-f-quarter`}
            value={filterQuarter}
            onChange={(e) =>
              setFilterQuarter(
                e.target.value ? (Number(e.target.value) as QuarterNumber) : "",
              )
            }
            className={CONTROL_CLASS}
          >
            <option value="">All Quarters</option>
            {QUARTERS.map((q) => (
              <option key={q} value={q}>
                Quarter {q}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-gutter-sm items-end">
        <div className="flex flex-col gap-gutter-xs lg:col-span-4">
          <label
            htmlFor={`${baseId}-f-bow-term`}
            className="font-label text-label-md text-on-surface"
          >
            Budget of Work (BoW) Term
          </label>
          <select
            id={`${baseId}-f-bow-term`}
            value={filterBowTerm}
            onChange={(e) =>
              setFilterBowTerm((e.target.value as BowTerm | "") ?? "")
            }
            className={CONTROL_CLASS}
          >
            <option value="">All Terms</option>
            {BOW_TERMS.map((term) => (
              <option key={term} value={term}>
                {term}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-gutter-xs lg:col-span-5">
          <label
            htmlFor={`${baseId}-f-query`}
            className="font-label text-label-md text-on-surface"
          >
            Search Competency
          </label>
          <input
            id={`${baseId}-f-query`}
            type="search"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Keyword, topic, sector, or BoW source..."
            className={CONTROL_CLASS}
          />
        </div>

        <div className="flex items-center lg:col-span-3">
          <label
            htmlFor={`${baseId}-f-bow-only`}
            className={`w-full inline-flex items-center gap-gutter-sm px-gutter-sm py-gutter-sm rounded border cursor-pointer font-label text-label-md transition-colors duration-state-change ${
              filterBowOnly
                ? "bg-surface-container-low border-primary text-primary"
                : "bg-surface-container-lowest border-outline-variant text-on-surface"
            }`}
          >
            <input
              id={`${baseId}-f-bow-only`}
              type="checkbox"
              checked={filterBowOnly}
              onChange={(e) => setFilterBowOnly(e.target.checked)}
              className="accent-primary"
            />
            <span>BoW only</span>
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-gutter-xs">
        <label
          htmlFor={`${baseId}-pick-comp`}
          className="font-label text-label-md text-on-surface"
        >
          Learning Competency ({filteredCurriculum.length} matches)
        </label>
        <select
          id={`${baseId}-pick-comp`}
          value={pickedCompetencyId}
          onChange={(e) => onPickCompetencyId(e.target.value)}
          className={CONTROL_CLASS}
        >
          {filteredCurriculum.length === 0 ? (
            <option value="">No matching competencies</option>
          ) : (
            filteredCurriculum.map((item) => (
              <option key={item.id} value={item.id}>
                {formatCompetencyOptionLabel(item)}
              </option>
            ))
          )}
        </select>
      </div>

      {pickedCompetency && pickedBow && (
        <div
          aria-label="Budget of Work Preview"
          className="rounded-md border border-outline-variant bg-surface-container-low p-gutter-md flex flex-col gap-gutter-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-gutter-xs">
            <div className="flex flex-wrap items-center gap-gutter-xs">
              <span className="font-label text-label-md text-primary">
                Budget of Work
              </span>
              {pickedBow.term && (
                <span className="px-gutter-sm py-0.5 rounded-full bg-primary-container text-on-primary-container font-label text-label-sm">
                  {pickedBow.term}
                </span>
              )}
              {pickedBow.weekRange && (
                <span className="px-gutter-sm py-0.5 rounded-full bg-surface-container-lowest border border-outline-variant font-mono text-label-sm text-on-surface-variant tabular-nums">
                  Week {pickedBow.weekRange}
                </span>
              )}
              {pickedCompetency.sector && (
                <span className="px-gutter-sm py-0.5 rounded-full bg-surface-variant text-on-surface-variant font-label text-label-sm">
                  {pickedCompetency.sector}
                </span>
              )}
            </div>
            {pickedBow.sourceDocument && (
              <span className="font-body text-body-sm text-on-surface-variant">
                Source:{" "}
                <span className="font-mono text-mono-md text-on-surface">
                  {pickedBow.sourceDocument}
                </span>
              </span>
            )}
          </div>

          {(pickedBow.suggestedActivities ||
            pickedBow.suggestedPerformanceTasks) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter-md pt-gutter-xs border-t border-outline-variant">
              {pickedBow.suggestedActivities && (
                <div className="flex flex-col gap-gutter-xs">
                  <span className="font-label text-label-sm text-on-surface">
                    Suggested Activities
                  </span>
                  <p className="font-body text-body-sm text-on-surface-variant whitespace-pre-wrap text-pretty">
                    {pickedBow.suggestedActivities}
                  </p>
                </div>
              )}
              {pickedBow.suggestedPerformanceTasks && (
                <div className="flex flex-col gap-gutter-xs">
                  <span className="font-label text-label-sm text-on-surface">
                    Suggested Performance Tasks
                  </span>
                  <p className="font-body text-body-sm text-on-surface-variant whitespace-pre-wrap text-pretty">
                    {pickedBow.suggestedPerformanceTasks}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
