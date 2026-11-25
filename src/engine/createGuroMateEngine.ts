import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import rawCatalog from "./curriculumCatalog.json";
import {
  DLL_SYSTEM_INSTRUCTION,
  DllNotFoundError,
  DllValidationError,
  assembleGeneratedSessions,
  buildDllPrompt,
  normalizeEditedDll,
  parseAiDllPayload,
  renderDllMarkdown,
  resolveDllSessions,
} from "./dll";
import {
  DlpNotFoundError,
  DlpValidationError,
  buildDlpPrompt,
  normalizeActivityPair,
  normalizeEditedDlp,
  parseAiDlpPayload,
  renderDlpMarkdown,
  resolveDerivedDlpContext,
  resolveScratchDlpContext,
} from "./dlp";
import {
  QuizNotFoundError,
  QuizValidationError,
  assembleGeneratedQuizSections,
  buildQuizPrompt,
  formatQuizForLesson,
  normalizeEditedQuiz,
  parseAiQuizPayload,
  renderQuizMarkdown,
  resolveDllSessionQuizContext,
  resolveDlpQuizContext,
  resolveStandaloneQuizContext,
  validateQuizItemCounts,
} from "./quiz";
import { injectDllIntoDocumentXml } from "./dllDocx";
import { injectDlpIntoDocumentXml } from "./dlpDocx";
import { createLiveAiAdapter } from "./liveAiAdapter";
import { AI_PROVIDER_MAP, getCuratedModels } from "./providers";
import { buildQuizDocxBuffer } from "./quizDocx";
import { readZipEntry, replaceZipEntry } from "./zip";
import {
  GRADE_LEVELS,
  QUARTERS,
  TLE_COMPONENTS,
  type AiConnectionCheckResult,
  type AiModelListResult,
  type AiProviderSettings,
  type BudgetOfWorkInfo,
  type ClassSection,
  type ClassSectionInput,
  type CurriculumCompetency,
  type CurriculumFilter,
  type CustomCompetencyInput,
  type DailyLessonLog,
  type DailyLessonPlan,
  type GenerateDllInput,
  type GenerateDlpInput,
  type GenerateQuizInput,
  type GuroMateEngine,
  type GuroMateEngineOptions,
  type GuroMateSettings,
  type GradeLevel,
  type QuarterNumber,
  type Quiz,
  type QuizSyncResult,
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
export class ClassSectionValidationError extends Error {}
export class ClassSectionNotFoundError extends Error {}
export {
  DllNotFoundError,
  DllValidationError,
  DlpNotFoundError,
  DlpValidationError,
  QuizNotFoundError,
  QuizValidationError,
};

function validateAndBuildClassSection(
  input: ClassSectionInput,
  existingId?: string,
): ClassSection {
  if (!VALID_GRADES.has(input.gradeLevel)) {
    throw new ClassSectionValidationError(
      "Grade Level must be between 7 and 10.",
    );
  }
  const sectionName = input.sectionName.trim();
  if (!sectionName) {
    throw new ClassSectionValidationError("Section Name is required.");
  }
  const students = input.students.map((s) => s.trim()).filter(Boolean);
  if (students.length === 0) {
    throw new ClassSectionValidationError(
      "At least one student name is required.",
    );
  }
  return {
    id: existingId ?? `sec-${randomUUID().slice(0, 8)}`,
    gradeLevel: input.gradeLevel,
    sectionName,
    students,
  };
}

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
  const classSectionsPath = path.join(options.dataDir, "class-sections.json");
  const dllsDir = path.join(options.dataDir, "dlls");
  const dllsIndexPath = path.join(options.dataDir, "dlls.json");
  const dlpsDir = path.join(options.dataDir, "dlps");
  const dlpsIndexPath = path.join(options.dataDir, "dlps.json");
  const quizzesDir = path.join(options.dataDir, "quizzes");
  const quizzesIndexPath = path.join(options.dataDir, "quizzes.json");
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

  async function listAiModels(
    aiOverride?: Partial<AiProviderSettings>,
  ): Promise<AiModelListResult> {
    const current = await getSettings();
    let settings: AiProviderSettings;
    try {
      settings = aiOverride
        ? normalizeAiSettings(current.ai, aiOverride)
        : current.ai;
    } catch (err) {
      const fallbackProvider =
        aiOverride?.aiProvider && AI_PROVIDER_MAP.has(aiOverride.aiProvider)
          ? aiOverride.aiProvider
          : current.ai.aiProvider;
      const reason = err instanceof Error ? err.message : String(err);
      return {
        models: getCuratedModels(fallbackProvider),
        source: "curated",
        message: `${reason} Showing curated presets.`,
      };
    }

    const providerMeta = AI_PROVIDER_MAP.get(settings.aiProvider);
    const providerLabel = providerMeta?.label ?? settings.aiProvider;

    if (providerMeta?.requiresKey && !settings.apiKey) {
      return {
        models: getCuratedModels(settings.aiProvider),
        source: "curated",
        message: `API key is required for ${providerLabel}. Showing curated presets.`,
      };
    }

    if (!aiAdapter.listModels) {
      return {
        models: getCuratedModels(settings.aiProvider),
        source: "curated",
        message: "Live model discovery is unavailable. Showing curated presets.",
      };
    }

    try {
      const liveModels = await aiAdapter.listModels(settings);
      if (liveModels.length === 0) {
        return {
          models: getCuratedModels(settings.aiProvider),
          source: "curated",
          message: `No models returned by ${providerLabel}. Showing curated presets.`,
        };
      }
      const sorted = [...liveModels].sort(
        (a, b) => Number(Boolean(b.isFree)) - Number(Boolean(a.isFree)),
      );
      return {
        models: sorted,
        source: "live",
        message: `Loaded ${sorted.length} live model${sorted.length === 1 ? "" : "s"} from ${providerLabel}.`,
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return {
        models: getCuratedModels(settings.aiProvider),
        source: "curated",
        message: `Could not fetch live models (${reason}). Showing curated presets.`,
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

  async function readClassSections(): Promise<ClassSection[]> {
    const parsed = await readJsonOrDefault<unknown>(
      classSectionsPath,
      () => [],
    );
    return Array.isArray(parsed) ? (parsed as ClassSection[]) : [];
  }

  async function saveClassSection(
    input: ClassSectionInput,
  ): Promise<ClassSection> {
    const sections = await readClassSections();
    let saved: ClassSection;
    if (input.id) {
      const index = sections.findIndex((item) => item.id === input.id);
      if (index === -1) {
        throw new ClassSectionNotFoundError(
          `Class Section not found: ${input.id}`,
        );
      }
      saved = validateAndBuildClassSection(input, input.id);
      sections[index] = saved;
    } else {
      saved = validateAndBuildClassSection(input);
      sections.push(saved);
    }
    await writeJsonAtomic(classSectionsPath, sections);
    return saved;
  }

  async function deleteClassSection(id: string): Promise<void> {
    const sections = await readClassSections();
    const index = sections.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new ClassSectionNotFoundError(`Class Section not found: ${id}`);
    }
    sections.splice(index, 1);
    await writeJsonAtomic(classSectionsPath, sections);
  }

  function createLessonStore<T extends { id: string }>(
    indexPath: string,
    mdDir: string,
    renderMd: (item: T) => string,
    notFoundError: (id: string) => Error,
  ) {
    const readAll = async (): Promise<T[]> => {
      const parsed = await readJsonOrDefault<unknown>(indexPath, () => []);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    };

    const writeMarkdown = async (item: T): Promise<void> => {
      await mkdir(mdDir, { recursive: true });
      const mdPath = path.join(mdDir, `${item.id}.md`);
      const tmpPath = `${mdPath}.tmp`;
      await writeFile(tmpPath, renderMd(item), "utf8");
      await rename(tmpPath, mdPath);
    };

    const requireIndex = (items: T[], id: string): number => {
      const index = items.findIndex((item) => item.id === id);
      if (index === -1) throw notFoundError(id);
      return index;
    };

    return {
      readAll,
      async getById(id: string): Promise<T> {
        const items = await readAll();
        return items[requireIndex(items, id)]!;
      },
      async prepend(item: T): Promise<T> {
        const existing = await readAll();
        existing.unshift(item);
        await writeJsonAtomic(indexPath, existing);
        await writeMarkdown(item);
        return item;
      },
      async update(id: string, normalize: (items: T[], index: number) => T): Promise<T> {
        const existing = await readAll();
        const index = requireIndex(existing, id);
        const updated = normalize(existing, index);
        existing[index] = updated;
        await writeJsonAtomic(indexPath, existing);
        await writeMarkdown(updated);
        return updated;
      },
      async remove(id: string): Promise<void> {
        const existing = await readAll();
        const index = requireIndex(existing, id);
        existing.splice(index, 1);
        await writeJsonAtomic(indexPath, existing);
        try {
          await unlink(path.join(mdDir, `${id}.md`));
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
        }
      },
    };
  }

  const dllStore = createLessonStore<DailyLessonLog>(
    dllsIndexPath,
    dllsDir,
    renderDllMarkdown,
    (id) => new DllNotFoundError(`Daily Lesson Log not found: ${id}`),
  );
  const dlpStore = createLessonStore<DailyLessonPlan>(
    dlpsIndexPath,
    dlpsDir,
    renderDlpMarkdown,
    (id) => new DlpNotFoundError(`Daily Lesson Plan not found: ${id}`),
  );
  const quizStore = createLessonStore<Quiz>(
    quizzesIndexPath,
    quizzesDir,
    renderQuizMarkdown,
    (id) => new QuizNotFoundError(`Formative Quiz not found: ${id}`),
  );

  async function generateDll(input: GenerateDllInput): Promise<DailyLessonLog> {
    const catalog = await listCurriculum();
    const competencyMap = new Map(catalog.map((c) => [c.id, c]));
    const resolved = resolveDllSessions(input, competencyMap);
    const learningAreas = resolved.components.join(", ");

    const prompt = buildDllPrompt({
      lessonTitle: input.lessonTitle,
      gradeAndSection: resolved.gradeAndSection,
      learningAreas,
      references: input.references,
      promptNotes: input.promptNotes,
      orderedConfigs: resolved.orderedConfigs,
      sessionCompetencies: resolved.sessionCompetencies,
    });

    const settings = await getSettings();
    const aiResult = await aiAdapter.generateText({
      systemInstruction: DLL_SYSTEM_INSTRUCTION,
      prompt,
      settings: settings.ai,
    });
    const parsed = parseAiDllPayload(aiResult.text);
    const now = new Date().toISOString();
    const fallbackTitle = `${learningAreas} (${resolved.gradeAndSection})`;

    const dll: DailyLessonLog = {
      id: `dll-${randomUUID().slice(0, 8)}`,
      createdAt: now,
      updatedAt: now,
      lessonTitle:
        input.lessonTitle?.trim() ||
        (typeof parsed.lessonTitle === "string" && parsed.lessonTitle.trim()) ||
        fallbackTitle,
      learningAreas,
      gradeAndSection: resolved.gradeAndSection,
      references:
        input.references?.trim() ||
        (typeof parsed.references === "string" ? parsed.references.trim() : ""),
      promptNotes: input.promptNotes?.trim() ?? "",
      intentions: {
        learningCompetencies: resolved.learningCompetencies,
        contentStandards: resolved.contentStandards,
        performanceStandards: resolved.performanceStandards,
        learnerContext: "",
      },
      sessions: assembleGeneratedSessions(
        resolved.orderedConfigs,
        resolved.sessionCompetencies,
        parsed.sessions,
      ),
    };

    return dllStore.prepend(dll);
  }

  function buildDocxFilename(
    prefix: "DLL" | "DLP" | "Quiz",
    title: string,
    id: string,
  ): string {
    const safeSlug =
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || id;
    return `${prefix}-${safeSlug}.docx`;
  }

  async function exportIlawDocx(
    templateFilename: string,
    prefix: "DLL" | "DLP",
    id: string,
    lessonTitle: string,
    inject: (docXml: string, profile: TeacherProfileSettings) => string,
  ) {
    const settings = await getSettings();
    const templateBuf = await readFile(
      path.join(options.templatesDir, templateFilename),
    );
    const docXml = readZipEntry(templateBuf, "word/document.xml").toString("utf8");
    const updatedXml = inject(docXml, settings.profile);
    const buffer = replaceZipEntry(
      templateBuf,
      "word/document.xml",
      Buffer.from(updatedXml, "utf8"),
    );
    return {
      filename: buildDocxFilename(prefix, lessonTitle, id),
      buffer,
    };
  }

  async function exportDllDocx(id: string) {
    const dll = await dllStore.getById(id);
    return exportIlawDocx(
      "DLL_ILAW_template.docx",
      "DLL",
      dll.id,
      dll.lessonTitle,
      (docXml, profile) => injectDllIntoDocumentXml(docXml, dll, profile),
    );
  }

  async function generateDlp(input: GenerateDlpInput): Promise<DailyLessonPlan> {
    const catalog = await listCurriculum();
    const competencyMap = new Map(catalog.map((c) => [c.id, c]));

    const resolved =
      input.mode === "derive"
        ? resolveDerivedDlpContext(
            await dllStore.getById(input.dllId),
            input.sessionNumber,
            input.references,
            competencyMap,
          )
        : resolveScratchDlpContext(
            input.competencyIds,
            input.gradeAndSection,
            input.references,
            competencyMap,
          );

    const prompt = buildDlpPrompt({
      lessonTitle: input.lessonTitle,
      gradeAndSection: resolved.gradeAndSection,
      learningAreas: resolved.learningAreas,
      references: resolved.references,
      promptNotes: input.promptNotes,
      competencies: resolved.competencies,
      learningCompetencies: resolved.learningCompetencies,
      derivedSession: resolved.derivedSession,
    });
    const settings = await getSettings();
    const aiResult = await aiAdapter.generateText({
      prompt,
      settings: settings.ai,
    });
    const parsed = parseAiDlpPayload(aiResult.text);
    const now = new Date().toISOString();
    const fallbackTitle = resolved.derivedSession
      ? `${resolved.learningAreas} — Session ${resolved.derivedSession.sessionNumber} (${resolved.gradeAndSection})`
      : `${resolved.learningAreas} (${resolved.gradeAndSection})`;

    const dlp: DailyLessonPlan = {
      id: `dlp-${randomUUID().slice(0, 8)}`,
      createdAt: now,
      updatedAt: now,
      ...(resolved.sourceDllId
        ? {
            sourceDllId: resolved.sourceDllId,
            sourceSessionNumber: resolved.sourceSessionNumber,
          }
        : {}),
      competencyIds: resolved.competencyIds,
      lessonTitle:
        input.lessonTitle?.trim() ||
        (typeof parsed.lessonTitle === "string" && parsed.lessonTitle.trim()) ||
        fallbackTitle,
      learningAreas: resolved.learningAreas,
      gradeAndSection: resolved.gradeAndSection,
      references:
        resolved.references ||
        (typeof parsed.references === "string" ? parsed.references.trim() : ""),
      promptNotes: input.promptNotes?.trim() ?? "",
      intentions: {
        learningCompetencies: resolved.learningCompetencies,
        contentStandards: resolved.contentStandards,
        performanceStandards: resolved.performanceStandards,
        learningObjectives:
          resolved.inheritedObjectives ||
          (typeof parsed.learningObjectives === "string"
            ? parsed.learningObjectives.trim()
            : ""),
        learnerContext: "",
      },
      preLesson: normalizeActivityPair(parsed.preLesson),
      lessonFlow: normalizeActivityPair(parsed.lessonFlow),
      learningResources: normalizeActivityPair(parsed.learningResources),
      integrationAndContextualization: normalizeActivityPair(
        parsed.integrationAndContextualization,
      ),
      formativeAssessment: normalizeActivityPair(parsed.formativeAssessment),
      extendedLearningOpportunities: normalizeActivityPair(
        parsed.extendedLearningOpportunities,
      ),
      reflections: { teacherActivity: "", studentActivity: "" },
    };

    return dlpStore.prepend(dlp);
  }

  async function exportDlpDocx(id: string) {
    const dlp = await dlpStore.getById(id);
    return exportIlawDocx(
      "DLP_ILAW_template.docx",
      "DLP",
      dlp.id,
      dlp.lessonTitle,
      (docXml, profile) => injectDlpIntoDocumentXml(docXml, dlp, profile),
    );
  }

  async function generateQuiz(input: GenerateQuizInput): Promise<Quiz> {
    const itemCounts = validateQuizItemCounts(input.itemCounts);
    const catalog = await listCurriculum();
    const competencyMap = new Map(catalog.map((c) => [c.id, c]));

    const resolved =
      input.sourceKind === "dll"
        ? resolveDllSessionQuizContext(
            await dllStore.getById(input.dllId),
            input.sessionNumber,
            competencyMap,
          )
        : input.sourceKind === "dlp"
          ? resolveDlpQuizContext(
              await dlpStore.getById(input.dlpId),
              competencyMap,
            )
          : resolveStandaloneQuizContext(
              input.competencyIds,
              input.gradeAndSection,
              competencyMap,
            );

    const prompt = buildQuizPrompt({
      context: resolved,
      title: input.title,
      promptNotes: input.promptNotes,
      itemCounts,
    });

    const settings = await getSettings();
    const aiResult = await aiAdapter.generateText({
      prompt,
      settings: settings.ai,
    });
    const parsed = parseAiQuizPayload(aiResult.text);
    const sections = assembleGeneratedQuizSections(itemCounts, parsed.sections);
    const now = new Date().toISOString();

    const quiz: Quiz = {
      id: `quiz-${randomUUID().slice(0, 8)}`,
      createdAt: now,
      updatedAt: now,
      title:
        input.title?.trim() ||
        (typeof parsed.title === "string" && parsed.title.trim()) ||
        `${resolved.learningAreas} Formative Quiz (${resolved.gradeAndSection})`,
      learningAreas: resolved.learningAreas,
      gradeAndSection: resolved.gradeAndSection,
      promptNotes: input.promptNotes?.trim() ?? "",
      source: resolved.source,
      competencyIds: resolved.competencyIds,
      learningCompetencies: resolved.learningCompetencies,
      sections,
    };

    return quizStore.prepend(quiz);
  }

  async function syncQuizToLesson(id: string): Promise<QuizSyncResult> {
    const quiz = await quizStore.getById(id);
    if (quiz.source.kind === "standalone") {
      throw new QuizValidationError(
        "Standalone quizzes are not linked to a DLL Session or DLP.",
      );
    }

    const formatted = formatQuizForLesson(quiz);
    const now = new Date().toISOString();

    if (quiz.source.kind === "dll") {
      const targetSessionNumber = quiz.source.sessionNumber;
      const dll = await dllStore.update(quiz.source.dllId, (items, index) => {
        const current = items[index]!;
        const targetSession = current.sessions.find(
          (s) => s.sessionNumber === targetSessionNumber,
        );
        if (!targetSession || targetSession.mode !== "instructional") {
          throw new QuizValidationError(
            `Cannot sync Quiz into non-instructional Session ${targetSessionNumber}.`,
          );
        }
        const sessions = current.sessions.map((s) =>
          s.sessionNumber === targetSessionNumber
            ? { ...s, formativeAssessment: formatted }
            : s,
        ) as DailyLessonLog["sessions"];
        return { ...current, sessions, updatedAt: now };
      });
      return { kind: "dll", dll };
    }

    const dlp = await dlpStore.update(quiz.source.dlpId, (items, index) => {
      const current = items[index]!;
      return {
        ...current,
        formativeAssessment: {
          teacherActivity: `Administer formative quiz "${quiz.title}" and check learner responses using the Quiz Answer Key.`,
          studentActivity: formatted,
        },
        updatedAt: now,
      };
    });
    return { kind: "dlp", dlp };
  }

  async function exportQuizDocx(id: string) {
    const quiz = await quizStore.getById(id);
    return {
      filename: buildDocxFilename("Quiz", quiz.title, quiz.id),
      buffer: buildQuizDocxBuffer(quiz),
    };
  }

  return {
    dataDir: options.dataDir,
    templatesDir: options.templatesDir,
    getSettings,
    saveSettings,
    testAiConnection,
    listAiModels,
    listCurriculum,
    saveCustomCompetency,
    saveCompetencyNotes,
    deleteCustomCompetency,
    listClassSections: readClassSections,
    saveClassSection,
    deleteClassSection,
    listDlls: dllStore.readAll,
    getDll: dllStore.getById,
    generateDll,
    saveDll: (dll) => dllStore.update(dll.id, () => normalizeEditedDll(dll)),
    deleteDll: dllStore.remove,
    renderDllMarkdown,
    exportDllDocx,
    listDlps: dlpStore.readAll,
    getDlp: dlpStore.getById,
    generateDlp,
    saveDlp: (dlp) => dlpStore.update(dlp.id, () => normalizeEditedDlp(dlp)),
    deleteDlp: dlpStore.remove,
    renderDlpMarkdown,
    exportDlpDocx,
    listQuizzes: quizStore.readAll,
    getQuiz: quizStore.getById,
    generateQuiz,
    saveQuiz: (quiz) => quizStore.update(quiz.id, () => normalizeEditedQuiz(quiz)),
    deleteQuiz: quizStore.remove,
    renderQuizMarkdown,
    syncQuizToLesson,
    exportQuizDocx,
  };
}
