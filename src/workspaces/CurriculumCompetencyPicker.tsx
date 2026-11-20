import { useEffect, useMemo, useState } from "react";
import {
  GRADE_LEVELS,
  QUARTERS,
  TLE_COMPONENTS,
  type CurriculumCompetency,
  type GradeLevel,
  type QuarterNumber,
  type TleComponent,
} from "../engine/types";

interface CurriculumCompetencyPickerProps {
  baseId: string;
  curriculum: CurriculumCompetency[];
  pickedCompetencyId: string;
  onPickCompetencyId: (id: string) => void;
}

export function CurriculumCompetencyPicker({
  baseId,
  curriculum,
  pickedCompetencyId,
  onPickCompetencyId,
}: CurriculumCompetencyPickerProps) {
  const [filterGrade, setFilterGrade] = useState<GradeLevel | "">("");
  const [filterQuarter, setFilterQuarter] = useState<QuarterNumber | "">("");
  const [filterComponent, setFilterComponent] = useState<TleComponent | "">("");
  const [filterQuery, setFilterQuery] = useState("");

  const filteredCurriculum = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    return curriculum.filter((item) => {
      if (filterGrade !== "" && !item.gradeLevels.includes(filterGrade)) return false;
      if (filterQuarter !== "" && !item.quarters.includes(filterQuarter)) return false;
      if (filterComponent !== "" && item.component !== filterComponent) return false;
      if (q) {
        const hay =
          `${item.learningCompetency} ${item.contentTopic} ${item.sector ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [curriculum, filterGrade, filterQuarter, filterComponent, filterQuery]);

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

  return (
    <>
      <div className="curriculum-filters">
        <div className="field">
          <label htmlFor={`${baseId}-f-grade`}>Grade</label>
          <select
            id={`${baseId}-f-grade`}
            value={filterGrade}
            onChange={(e) =>
              setFilterGrade(
                e.target.value ? (Number(e.target.value) as GradeLevel) : "",
              )
            }
          >
            <option value="">All Grades</option>
            {GRADE_LEVELS.map((g) => (
              <option key={g} value={g}>
                Grade {g}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor={`${baseId}-f-quarter`}>Quarter</label>
          <select
            id={`${baseId}-f-quarter`}
            value={filterQuarter}
            onChange={(e) =>
              setFilterQuarter(
                e.target.value ? (Number(e.target.value) as QuarterNumber) : "",
              )
            }
          >
            <option value="">All Quarters</option>
            {QUARTERS.map((q) => (
              <option key={q} value={q}>
                Quarter {q}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor={`${baseId}-f-comp`}>TLE Component</label>
          <select
            id={`${baseId}-f-comp`}
            value={filterComponent}
            onChange={(e) =>
              setFilterComponent((e.target.value as TleComponent | "") ?? "")
            }
          >
            <option value="">All Components</option>
            {TLE_COMPONENTS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor={`${baseId}-f-query`}>Search Competency</label>
          <input
            id={`${baseId}-f-query`}
            type="search"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Keyword or topic..."
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor={`${baseId}-pick-comp`}>
          Learning Competency ({filteredCurriculum.length} matches)
        </label>
        <select
          id={`${baseId}-pick-comp`}
          value={pickedCompetencyId}
          onChange={(e) => onPickCompetencyId(e.target.value)}
        >
          {filteredCurriculum.length === 0 ? (
            <option value="">No matching competencies</option>
          ) : (
            filteredCurriculum.map((item) => (
              <option key={item.id} value={item.id}>
                [{item.component}] {item.contentTopic} — {item.learningCompetency}
              </option>
            ))
          )}
        </select>
      </div>
    </>
  );
}
