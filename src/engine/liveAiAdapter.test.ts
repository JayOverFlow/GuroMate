import { describe, expect, it } from "vitest";
import { createLiveAiAdapter } from "./liveAiAdapter";

describe("createLiveAiAdapter.listModels", () => {
  it("lists OpenRouter models with :free and zero-cost models sorted first and tagged Free", async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const adapter = createLiveAiAdapter(async (input, init) => {
      calls.push({
        url: String(input),
        headers: (init?.headers ?? {}) as Record<string, string>,
      });
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "openai/gpt-4o-mini",
              name: "OpenAI: GPT-4o Mini",
              pricing: { prompt: "0.00000015", completion: "0.0000006" },
            },
            {
              id: "meta-llama/llama-3.3-70b-instruct:free",
              name: "Meta: Llama 3.3 70B Instruct",
              pricing: { prompt: "0", completion: "0" },
            },
            {
              id: "openrouter/zero-cost-model",
              name: "Zero Cost Model",
              pricing: { prompt: "0", completion: "0.0" },
            },
          ],
        }),
        { status: 200 },
      );
    });

    const models = await adapter.listModels!({
      aiProvider: "openrouter",
      apiKey: "or-key",
      baseUrl: "https://openrouter.ai/api/v1",
      modelId: "",
    });

    expect(calls[0]).toMatchObject({
      url: "https://openrouter.ai/api/v1/models",
      headers: { Authorization: "Bearer or-key" },
    });
    expect(models).toEqual([
      {
        id: "meta-llama/llama-3.3-70b-instruct:free",
        label: "Meta: Llama 3.3 70B Instruct",
        isFree: true,
        freeBadge: "Free",
      },
      {
        id: "openrouter/zero-cost-model",
        label: "Zero Cost Model",
        isFree: true,
        freeBadge: "Free",
      },
      {
        id: "openai/gpt-4o-mini",
        label: "OpenAI: GPT-4o Mini",
      },
    ]);
  });

  it("lists Local Ollama models from /api/tags and falls back to /models when /api/tags fails", async () => {
    const tagCalls: string[] = [];
    const tagAdapter = createLiveAiAdapter(async (input) => {
      tagCalls.push(String(input));
      return new Response(
        JSON.stringify({
          models: [{ name: "llama3.2:latest" }, { name: "qwen2.5:7b" }],
        }),
        { status: 200 },
      );
    });

    const fromTags = await tagAdapter.listModels!({
      aiProvider: "ollama",
      apiKey: "",
      baseUrl: "http://localhost:11434/v1",
      modelId: "",
    });

    expect(tagCalls).toEqual(["http://localhost:11434/api/tags"]);
    expect(fromTags).toEqual([
      {
        id: "llama3.2:latest",
        label: "llama3.2:latest",
        isFree: true,
        freeBadge: "Free · Local",
      },
      {
        id: "qwen2.5:7b",
        label: "qwen2.5:7b",
        isFree: true,
        freeBadge: "Free · Local",
      },
    ]);

    const fallbackCalls: string[] = [];
    const fallbackAdapter = createLiveAiAdapter(async (input) => {
      const url = String(input);
      fallbackCalls.push(url);
      if (url.endsWith("/api/tags")) {
        return new Response("Not Found", { status: 404 });
      }
      return new Response(
        JSON.stringify({ data: [{ id: "mistral" }] }),
        { status: 200 },
      );
    });

    const fromFallback = await fallbackAdapter.listModels!({
      aiProvider: "ollama",
      apiKey: "",
      baseUrl: "http://localhost:11434/v1",
      modelId: "",
    });

    expect(fallbackCalls).toEqual([
      "http://localhost:11434/api/tags",
      "http://localhost:11434/v1/models",
    ]);
    expect(fromFallback).toEqual([
      {
        id: "mistral",
        label: "mistral",
        isFree: true,
        freeBadge: "Free · Local",
      },
    ]);
  });

  it("lists Google Gemini generation-capable models with free-tier models sorted first", async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const adapter = createLiveAiAdapter(async (input, init) => {
      calls.push({
        url: String(input),
        headers: (init?.headers ?? {}) as Record<string, string>,
      });
      return new Response(
        JSON.stringify({
          models: [
            {
              name: "models/text-embedding-004",
              displayName: "Text Embedding 004",
              supportedGenerationMethods: ["embedContent"],
            },
            {
              name: "models/gemini-2.5-pro",
              displayName: "Gemini 2.5 Pro",
              supportedGenerationMethods: ["generateContent"],
            },
            {
              name: "models/gemini-2.5-flash",
              displayName: "Gemini 2.5 Flash",
              supportedGenerationMethods: ["generateContent"],
            },
          ],
        }),
        { status: 200 },
      );
    });

    const models = await adapter.listModels!({
      aiProvider: "gemini",
      apiKey: "gem-key",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      modelId: "",
    });

    expect(calls[0]).toMatchObject({
      url: "https://generativelanguage.googleapis.com/v1beta/models",
      headers: { "x-goog-api-key": "gem-key" },
    });
    expect(models).toEqual([
      {
        id: "gemini-2.5-flash",
        label: "Gemini 2.5 Flash",
        isFree: true,
        freeBadge: "Free tier",
      },
      {
        id: "gemini-2.5-pro",
        label: "Gemini 2.5 Pro",
      },
    ]);
  });

  it("lists Anthropic and OpenAI-Compatible models without free tags", async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const adapter = createLiveAiAdapter(async (input, init) => {
      const url = String(input);
      calls.push({
        url,
        headers: (init?.headers ?? {}) as Record<string, string>,
      });
      if (url.includes("anthropic.com")) {
        return new Response(
          JSON.stringify({
            data: [
              { id: "claude-sonnet-4-5", display_name: "Claude Sonnet 4.5" },
              { id: "claude-haiku-4-5", display_name: "Claude Haiku 4.5" },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          data: [{ id: "gpt-4o-mini" }, { id: "gpt-4.1" }],
        }),
        { status: 200 },
      );
    });

    const anthropicModels = await adapter.listModels!({
      aiProvider: "anthropic",
      apiKey: "ant-key",
      baseUrl: "https://api.anthropic.com/v1",
      modelId: "",
    });
    expect(calls[0]).toMatchObject({
      url: "https://api.anthropic.com/v1/models",
      headers: {
        "x-api-key": "ant-key",
        "anthropic-version": "2023-06-01",
      },
    });
    expect(anthropicModels).toEqual([
      { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    ]);

    const openaiModels = await adapter.listModels!({
      aiProvider: "openai-compatible",
      apiKey: "sk-key",
      baseUrl: "https://api.openai.com/v1",
      modelId: "",
    });
    expect(calls[1]).toMatchObject({
      url: "https://api.openai.com/v1/models",
      headers: { Authorization: "Bearer sk-key" },
    });
    expect(openaiModels).toEqual([
      { id: "gpt-4o-mini", label: "gpt-4o-mini" },
      { id: "gpt-4.1", label: "gpt-4.1" },
    ]);
  });
});
