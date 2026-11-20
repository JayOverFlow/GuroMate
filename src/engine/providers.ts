import type { AiProviderType } from "./types";

export interface AiProviderMetadata {
  value: AiProviderType;
  label: string;
  defaultBaseUrl: string;
  modelExample: string;
  requiresKey: boolean;
}

export const AI_PROVIDERS: readonly AiProviderMetadata[] = [
  {
    value: "openai-compatible",
    label: "OpenAI-Compatible",
    defaultBaseUrl: "https://api.openai.com/v1",
    modelExample: "gpt-4o-mini",
    requiresKey: true,
  },
  {
    value: "gemini",
    label: "Google Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    modelExample: "gemini-2.5-flash",
    requiresKey: true,
  },
  {
    value: "openrouter",
    label: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    modelExample: "google/gemini-2.5-flash",
    requiresKey: true,
  },
  {
    value: "anthropic",
    label: "Anthropic",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    modelExample: "claude-sonnet-4-5",
    requiresKey: true,
  },
  {
    value: "ollama",
    label: "Local Ollama",
    defaultBaseUrl: "http://localhost:11434/v1",
    modelExample: "llama3.2",
    requiresKey: false,
  },
];

export const AI_PROVIDER_MAP = new Map<AiProviderType, AiProviderMetadata>(
  AI_PROVIDERS.map((provider) => [provider.value, provider]),
);
