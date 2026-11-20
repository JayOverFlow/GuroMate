import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AiGenerateRequest, AiProviderAdapter } from "./types";
import { createGuroMateEngine } from "./createGuroMateEngine";
import { createLiveAiAdapter } from "./liveAiAdapter";

describe("createGuroMateEngine", () => {
  const tempDirs: string[] = [];

  async function makeTempDir(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), "guromate-test-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it("returns default Teacher Profile signatories and AI settings when no settings file exists", async () => {
    const dataDir = await makeTempDir();
    const engine = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
    });

    const settings = await engine.getSettings();

    expect(settings.profile).toEqual({
      studentTeacherName: "JOHN REX B. DURAN",
      cooperatingTeacherName: "FERDINAND S. BALTAZAR",
      tleCoordinatorName: "LEA S. RESTA",
      academicHeadName: "NARIZA JANE M. TUMUNDONG",
      aiDeclaration:
        "This lesson plan was developed using AI and subsequently reviewed for accuracy and alignment with curriculum standards.",
    });
    expect(settings.ai).toEqual({
      aiProvider: "openai-compatible",
      apiKey: "",
      baseUrl: "https://api.openai.com/v1",
      modelId: "",
    });
  });

  it("persists updated Teacher Profile and AI provider settings to local disk across engine instances", async () => {
    const dataDir = await makeTempDir();
    const engine1 = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
    });

    const saved = await engine1.saveSettings({
      profile: {
        studentTeacherName: "MARIA CLARA",
        cooperatingTeacherName: "JOSE RIZAL",
        tleCoordinatorName: "ANDRES BONIFACIO",
        academicHeadName: "APOLINARIO MABINI",
        aiDeclaration: "Reviewed and verified by teacher.",
      },
      ai: {
        aiProvider: "openrouter",
        apiKey: "or-secret-123",
        baseUrl: "https://openrouter.ai/api/v1",
        modelId: "google/gemini-2.5-flash",
      },
    });

    expect(saved.profile.studentTeacherName).toBe("MARIA CLARA");
    expect(saved.ai.aiProvider).toBe("openrouter");

    const engine2 = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
    });
    const reloaded = await engine2.getSettings();
    expect(reloaded).toEqual(saved);
  });

  it("rejects invalid AI provider or malformed base URL on saveSettings", async () => {
    const dataDir = await makeTempDir();
    const engine = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
    });

    await expect(
      engine.saveSettings({
        ai: {
          aiProvider: "unknown" as never,
          apiKey: "k",
          baseUrl: "https://example.com",
          modelId: "m",
        },
      }),
    ).rejects.toThrow(/unsupported ai provider/i);

    await expect(
      engine.saveSettings({
        ai: {
          aiProvider: "ollama",
          apiKey: "",
          baseUrl: "not-a-url",
          modelId: "llama3.2",
        },
      }),
    ).rejects.toThrow(/valid http/i);

    await expect(
      engine.saveSettings({
        ai: {
          aiProvider: "ollama",
          apiKey: "",
          baseUrl: "",
          modelId: "llama3.2",
        },
      }),
    ).rejects.toThrow(/base url is required/i);
  });

  it("invokes the AI Provider Adapter on testAiConnection and reports success or failure", async () => {
    const dataDir = await makeTempDir();
    const seenRequests: AiGenerateRequest[] = [];
    const fakeAdapter: AiProviderAdapter = {
      async generateText(req) {
        seenRequests.push(req);
        if (req.settings.apiKey === "bad-key") {
          throw new Error("401 Unauthorized: invalid API key");
        }
        return { text: "OK", model: req.settings.modelId };
      },
    };

    const engine = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
      aiAdapter: fakeAdapter,
    });

    const missingModel = await engine.testAiConnection();
    expect(missingModel.ok).toBe(false);
    expect(missingModel.message).toMatch(/model id/i);
    expect(seenRequests).toHaveLength(0);

    await engine.saveSettings({
      ai: {
        aiProvider: "gemini",
        apiKey: "valid-key",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        modelId: "gemini-2.5-flash",
      },
    });

    const okResult = await engine.testAiConnection();
    expect(okResult).toEqual({
      ok: true,
      message: "Connected to gemini (gemini-2.5-flash).",
      model: "gemini-2.5-flash",
    });
    expect(seenRequests).toHaveLength(1);
    expect(seenRequests[0]?.settings.aiProvider).toBe("gemini");

    const badResult = await engine.testAiConnection({ apiKey: "bad-key" });
    expect(badResult.ok).toBe(false);
    expect(badResult.message).toContain("401 Unauthorized");

    const ollamaResult = await engine.testAiConnection({
      aiProvider: "ollama",
      apiKey: "",
      baseUrl: "http://localhost:11434/v1",
      modelId: "llama3.2",
    });
    expect(ollamaResult.ok).toBe(true);
    expect(ollamaResult.model).toBe("llama3.2");
  });

  it("dispatches OpenAI-compatible, Gemini, and Anthropic wire requests via live adapter", async () => {
    const dataDir = await makeTempDir();
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];

    const stubFetch: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url, headers });

      if (url.includes(":generateContent")) {
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "OK" }] } }],
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/messages")) {
        return new Response(
          JSON.stringify({
            model: "claude-sonnet-4-5",
            content: [{ type: "text", text: "OK" }],
          }),
          { status: 200 },
        );
      }
      if (url.includes("fail.example")) {
        return new Response(
          JSON.stringify({ error: { message: "bad token" } }),
          { status: 401 },
        );
      }
      return new Response(
        JSON.stringify({
          model: "gpt-4o-mini",
          choices: [{ message: { content: "OK" } }],
        }),
        { status: 200 },
      );
    };

    const engine = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
      aiAdapter: createLiveAiAdapter(stubFetch),
    });

    const openaiRes = await engine.testAiConnection({
      aiProvider: "openai-compatible",
      apiKey: "sk-1",
      baseUrl: "https://api.openai.com/v1",
      modelId: "gpt-4o-mini",
    });
    expect(openaiRes.ok).toBe(true);

    const geminiRes = await engine.testAiConnection({
      aiProvider: "gemini",
      apiKey: "gem-1",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      modelId: "gemini-2.5-flash",
    });
    expect(geminiRes.ok).toBe(true);

    const anthropicRes = await engine.testAiConnection({
      aiProvider: "anthropic",
      apiKey: "ant-1",
      baseUrl: "https://api.anthropic.com/v1",
      modelId: "claude-sonnet-4-5",
    });
    expect(anthropicRes.ok).toBe(true);

    const failRes = await engine.testAiConnection({
      aiProvider: "openrouter",
      apiKey: "bad",
      baseUrl: "https://fail.example/v1",
      modelId: "openai/gpt-4o-mini",
    });
    expect(failRes.ok).toBe(false);
    expect(failRes.message).toBe("HTTP 401: bad token");

    expect(calls.map((c) => c.url)).toEqual([
      "https://api.openai.com/v1/chat/completions",
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      "https://api.anthropic.com/v1/messages",
      "https://fail.example/v1/chat/completions",
    ]);
  });
});
