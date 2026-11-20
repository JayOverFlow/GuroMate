import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createLiveAiAdapter } from "./liveAiAdapter";
import { AI_PROVIDER_MAP } from "./providers";
import type {
  AiConnectionCheckResult,
  AiProviderSettings,
  GuroMateEngine,
  GuroMateEngineOptions,
  GuroMateSettings,
  SettingsPatch,
  TeacherProfileSettings,
} from "./types";

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
  const aiAdapter = options.aiAdapter ?? createLiveAiAdapter();

  async function getSettings(): Promise<GuroMateSettings> {
    try {
      const raw = await readFile(settingsPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<GuroMateSettings>;
      return {
        profile: { ...DEFAULT_SETTINGS.profile, ...parsed.profile },
        ai: { ...DEFAULT_SETTINGS.ai, ...parsed.ai },
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return cloneDefaults();
      }
      throw err;
    }
  }

  async function saveSettings(patch: SettingsPatch): Promise<GuroMateSettings> {
    const current = await getSettings();
    const next: GuroMateSettings = {
      profile: normalizeProfile(current.profile, patch.profile),
      ai: normalizeAiSettings(current.ai, patch.ai),
    };
    await mkdir(options.dataDir, { recursive: true });
    const tmpPath = `${settingsPath}.tmp`;
    await writeFile(tmpPath, JSON.stringify(next, null, 2) + "\n", "utf8");
    await rename(tmpPath, settingsPath);
    return next;
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

  return {
    dataDir: options.dataDir,
    templatesDir: options.templatesDir,
    getSettings,
    saveSettings,
    testAiConnection,
  };
}
