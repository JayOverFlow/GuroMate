import { describe, expect, it } from "vitest";
import {
  AI_PROVIDERS,
  formatModelOptionLabel,
  getCuratedModels,
  isCustomModelId,
  resolveModelIdOnProviderChange,
} from "./providers";

describe("AI provider curated model presets", () => {
  it("provides curated models for all five providers with free models sorted first and accurate badges", () => {
    for (const provider of AI_PROVIDERS) {
      const models = getCuratedModels(provider.value);
      expect(models.length).toBeGreaterThan(0);

      // Every free model must appear before any non-free model.
      let seenPaid = false;
      for (const model of models) {
        if (model.isFree) {
          expect(seenPaid).toBe(false);
        } else {
          seenPaid = true;
        }
      }
    }

    const openRouterModels = getCuratedModels("openrouter");
    expect(openRouterModels[0]?.isFree).toBe(true);
    expect(formatModelOptionLabel(openRouterModels[0]!)).toMatch(/^\[Free\] /);
    expect(openRouterModels.some((m) => !m.isFree)).toBe(true);

    const geminiModels = getCuratedModels("gemini");
    expect(geminiModels[0]?.isFree).toBe(true);
    expect(formatModelOptionLabel(geminiModels[0]!)).toMatch(
      /^\[Free tier\] /,
    );

    const ollamaModels = getCuratedModels("ollama");
    expect(ollamaModels.every((m) => m.isFree)).toBe(true);
    expect(formatModelOptionLabel(ollamaModels[0]!)).toMatch(
      /^\[Free · Local\] /,
    );

    for (const paidProvider of ["openai-compatible", "anthropic"] as const) {
      const models = getCuratedModels(paidProvider);
      expect(models.every((m) => !m.isFree && !m.freeBadge)).toBe(true);
      for (const model of models) {
        expect(formatModelOptionLabel(model)).not.toMatch(/free/i);
      }
    }
  });

  it("updates modelId to the next provider top preset when empty or another provider preset, while preserving custom model IDs", () => {
    // Empty -> top preset
    expect(resolveModelIdOnProviderChange("", "openrouter")).toBe(
      "meta-llama/llama-3.3-70b-instruct:free",
    );
    expect(resolveModelIdOnProviderChange("   ", "gemini")).toBe(
      "gemini-2.5-flash",
    );
    expect(resolveModelIdOnProviderChange("", "ollama")).toBe("llama3.2");
    expect(resolveModelIdOnProviderChange("", "openai-compatible")).toBe(
      "gpt-4o-mini",
    );
    expect(resolveModelIdOnProviderChange("", "anthropic")).toBe(
      "claude-sonnet-4-5",
    );

    // Another provider's curated preset -> next provider's top preset
    expect(resolveModelIdOnProviderChange("gpt-4o-mini", "openrouter")).toBe(
      "meta-llama/llama-3.3-70b-instruct:free",
    );
    expect(
      resolveModelIdOnProviderChange("google/gemini-2.5-flash", "ollama"),
    ).toBe("llama3.2");

    // Already a preset of the target provider -> keep it
    expect(resolveModelIdOnProviderChange("gemini-2.5-pro", "gemini")).toBe(
      "gemini-2.5-pro",
    );

    // User-entered custom model ID -> preserve it
    expect(
      resolveModelIdOnProviderChange("my-org/custom-tle-model", "anthropic"),
    ).toBe("my-org/custom-tle-model");

    // Previous provider's live-discovered model -> next provider's top preset
    const previousLiveModels = [
      "mistralai/mistral-7b-instruct:free",
      "nvidia/nemotron-nano-8b:free",
    ];
    expect(
      resolveModelIdOnProviderChange(
        "mistralai/mistral-7b-instruct:free",
        "gemini",
        previousLiveModels,
      ),
    ).toBe("gemini-2.5-flash");

    // User-entered custom model ID is still preserved when previous live models are provided
    expect(
      resolveModelIdOnProviderChange(
        "my-org/custom-tle-model",
        "gemini",
        previousLiveModels,
      ),
    ).toBe("my-org/custom-tle-model");
  });

  it("detects custom model IDs accurately for initial load and custom mode", () => {
    expect(isCustomModelId("openai-compatible", "")).toBe(false);
    expect(isCustomModelId("openai-compatible", "   ")).toBe(false);
    expect(isCustomModelId("openai-compatible", "gpt-4o-mini")).toBe(false);
    expect(isCustomModelId("openrouter", "meta-llama/llama-3.3-70b-instruct:free")).toBe(
      false,
    );
    expect(
      isCustomModelId("openai-compatible", "my-org/custom-tle-model"),
    ).toBe(true);
    expect(isCustomModelId("ollama", "deepseek-r1:8b")).toBe(true);
  });
});
