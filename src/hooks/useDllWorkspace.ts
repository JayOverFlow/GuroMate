import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  type ClassSection,
  type CurriculumCompetency,
  type DailyLessonLog,
  type DllIntentions,
  type DllSessionConfig,
  type SessionNumber,
  type TleComponent,
} from "../engine/types";
import { readErrorMessage } from "../workspaces/lessonViewHelpers";
import {
  applyDllLaunchTarget,
  createInitialDllSessionConfigs,
  type DllLaunchTarget,
} from "./workspaceLaunchHelpers";

export type { DllLaunchTarget };

export type ViewMode = "edit" | "markdown";

export interface DllStatusState {
  tone: "success" | "error";
  text: string;
}

export type SessionTextFieldKey =
  | "learningObjectives"
  | "preLesson"
  | "lessonFlow"
  | "learningResources"
  | "integrationAndContextualization"
  | "formativeAssessment"
  | "extendedLearningOpportunities"
  | "reflections";

export const SESSION_ILAW_FIELDS: ReadonlyArray<{
  key: SessionTextFieldKey;
  label: string;
  section: string;
  rows?: number;
}> = [
  {
    key: "learningObjectives",
    label: "Learning Objectives",
    section: "I. Intentions",
    rows: 2,
  },
  {
    key: "preLesson",
    label: "Pre-Lesson",
    section: "II. Learning Experience",
    rows: 2,
  },
  {
    key: "lessonFlow",
    label: "Lesson Flow",
    section: "II. Learning Experience",
    rows: 3,
  },
  {
    key: "learningResources",
    label: "Learning Resources",
    section: "II. Learning Experience",
    rows: 2,
  },
  {
    key: "integrationAndContextualization",
    label: "Opportunities for Integration and Contextualization",
    section: "II. Learning Experience",
    rows: 2,
  },
  {
    key: "formativeAssessment",
    label: "Formative Assessment",
    section: "III. Assessing Learning",
    rows: 2,
  },
  {
    key: "extendedLearningOpportunities",
    label: "Extended Learning Opportunities",
    section: "IV. Ways Forward",
    rows: 2,
  },
  {
    key: "reflections",
    label: "Reflections (left blank on .docx export)",
    section: "IV. Ways Forward",
    rows: 2,
  },
];

export const INTENTIONS_LIST_FIELDS: ReadonlyArray<{
  key: Exclude<keyof DllIntentions, "learnerContext">;
  label: string;
}> = [
  { key: "learningCompetencies", label: "Learning Competencies (one per line)" },
  { key: "contentStandards", label: "Content Standards (one per line)" },
  { key: "performanceStandards", label: "Performance Standards (one per line)" },
];

export function useDllWorkspace(
  initialLaunchTarget?: DllLaunchTarget | null,
  onConsumeLaunchTarget?: () => void,
) {
  const [dlls, setDlls] = useState<DailyLessonLog[]>([]);
  const [curriculum, setCurriculum] = useState<CurriculumCompetency[]>([]);
  const [sections, setSections] = useState<ClassSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<DllStatusState | null>(null);

  const [selectedDllId, setSelectedDllId] = useState<string>("");
  const [draftDll, setDraftDll] = useState<DailyLessonLog | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("edit");
  const [saving, setSaving] = useState(false);

  const [lessonTitle, setLessonTitle] = useState("");
  const [gradeAndSection, setGradeAndSection] = useState("");
  const [references, setReferences] = useState("");
  const [promptNotes, setPromptNotes] = useState("");
  const [sessionConfigs, setSessionConfigs] = useState<DllSessionConfig[]>(
    createInitialDllSessionConfigs,
  );
  const [generating, setGenerating] = useState(false);
  const [pickedCompetencyId, setPickedCompetencyId] = useState("");
  const launchIntentRef = useRef(Boolean(initialLaunchTarget));

  const loadWorkspaceData = useCallback(async () => {
    setLoading(true);
    try {
      const [dllRes, currRes, secRes] = await Promise.all([
        fetch("/api/dlls"),
        fetch("/api/curriculum"),
        fetch("/api/class-sections"),
      ]);
      if (!dllRes.ok) throw new Error(await readErrorMessage(dllRes));
      if (!currRes.ok) throw new Error(await readErrorMessage(currRes));
      if (!secRes.ok) throw new Error(await readErrorMessage(secRes));

      const loadedDlls = (await dllRes.json()) as DailyLessonLog[];
      const loadedCurr = (await currRes.json()) as CurriculumCompetency[];
      const loadedSec = (await secRes.json()) as ClassSection[];

      setDlls(loadedDlls);
      setCurriculum(loadedCurr);
      setSections(loadedSec);
      if (loadedSec.length > 0) {
        const first = loadedSec[0]!;
        setGradeAndSection(
          (prev) => prev || `Grade ${first.gradeLevel} - ${first.sectionName}`,
        );
      }
      if (loadedDlls.length > 0 && !launchIntentRef.current) {
        setSelectedDllId((prev) =>
          prev && loadedDlls.some((d) => d.id === prev) ? prev : loadedDlls[0]!.id,
        );
      }
    } catch (err) {
      setStatus({
        tone: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkspaceData();
  }, [loadWorkspaceData]);

  useEffect(() => {
    if (!initialLaunchTarget) return;
    launchIntentRef.current = true;
    setSelectedDllId("");
    setSessionConfigs((prev) => applyDllLaunchTarget(prev, initialLaunchTarget));
    const trimmed = initialLaunchTarget.competencyId.trim();
    if (trimmed) setPickedCompetencyId(trimmed);
    onConsumeLaunchTarget?.();
  }, [initialLaunchTarget, onConsumeLaunchTarget]);

  useEffect(() => {
    const match = dlls.find((d) => d.id === selectedDllId) ?? null;
    setDraftDll(match ? structuredClone(match) : null);
  }, [dlls, selectedDllId]);

  const competencyMap = useMemo(
    () => new Map(curriculum.map((c) => [c.id, c])),
    [curriculum],
  );

  const previewLearningAreas = useMemo(() => {
    const seen = new Set<TleComponent>();
    for (const cfg of sessionConfigs) {
      if (cfg.mode !== "instructional") continue;
      for (const id of cfg.competencyIds) {
        const comp = competencyMap.get(id);
        if (comp) seen.add(comp.component);
      }
    }
    return [...seen].join(", ") || "None selected yet";
  }, [sessionConfigs, competencyMap]);

  function assignCompetencyToSessions(
    targetSessions: SessionNumber[],
    competencyId: string,
  ) {
    if (!competencyId) return;
    const targetSet = new Set(targetSessions);
    setSessionConfigs((prev) =>
      prev.map((cfg) => {
        if (!targetSet.has(cfg.sessionNumber)) return cfg;
        const nextIds = cfg.competencyIds.includes(competencyId)
          ? cfg.competencyIds
          : [...cfg.competencyIds, competencyId];
        return { ...cfg, mode: "instructional", competencyIds: nextIds };
      }),
    );
  }

  function removeCompetencyFromSession(
    sessionNumber: SessionNumber,
    competencyId: string,
  ) {
    setSessionConfigs((prev) =>
      prev.map((cfg) =>
        cfg.sessionNumber === sessionNumber
          ? {
              ...cfg,
              competencyIds: cfg.competencyIds.filter((id) => id !== competencyId),
            }
          : cfg,
      ),
    );
  }

  function updateSessionMode(
    sessionNumber: SessionNumber,
    mode: "instructional" | "non-instructional",
  ) {
    setSessionConfigs((prev) =>
      prev.map((cfg) =>
        cfg.sessionNumber === sessionNumber
          ? {
              ...cfg,
              mode,
              nonInstructionalReason:
                mode === "non-instructional"
                  ? cfg.nonInstructionalReason || "Holiday / School Event"
                  : cfg.nonInstructionalReason,
            }
          : cfg,
      ),
    );
  }

  function updateNonInstructionalReason(
    sessionNumber: SessionNumber,
    reason: string,
  ) {
    setSessionConfigs((prev) =>
      prev.map((cfg) =>
        cfg.sessionNumber === sessionNumber
          ? { ...cfg, nonInstructionalReason: reason }
          : cfg,
      ),
    );
  }

  async function handleGenerate(event: FormEvent) {
    event.preventDefault();
    setStatus(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/dlls/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonTitle,
          gradeAndSection,
          references,
          promptNotes,
          sessions: sessionConfigs,
        }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const created = (await res.json()) as DailyLessonLog;
      setDlls((prev) => [created, ...prev]);
      setSelectedDllId(created.id);
      setViewMode("edit");
      setStatus({
        tone: "success",
        text: `Generated Daily Lesson Log "${created.lessonTitle}" (${created.learningAreas}).`,
      });
    } catch (err) {
      setStatus({
        tone: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setGenerating(false);
    }
  }

  function updateDraftHeader<K extends keyof DailyLessonLog>(
    key: K,
    value: DailyLessonLog[K],
  ) {
    setDraftDll((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function updateDraftSessionField(
    sessionNumber: SessionNumber,
    key: SessionTextFieldKey,
    value: string,
  ) {
    setDraftDll((prev) => {
      if (!prev) return prev;
      const nextSessions = prev.sessions.map((s) =>
        s.sessionNumber === sessionNumber ? { ...s, [key]: value } : s,
      ) as DailyLessonLog["sessions"];
      return { ...prev, sessions: nextSessions };
    });
  }

  async function handleSaveEdits() {
    if (!draftDll) return;
    setStatus(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/dlls/${encodeURIComponent(draftDll.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftDll),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const updated = (await res.json()) as DailyLessonLog;
      setDlls((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item)),
      );
      setStatus({
        tone: "success",
        text: `Saved changes to "${updated.lessonTitle}" on local disk.`,
      });
    } catch (err) {
      setStatus({
        tone: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteDll() {
    if (!draftDll) return;
    setStatus(null);
    try {
      const res = await fetch(`/api/dlls/${encodeURIComponent(draftDll.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const remaining = dlls.filter((d) => d.id !== draftDll.id);
      setDlls(remaining);
      setSelectedDllId(remaining[0]?.id ?? "");
      setStatus({
        tone: "success",
        text: `Deleted "${draftDll.lessonTitle}".`,
      });
    } catch (err) {
      setStatus({
        tone: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    dlls,
    curriculum,
    sections,
    loading,
    status,
    selectedDllId,
    setSelectedDllId,
    draftDll,
    viewMode,
    setViewMode,
    saving,
    lessonTitle,
    setLessonTitle,
    gradeAndSection,
    setGradeAndSection,
    references,
    setReferences,
    promptNotes,
    setPromptNotes,
    sessionConfigs,
    generating,
    pickedCompetencyId,
    setPickedCompetencyId,
    competencyMap,
    previewLearningAreas,
    assignCompetencyToSessions,
    removeCompetencyFromSession,
    updateSessionMode,
    updateNonInstructionalReason,
    handleGenerate,
    updateDraftHeader,
    updateDraftSessionField,
    handleSaveEdits,
    handleDeleteDll,
  };
}
