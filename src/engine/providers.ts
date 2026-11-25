import type { AiModelOption, AiProviderType } from "./types";

export interface AiProviderMetadata {
  value: AiProviderType;
  label: string;
  defaultBaseUrl: string;
  modelExample: string;
  requiresKey: boolean;
  models: readonly AiModelOption[];
}

export const AI_PROVIDERS: readonly AiProviderMetadata[] = [
  {
    value: "openai-compatible",
    label: "OpenAI-Compatible",
    defaultBaseUrl: "https://api.openai.com/v1",
    modelExample: "gpt-4o-mini",
    requiresKey: true,
    models: [
      { id: "gpt-4o-mini", label: "GPT-4o Mini" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
      { id: "gpt-4.1", label: "GPT-4.1" },
      { id: "gpt-4o", label: "GPT-4o" },
    ],
  },
  {
    value: "gemini",
    label: "Google Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    modelExample: "gemini-2.5-flash",
    requiresKey: true,
    models: [
      {
        id: "gemini-2.5-flash",
        label: "Gemini 2.5 Flash",
        isFree: true,
        freeBadge: "Free tier",
      },
      {
        id: "gemini-2.5-flash-lite",
        label: "Gemini 2.5 Flash-Lite",
        isFree: true,
        freeBadge: "Free tier",
      },
      {
        id: "gemini-2.0-flash",
        label: "Gemini 2.0 Flash",
        isFree: true,
        freeBadge: "Free tier",
      },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    ],
  },
  {
    value: "openrouter",
    label: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    modelExample: "meta-llama/llama-3.3-70b-instruct:free",
    requiresKey: true,
    models: [
      {
        id: "meta-llama/llama-3.3-70b-instruct:free",
        label: "Llama 3.3 70B Instruct",
        isFree: true,
        freeBadge: "Free",
      },
      {
        id: "google/gemma-3-27b-it:free",
        label: "Gemma 3 27B",
        isFree: true,
        freeBadge: "Free",
      },
      {
        id: "qwen/qwen3-32b:free",
        label: "Qwen 3 32B",
        isFree: true,
        freeBadge: "Free",
      },
      {
        id: "deepseek/deepseek-r1-0528:free",
        label: "DeepSeek R1",
        isFree: true,
        freeBadge: "Free",
      },
      { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "openai/gpt-4o-mini", label: "GPT-4o Mini" },
      { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5" },
    ],
  },
  {
    value: "anthropic",
    label: "Anthropic",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    modelExample: "claude-sonnet-4-5",
    requiresKey: true,
    models: [
      { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
      { id: "claude-opus-4-1", label: "Claude Opus 4.1" },
    ],
  },
  {
    value: "ollama",
    label: "Local Ollama",
    defaultBaseUrl: "http://localhost:11434/v1",
    modelExample: "llama3.2",
    requiresKey: false,
    models: [
      {
        id: "llama3.2",
        label: "Llama 3.2",
        isFree: true,
        freeBadge: "Free · Local",
      },
      {
        id: "qwen2.5",
        label: "Qwen 2.5",
        isFree: true,
        freeBadge: "Free · Local",
      },
      {
        id: "gemma3",
        label: "Gemma 3",
        isFree: true,
        freeBadge: "Free · Local",
      },
      {
        id: "mistral",
        label: "Mistral",
        isFree: true,
        freeBadge: "Free · Local",
      },
      {
        id: "phi4-mini",
        label: "Phi-4 Mini",
        isFree: true,
        freeBadge: "Free · Local",
      },
    ],
  },
];

export const AI_PROVIDER_MAP = new Map<AiProviderType, AiProviderMetadata>(
  AI_PROVIDERS.map((provider) => [provider.value, provider]),
);

const ALL_CURATED_MODEL_IDS = new Set(
  AI_PROVIDERS.flatMap((provider) => provider.models.map((m) => m.id)),
);

export function sortModelsFreeFirst<T extends { isFree?: boolean }>(
  models: readonly T[],
): T[] {
  return [...models].sort(
    (a, b) => Number(Boolean(b.isFree)) - Number(Boolean(a.isFree)),
  );
}

export function getCuratedModels(provider: AiProviderType): AiModelOption[] {
  return sortModelsFreeFirst(AI_PROVIDER_MAP.get(provider)?.models ?? []);
}

export function formatModelOptionLabel(model: AiModelOption): string {
  return model.freeBadge ? `[${model.freeBadge}] ${model.label}` : model.label;
}

export function isCustomModelId(
  provider: AiProviderType,
  modelId: string,
): boolean {
  const trimmed = modelId.trim();
  if (!trimmed) return false;
  const models = AI_PROVIDER_MAP.get(provider)?.models ?? [];
  return !models.some((m) => m.id === trimmed);
}

export function resolveModelIdOnProviderChange(
  currentModelId: string,
  nextProvider: AiProviderType,
  previousKnownModelIds?: Iterable<string>,
): string {
  const trimmed = currentModelId.trim();
  const nextModels = getCuratedModels(nextProvider);
  const topPreset = nextModels[0]?.id ?? "";

  if (!trimmed) return topPreset;
  if (nextModels.some((m) => m.id === trimmed)) return trimmed;
  if (ALL_CURATED_MODEL_IDS.has(trimmed)) return topPreset;
  if (previousKnownModelIds) {
    for (const id of previousKnownModelIds) {
      if (id === trimmed) return topPreset;
    }
  }
  return currentModelId;
}
