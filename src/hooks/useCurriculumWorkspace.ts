import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  type BudgetOfWorkInfo,
  type CurriculumCompetency,
  type GradeLevel,
  type QuarterNumber,
  type TleComponent,
} from "../engine/types";

export const COMPONENT_LABELS: Record<TleComponent, string> = {
  ICT: "ICT — Information & Communications Technology",
  AFA: "AFA — Agriculture & Fishery Arts",
  FCS: "FCS — Family & Consumer Science",
  IA: "IA — Industrial Arts",
};

export interface CurriculumStatusState {
  tone: "success" | "error";
  text: string;
}

export interface CustomFormState {
  id?: string;
  gradeLevels: GradeLevel[];
  quarters: QuarterNumber[];
  component: TleComponent;
  sector: string;
  contentTopic: string;
  contentSubTopicsText: string;
  contentStandard: string;
  performanceStandard: string;
  learningCompetency: string;
  budgetOfWork: BudgetOfWorkInfo;
  customNotes: string;
}

export function emptyCustomForm(): CustomFormState {
  return {
    gradeLevels: [7],
    quarters: [1],
    component: "ICT",
    sector: "",
    contentTopic: "",
    contentSubTopicsText: "",
    contentStandard: "",
    performanceStandard: "",
    learningCompetency: "",
    budgetOfWork: {
      term: "",
      weekRange: "",
      suggestedActivities: "",
      suggestedPerformanceTasks: "",
    },
    customNotes: "",
  };
}

export function formFromItem(item: CurriculumCompetency): CustomFormState {
  return {
    id: item.id,
    gradeLevels: [...item.gradeLevels],
    quarters: [...item.quarters],
    component: item.component,
    sector: item.sector ?? "",
    contentTopic: item.contentTopic,
    contentSubTopicsText: item.contentSubTopics.join("\n"),
    contentStandard: item.contentStandard,
    performanceStandard: item.performanceStandard,
    learningCompetency: item.learningCompetency,
    budgetOfWork: {
      term: item.budgetOfWork?.term ?? "",
      weekRange: item.budgetOfWork?.weekRange ?? "",
      suggestedActivities: item.budgetOfWork?.suggestedActivities ?? "",
      suggestedPerformanceTasks:
        item.budgetOfWork?.suggestedPerformanceTasks ?? "",
    },
    customNotes: item.customNotes ?? "",
  };
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string; message?: string };
    return data.error || data.message || `Request failed (HTTP ${res.status}).`;
  } catch {
    return `Request failed (HTTP ${res.status}).`;
  }
}

export function toggleArrayValue<T extends number>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value].sort((a, b) => a - b);
}

export function formatGradeLabel(grades: GradeLevel[]): string {
  return grades.length > 1
    ? `Grades ${grades.join("–")}`
    : `Grade ${grades[0] ?? ""}`;
}

export function useCurriculumWorkspace() {
  const [allCatalog, setAllCatalog] = useState<CurriculumCompetency[]>([]);
  const [items, setItems] = useState<CurriculumCompetency[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<CurriculumStatusState | null>(null);

  const [gradeLevel, setGradeLevel] = useState<GradeLevel | "">("");
  const [quarterOrTerm, setQuarterOrTerm] = useState<string>("");
  const [component, setComponent] = useState<TleComponent | "">("");
  const [sector, setSector] = useState<string>("");
  const [query, setQuery] = useState<string>("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState<string>("");
  const [savingNotes, setSavingNotes] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [formState, setFormState] = useState<CustomFormState>(emptyCustomForm);
  const [savingCustom, setSavingCustom] = useState(false);

  const reportError = useCallback((err: unknown) => {
    setStatus({
      tone: "error",
      text: `Error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }, []);

  const sectorsForScope = useCallback(
    (nextGrade: GradeLevel | "", nextComponent: TleComponent | "") => {
      const set = new Set<string>();
      for (const item of allCatalog) {
        if (!item.sector) continue;
        if (nextGrade !== "" && !item.gradeLevels.includes(nextGrade)) continue;
        if (nextComponent !== "" && item.component !== nextComponent) continue;
        set.add(item.sector);
      }
      return [...set].sort();
    },
    [allCatalog],
  );

  const availableSectors = useMemo(
    () => sectorsForScope(gradeLevel, component),
    [sectorsForScope, gradeLevel, component],
  );

  const allSectors = useMemo(
    () => sectorsForScope("", ""),
    [sectorsForScope],
  );

  const buildFilterUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (gradeLevel !== "") params.set("gradeLevel", String(gradeLevel));
    if (quarterOrTerm.startsWith("q:")) {
      params.set("quarter", quarterOrTerm.slice(2));
    } else if (quarterOrTerm.startsWith("t:")) {
      params.set("term", quarterOrTerm.slice(2));
    }
    if (component !== "") params.set("component", component);
    if (sector) params.set("sector", sector);
    if (query.trim()) params.set("query", query.trim());
    const qs = params.toString();
    return qs ? `/api/curriculum?${qs}` : "/api/curriculum";
  }, [gradeLevel, quarterOrTerm, component, sector, query]);

  const reloadFullCatalog = useCallback(async (signal?: AbortSignal) => {
    const res = await fetch("/api/curriculum", { signal });
    if (!res.ok) throw new Error(await readErrorMessage(res));
    const data = (await res.json()) as CurriculumCompetency[];
    setAllCatalog(data);
  }, []);

  const reloadFiltered = useCallback(
    async (preferredId?: string, signal?: AbortSignal) => {
      const res = await fetch(buildFilterUrl(), { signal });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const filtered = (await res.json()) as CurriculumCompetency[];
      setItems(filtered);
      setSelectedId((prev) => {
        const targetId = preferredId ?? prev;
        if (targetId && filtered.some((i) => i.id === targetId)) {
          return targetId;
        }
        return filtered[0]?.id ?? null;
      });
    },
    [buildFilterUrl],
  );

  useEffect(() => {
    const controller = new AbortController();
    void reloadFullCatalog(controller.signal).catch((err) => {
      if (!controller.signal.aborted) reportError(err);
    });
    return () => controller.abort();
  }, [reloadFullCatalog, reportError]);

  useEffect(() => {
    const controller = new AbortController();
    void reloadFiltered(undefined, controller.signal)
      .catch((err) => {
        if (!controller.signal.aborted) reportError(err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadFiltered, reportError]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  useEffect(() => {
    setNotesDraft(selectedItem?.customNotes ?? "");
  }, [selectedItem?.id, selectedItem?.customNotes]);

  function handleGradeChange(raw: string) {
    const nextGrade = raw ? (Number(raw) as GradeLevel) : "";
    setGradeLevel(nextGrade);
    if (sector && !sectorsForScope(nextGrade, component).includes(sector)) {
      setSector("");
    }
  }

  function handleComponentChange(raw: string) {
    const nextComp = raw ? (raw as TleComponent) : "";
    setComponent(nextComp);
    if (sector && !sectorsForScope(gradeLevel, nextComp).includes(sector)) {
      setSector("");
    }
  }

  async function refreshAfterMutation(preferredId?: string) {
    await Promise.all([reloadFullCatalog(), reloadFiltered(preferredId)]);
  }

  async function handleSaveNotes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedItem) return;
    setSavingNotes(true);
    setStatus(null);
    try {
      const res = await fetch(
        `/api/curriculum/${encodeURIComponent(selectedItem.id)}/notes`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customNotes: notesDraft }),
        },
      );
      if (!res.ok) throw new Error(await readErrorMessage(res));
      await refreshAfterMutation(selectedItem.id);
      setStatus({
        tone: "success",
        text: "Unpacked Budget of Work notes saved to local disk.",
      });
    } catch (err) {
      reportError(err);
    } finally {
      setSavingNotes(false);
    }
  }

  async function handleSaveCustom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingCustom(true);
    setStatus(null);
    try {
      const payload = {
        gradeLevels: formState.gradeLevels,
        quarters: formState.quarters,
        component: formState.component,
        sector: formState.sector.trim() || null,
        contentTopic: formState.contentTopic,
        contentSubTopics: formState.contentSubTopicsText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        contentStandard: formState.contentStandard,
        performanceStandard: formState.performanceStandard,
        learningCompetency: formState.learningCompetency,
        customNotes: formState.customNotes,
        budgetOfWork: formState.budgetOfWork,
      };

      const isEdit = Boolean(formState.id);
      const url = isEdit
        ? `/api/curriculum/custom/${encodeURIComponent(formState.id!)}`
        : "/api/curriculum/custom";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const saved = (await res.json()) as CurriculumCompetency;
      setShowForm(false);
      setFormState(emptyCustomForm());
      await refreshAfterMutation(saved.id);
      setStatus({
        tone: "success",
        text: isEdit
          ? "Custom Learning Competency updated."
          : "Custom Learning Competency added to local catalog.",
      });
    } catch (err) {
      reportError(err);
    } finally {
      setSavingCustom(false);
    }
  }

  async function handleDeleteCustom(item: CurriculumCompetency) {
    setStatus(null);
    try {
      const res = await fetch(
        `/api/curriculum/custom/${encodeURIComponent(item.id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(await readErrorMessage(res));
      await refreshAfterMutation();
      setStatus({
        tone: "success",
        text: "Custom Learning Competency deleted.",
      });
    } catch (err) {
      reportError(err);
    }
  }

  return {
    allCatalog,
    items,
    loading,
    status,
    gradeLevel,
    quarterOrTerm,
    setQuarterOrTerm,
    component,
    sector,
    setSector,
    query,
    setQuery,
    availableSectors,
    allSectors,
    selectedId,
    setSelectedId,
    selectedItem,
    notesDraft,
    setNotesDraft,
    savingNotes,
    showForm,
    setShowForm,
    formState,
    setFormState,
    savingCustom,
    handleGradeChange,
    handleComponentChange,
    handleSaveNotes,
    handleSaveCustom,
    handleDeleteCustom,
  };
}
