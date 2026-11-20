import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import rawCatalog from "./curriculumCatalog.json";
import { createLiveAiAdapter } from "./liveAiAdapter";
import { AI_PROVIDER_MAP } from "./providers";
import {
  GRADE_LEVELS,
  QUARTERS,
  TLE_COMPONENTS,
  type AiConnectionCheckResult,
  type AiProviderSettings,
  type BudgetOfWorkInfo,
  type CurriculumCompetency,
  type CurriculumFilter,
  type CustomCompetencyInput,
  type GuroMateEngine,
  type GuroMateEngineOptions,
  type GuroMateSettings,
  type GradeLevel,
  type QuarterNumber,
  type SettingsPatch,
  type TeacherProfileSettings,
  type TleComponent,
} from "./types";

const BUILTIN_CATALOG = rawCatalog as CurriculumCompetency[];
const VALID_GRADES = new Set<GradeLevel>(GRADE_LEVELS);
const VALID_QUARTERS = new Set<QuarterNumber>(QUARTERS);
const VALID_COMPONENTS = new Set<TleComponent>(TLE_COMPONENTS);
const QUARTER_ROMAN: Record<QuarterNumber, string> = {
  1: "I",
  2: "II",
  3: "III",
  4: "IV",
};

interface CustomCurriculumStore {
  customCompetencies: CurriculumCompetency[];
  notesByCompetencyId: Record<string, string>;
}

function emptyCustomStore(): CustomCurriculumStore {
  return { customCompetencies: [], notesByCompetencyId: {} };
}

async function readJsonOrDefault<T>(filePath: string, fallback: () => T): Promise<T> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return fallback();
    }
    throw err;
  }
}

async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(data, null, 2) + "\n", "utf8");
  await rename(tmpPath, filePath);
}

function formatQuarterLabel(quarters: QuarterNumber[]): string {
  const sorted = [...new Set(quarters)].sort((a, b) => a - b);
  return `Quarter ${sorted.map((q) => QUARTER_ROMAN[q]).join("/")}`;
}

function normalizeBudgetOfWork(
  bow?: Partial<BudgetOfWorkInfo>,
): BudgetOfWorkInfo | undefined {
  if (!bow) return undefined;
  const term = (bow.term ?? "").trim();
  const weekRange = (bow.weekRange ?? "").trim();
  const suggestedActivities = (bow.suggestedActivities ?? "").trim();
  const suggestedPerformanceTasks = (bow.suggestedPerformanceTasks ?? "").trim();
  if (!term && !weekRange && !suggestedActivities && !suggestedPerformanceTasks) {
    return undefined;
  }
  return {
    term,
    weekRange,
    suggestedActivities,
    suggestedPerformanceTasks,
  };
}

function validateAndBuildCustomCompetency(
  input: CustomCompetencyInput,
  existingId?: string,
): CurriculumCompetency {
  const gradeLevels = [...new Set(input.gradeLevels)].filter((g) =>
    VALID_GRADES.has(g),
  );
  if (gradeLevels.length === 0) {
    throw new CurriculumValidationError(
      "At least one valid Grade Level (7-10) is required.",
    );
  }
  const quarters = [...new Set(input.quarters)]
    .filter((q) => VALID_QUARTERS.has(q))
    .sort((a, b) => a - b);
  if (quarters.length === 0) {
    throw new CurriculumValidationError(
      "At least one valid Quarter (1-4) is required.",
    );
  }
  if (!VALID_COMPONENTS.has(input.component)) {
    throw new CurriculumValidationError(
      `Unsupported TLE Component: ${String(input.component)}`,
    );
  }
  const contentTopic = input.contentTopic.trim();
  if (!contentTopic) {
    throw new CurriculumValidationError("Content topic is required.");
  }
  const contentStandard = input.contentStandard.trim();
  if (!contentStandard) {
    throw new CurriculumValidationError("Content Standard is required.");
  }
  const performanceStandard = input.performanceStandard.trim();
  if (!performanceStandard) {
    throw new CurriculumValidationError("Performance Standard is required.");
  }
  const learningCompetency = input.learningCompetency.trim();
  if (!learningCompetency) {
    throw new CurriculumValidationError("Learning Competency is required.");
  }

  const sector = input.sector?.trim() || null;
  const contentSubTopics = (input.contentSubTopics ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
  const customNotes = input.customNotes?.trim() || undefined;
  const budgetOfWork = normalizeBudgetOfWork(input.budgetOfWork);

  return {
    id: existingId ?? `custom-${randomUUID().slice(0, 8)}`,
    source: "custom",
    gradeLevels: gradeLevels.sort((a, b) => a - b),
    quarters,
    quarterLabel: formatQuarterLabel(quarters),
    component: input.component,
    sector,
    sectorDescription: null,
    contentTopic,
    contentSubTopics,
    contentStandard,
    performanceStandard,
    competencyNumber: null,
    learningCompetency,
    ...(budgetOfWork ? { budgetOfWork } : {}),
    ...(customNotes ? { customNotes } : {}),
  };
}

function matchesCurriculumFilter(
  item: CurriculumCompetency,
  filter?: CurriculumFilter,
): boolean {
  if (!filter) return true;
  if (
    filter.gradeLevel !== undefined &&
    !item.gradeLevels.includes(filter.gradeLevel)
  ) {
    return false;
  }
  if (filter.quarter !== undefined && !item.quarters.includes(filter.quarter)) {
    return false;
  }
  const term = filter.term?.trim();
  if (term && item.budgetOfWork?.term !== term) {
    return false;
  }
  if (filter.component && item.component !== filter.component) {
    return false;
  }
  if (filter.sector && item.sector !== filter.sector) {
    return false;
  }
  const q = filter.query?.trim().toLowerCase();
  if (q) {
    const haystack = [
      item.learningCompetency,
      item.contentTopic,
      ...item.contentSubTopics,
      item.contentStandard,
      item.performanceStandard,
      item.sector ?? "",
      item.customNotes ?? "",
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

const DEFAULT_OPENAI_URL =
  AI_PROVIDER_MAP.get("openai-compatible")!.defaultBaseUrl;

export const DEFAULT_SETTINGS: GuroMateSettings = {
  profile: {
    studentTeacherName: "JOHN REX B. DURAN",
    cooperatingTeacherName: "FERDINAND S. BALTAZAR",
    tleCoordinatorName: "LEA S. RESTA",
    academicHeadName: "NARIZA JANE M. TUMUNDONG",
    aiDeclaration:
      "This lesson plan was developed using AI and subsequently reviewed for accuracy and alignment with curriculum standards.",
  },
  ai: {
    aiProvider: "openai-compatible",
    apiKey: "",
    baseUrl: DEFAULT_OPENAI_URL,
    modelId: "",
  },
};

export class SettingsValidationError extends Error {}
export class CurriculumValidationError extends Error {}
export class CurriculumNotFoundError extends Error {}

function cloneDefaults(): GuroMateSettings {
  return {
    profile: { ...DEFAULT_SETTINGS.profile },
    ai: { ...DEFAULT_SETTINGS.ai },
  };
}

function normalizeProfile(
  current: TeacherProfileSettings,
  patch?: Partial<TeacherProfileSettings>,
): TeacherProfileSettings {
  return {
    studentTeacherName: (
      patch?.studentTeacherName ?? current.studentTeacherName
    ).trim(),
    cooperatingTeacherName: (
      patch?.cooperatingTeacherName ?? current.cooperatingTeacherName
    ).trim(),
    tleCoordinatorName: (
      patch?.tleCoordinatorName ?? current.tleCoordinatorName
    ).trim(),
    academicHeadName: (
      patch?.academicHeadName ?? current.academicHeadName
    ).trim(),
    aiDeclaration: (patch?.aiDeclaration ?? current.aiDeclaration).trim(),
  };
}

function normalizeAiSettings(
  current: AiProviderSettings,
  patch?: Partial<AiProviderSettings>,
): AiProviderSettings {
  const aiProvider = patch?.aiProvider ?? current.aiProvider;
  const providerMeta = AI_PROVIDER_MAP.get(aiProvider);
  if (!providerMeta) {
    throw new SettingsValidationError(
      `Unsupported AI provider: ${String(aiProvider)}`,
    );
  }

  const rawBaseUrl =
    patch?.baseUrl !== undefined
      ? patch.baseUrl.trim()
      : patch?.aiProvider && patch.aiProvider !== current.aiProvider
        ? providerMeta.defaultBaseUrl
        : current.baseUrl.trim();

  if (!rawBaseUrl) {
    throw new SettingsValidationError("Base URL is required.");
  }

  const baseUrl = rawBaseUrl.replace(/\/+$/, "");

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(baseUrl);
  } catch {
    throw new SettingsValidationError("Base URL must be a valid http(s) URL.");
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new SettingsValidationError("Base URL must be a valid http(s) URL.");
  }

  return {
    aiProvider,
    apiKey: (patch?.apiKey ?? current.apiKey).trim(),
    baseUrl,
    modelId: (patch?.modelId ?? current.modelId).trim(),
  };
}

/** Creates the top-level GuroMate Engine bound to local storage, templates, and an AI adapter. */
export function createGuroMateEngine(
  options: GuroMateEngineOptions,
): GuroMateEngine {
  const settingsPath = path.join(options.dataDir, "settings.json");
  const customCurriculumPath = path.join(
    options.dataDir,
    "curriculum-custom.json",
  );
  const aiAdapter = options.aiAdapter ?? createLiveAiAdapter();

  async function getSettings(): Promise<GuroMateSettings> {
    const parsed = await readJsonOrDefault<Partial<GuroMateSettings>>(
      settingsPath,
      () => ({}),
    );
    return {
      profile: { ...DEFAULT_SETTINGS.profile, ...parsed.profile },
      ai: { ...DEFAULT_SETTINGS.ai, ...parsed.ai },
    };
  }

  async function saveSettings(patch: SettingsPatch): Promise<GuroMateSettings> {
    const current = await getSettings();
    const next: GuroMateSettings = {
      profile: normalizeProfile(current.profile, patch.profile),
      ai: normalizeAiSettings(current.ai, patch.ai),
    };
    await writeJsonAtomic(settingsPath, next);
    return next;
  }

  async function readCustomStore(): Promise<CustomCurriculumStore> {
    const parsed = await readJsonOrDefault<Partial<CustomCurriculumStore>>(
      customCurriculumPath,
      emptyCustomStore,
    );
    return {
      customCompetencies: Array.isArray(parsed.customCompetencies)
        ? parsed.customCompetencies
        : [],
      notesByCompetencyId:
        parsed.notesByCompetencyId &&
        typeof parsed.notesByCompetencyId === "object"
          ? parsed.notesByCompetencyId
          : {},
    };
  }

  async function testAiConnection(
    aiOverride?: Partial<AiProviderSettings>,
  ): Promise<AiConnectionCheckResult> {
    let settings: AiProviderSettings;
    try {
      const current = await getSettings();
      settings = aiOverride
        ? normalizeAiSettings(current.ai, aiOverride)
        : current.ai;
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }

    if (!settings.modelId) {
      return { ok: false, message: "Model ID is required." };
    }
    const providerMeta = AI_PROVIDER_MAP.get(settings.aiProvider);
    if (providerMeta?.requiresKey && !settings.apiKey) {
      return {
        ok: false,
        message: `API key is required for ${settings.aiProvider}.`,
      };
    }

    try {
      const result = await aiAdapter.generateText({
        prompt: "Reply with OK.",
        settings,
      });
      const model = result.model || settings.modelId;
      return {
        ok: true,
        model,
        message: `Connected to ${settings.aiProvider} (${model}).`,
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async function listCurriculum(
    filter?: CurriculumFilter,
  ): Promise<CurriculumCompetency[]> {
    const store = await readCustomStore();
    const merged = [...BUILTIN_CATALOG, ...store.customCompetencies].map(
      (item) => {
        const note = store.notesByCompetencyId[item.id];
        return note !== undefined ? { ...item, customNotes: note } : item;
      },
    );
    return merged.filter((item) => matchesCurriculumFilter(item, filter));
  }

  async function saveCustomCompetency(
    input: CustomCompetencyInput,
  ): Promise<CurriculumCompetency> {
    const store = await readCustomStore();
    if (input.id) {
      if (BUILTIN_CATALOG.some((item) => item.id === input.id)) {
        throw new CurriculumValidationError(
          "Built-in curriculum competencies cannot be overwritten.",
        );
      }
      const index = store.customCompetencies.findIndex(
        (item) => item.id === input.id,
      );
      if (index === -1) {
        throw new CurriculumNotFoundError(
          `Custom Learning Competency not found: ${input.id}`,
        );
      }
      const updated = validateAndBuildCustomCompetency(input, input.id);
      store.customCompetencies[index] = updated;
      if (updated.customNotes !== undefined) {
        store.notesByCompetencyId[updated.id] = updated.customNotes;
      } else {
        delete store.notesByCompetencyId[updated.id];
      }
      await writeJsonAtomic(customCurriculumPath, store);
      return updated;
    }

    const created = validateAndBuildCustomCompetency(input);
    store.customCompetencies.push(created);
    if (created.customNotes !== undefined) {
      store.notesByCompetencyId[created.id] = created.customNotes;
    }
    await writeJsonAtomic(customCurriculumPath, store);
    return created;
  }

  async function saveCompetencyNotes(
    competencyId: string,
    customNotes: string,
  ): Promise<CurriculumCompetency> {
    const store = await readCustomStore();
    const builtin = BUILTIN_CATALOG.find((item) => item.id === competencyId);
    const customIndex = store.customCompetencies.findIndex(
      (item) => item.id === competencyId,
    );
    const target =
      builtin ??
      (customIndex >= 0 ? store.customCompetencies[customIndex] : undefined);
    if (!target) {
      throw new CurriculumNotFoundError(
        `Learning Competency not found: ${competencyId}`,
      );
    }

    const trimmed = customNotes.trim();
    if (trimmed) {
      store.notesByCompetencyId[competencyId] = trimmed;
    } else {
      delete store.notesByCompetencyId[competencyId];
    }

    if (customIndex >= 0) {
      const nextCustom: CurriculumCompetency = { ...target };
      if (trimmed) {
        nextCustom.customNotes = trimmed;
      } else {
        delete nextCustom.customNotes;
      }
      store.customCompetencies[customIndex] = nextCustom;
    }

    await writeJsonAtomic(customCurriculumPath, store);
    if (trimmed) {
      return { ...target, customNotes: trimmed };
    }
    const { customNotes: _removed, ...rest } = target;
    return rest;
  }

  async function deleteCustomCompetency(id: string): Promise<void> {
    const store = await readCustomStore();
    const index = store.customCompetencies.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new CurriculumNotFoundError(
        `Custom Learning Competency not found: ${id}`,
      );
    }
    store.customCompetencies.splice(index, 1);
    delete store.notesByCompetencyId[id];
    await writeJsonAtomic(customCurriculumPath, store);
  }

  return {
    dataDir: options.dataDir,
    templatesDir: options.templatesDir,
    getSettings,
    saveSettings,
    testAiConnection,
    listCurriculum,
    saveCustomCompetency,
    saveCompetencyNotes,
    deleteCustomCompetency,
  };
}
