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

  it("lists live AI models with free-first sorting and falls back to curated presets on missing credentials or errors", async () => {
    const dataDir = await makeTempDir();
    const fakeAdapter: AiProviderAdapter = {
      async generateText() {
        return { text: "OK" };
      },
      async listModels(settings) {
        if (settings.baseUrl.includes("offline.example")) {
          throw new Error("ECONNREFUSED");
        }
        return [
          { id: "paid/model-a", label: "Paid Model A" },
          {
            id: "free/model-b:free",
            label: "Free Model B",
            isFree: true,
            freeBadge: "Free",
          },
        ];
      },
    };

    const engine = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
      aiAdapter: fakeAdapter,
    });

    // Missing required API key -> curated fallback
    const missingKey = await engine.listAiModels({
      aiProvider: "openrouter",
      apiKey: "",
      baseUrl: "https://openrouter.ai/api/v1",
    });
    expect(missingKey.source).toBe("curated");
    expect(missingKey.models.length).toBeGreaterThan(0);
    expect(missingKey.message).toMatch(/api key is required/i);

    // Live success -> free-first sorted
    const live = await engine.listAiModels({
      aiProvider: "openrouter",
      apiKey: "or-key",
      baseUrl: "https://openrouter.ai/api/v1",
    });
    expect(live.source).toBe("live");
    expect(live.models.map((m) => m.id)).toEqual([
      "free/model-b:free",
      "paid/model-a",
    ]);

    // Network/provider failure -> curated fallback
    const offline = await engine.listAiModels({
      aiProvider: "openrouter",
      apiKey: "or-key",
      baseUrl: "https://offline.example/v1",
    });
    expect(offline.source).toBe("curated");
    expect(offline.models.length).toBeGreaterThan(0);
    expect(offline.message).toContain("ECONNREFUSED");

    // Local Ollama without API key -> live success
    const ollama = await engine.listAiModels({
      aiProvider: "ollama",
      apiKey: "",
      baseUrl: "http://localhost:11434/v1",
    });
    expect(ollama.source).toBe("live");
  });

  it("sends native system-role payloads across all five providers when systemInstruction is provided and omits them otherwise", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];

    const stubFetch: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      calls.push({ url, body });

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
      return new Response(
        JSON.stringify({
          model: "test-model",
          choices: [{ message: { content: "OK" } }],
        }),
        { status: 200 },
      );
    };

    const adapter = createLiveAiAdapter(stubFetch);
    const sys = "Follow the DepEd MATATAG ILAW Framework.";

    await adapter.generateText({
      systemInstruction: sys,
      prompt: "User prompt",
      settings: {
        aiProvider: "gemini",
        apiKey: "gem-key",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        modelId: "gemini-2.5-flash",
      },
    });
    await adapter.generateText({
      systemInstruction: sys,
      prompt: "User prompt",
      settings: {
        aiProvider: "anthropic",
        apiKey: "ant-key",
        baseUrl: "https://api.anthropic.com/v1",
        modelId: "claude-sonnet-4-5",
      },
    });
    await adapter.generateText({
      systemInstruction: sys,
      prompt: "User prompt",
      settings: {
        aiProvider: "openai-compatible",
        apiKey: "sk-key",
        baseUrl: "https://api.openai.com/v1",
        modelId: "gpt-4o-mini",
      },
    });
    await adapter.generateText({
      systemInstruction: sys,
      prompt: "User prompt",
      settings: {
        aiProvider: "openrouter",
        apiKey: "or-key",
        baseUrl: "https://openrouter.ai/api/v1",
        modelId: "google/gemini-2.5-flash",
      },
    });
    await adapter.generateText({
      systemInstruction: sys,
      prompt: "User prompt",
      settings: {
        aiProvider: "ollama",
        apiKey: "",
        baseUrl: "http://localhost:11434/v1",
        modelId: "llama3.2",
      },
    });

    // Without systemInstruction (and whitespace-only)
    await adapter.generateText({
      prompt: "Plain Gemini",
      settings: {
        aiProvider: "gemini",
        apiKey: "gem-key",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        modelId: "gemini-2.5-flash",
      },
    });
    await adapter.generateText({
      systemInstruction: "   ",
      prompt: "Plain Anthropic",
      settings: {
        aiProvider: "anthropic",
        apiKey: "ant-key",
        baseUrl: "https://api.anthropic.com/v1",
        modelId: "claude-sonnet-4-5",
      },
    });
    await adapter.generateText({
      prompt: "Plain OpenAI",
      settings: {
        aiProvider: "openai-compatible",
        apiKey: "sk-key",
        baseUrl: "https://api.openai.com/v1",
        modelId: "gpt-4o-mini",
      },
    });

    // 0: Gemini with systemInstruction
    expect(calls[0]!.body).toEqual({
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: "user", parts: [{ text: "User prompt" }] }],
    });

    // 1: Anthropic with system + large max_tokens for 5-session plans
    expect(calls[1]!.body.system).toBe(sys);
    expect(calls[1]!.body.max_tokens).toBeGreaterThanOrEqual(4096);
    expect(calls[1]!.body.messages).toEqual([
      { role: "user", content: "User prompt" },
    ]);

    // 2, 3, 4: OpenAI-Compatible, OpenRouter, Ollama with system message first
    for (const idx of [2, 3, 4]) {
      expect(calls[idx]!.body.messages).toEqual([
        { role: "system", content: sys },
        { role: "user", content: "User prompt" },
      ]);
    }

    // 5, 6, 7: Omitted when absent or whitespace-only
    expect(calls[5]!.body).not.toHaveProperty("systemInstruction");
    expect(calls[6]!.body).not.toHaveProperty("system");
    expect(calls[7]!.body.messages).toEqual([
      { role: "user", content: "Plain OpenAI" },
    ]);
  });

  it("lists and filters Grades 7-10 MATATAG TLE Curriculum Guide competencies across components, quarters, sectors, and search queries", async () => {
    const dataDir = await makeTempDir();
    const engine = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
    });

    const all = await engine.listCurriculum();
    expect(all.length).toBeGreaterThanOrEqual(400);

    const g7Ict = await engine.listCurriculum({
      gradeLevel: 7,
      quarter: 1,
      component: "ICT",
    });
    expect(g7Ict).toHaveLength(9);
    expect(g7Ict[0]).toMatchObject({
      source: "built-in",
      component: "ICT",
      sector: null,
      quarterLabel: "Quarter I",
      contentTopic: "Sectors of ICT and Its Career and Business Opportunities",
    });
    expect(g7Ict[0]?.contentStandard).toContain("ICT sectors");
    expect(g7Ict[0]?.performanceStandard).toContain(
      "convert number systems in practical scenarios",
    );

    const g8Afa = await engine.listCurriculum({
      gradeLevel: 8,
      quarter: 2,
      component: "AFA",
    });
    expect(g8Afa.length).toBeGreaterThan(0);
    expect(g8Afa.every((item) => item.gradeLevels.includes(8))).toBe(true);

    const g9_10 = await engine.listCurriculum({ gradeLevel: 9 });
    const g10 = await engine.listCurriculum({ gradeLevel: 10 });
    expect(g9_10.length).toBe(g10.length);
    const sectors = new Set(
      g9_10.map((item) => item.sector).filter((s): s is string => Boolean(s)),
    );
    expect(sectors.size).toBe(23);
    expect(sectors).toEqual(
      new Set([
        "COMPUTER PROGRAMMING",
        "TELECOMMUNICATIONS",
        "COMPUTER SYSTEMS SERVICING",
        "VISUAL ARTS",
        "ANIMAL PRODUCTION",
        "AQUACULTURE (FISH CULTURE)",
        "AGRICULTURAL CROP PRODUCTION",
        "FISH CAPTURE",
        "FOOD AND BEVERAGE PROCESSING",
        "BEAUTY CARE SERVICES",
        "FOOD SERVICE",
        "GARMENTS",
        "HEALTH AND WELLNESS MASSAGE",
        "FOOD PREPARATION",
        "HOTEL SERVICES",
        "HANDICRAFTS",
        "TOURISM SERVICES",
        "AUTOMOTIVE AND SMALL ENGINE SERVICING",
        "ELECTRICAL AND ELECTRONICS SERVICING",
        "RESIDENTIAL CARPENTRY",
        "RESIDENTIAL MASONRY AND TILE SETTING",
        "RESIDENTIAL PLUMBING",
        "SHIELDED METAL ARC WELDING (SMAW)",
      ]),
    );

    const programmingQ3 = await engine.listCurriculum({
      gradeLevel: 10,
      quarter: 3,
      component: "ICT",
      sector: "COMPUTER PROGRAMMING",
      query: "HTML",
    });
    expect(programmingQ3.length).toBeGreaterThanOrEqual(2);
    expect(
      programmingQ3.every(
        (item) =>
          item.sector === "COMPUTER PROGRAMMING" &&
          item.quarters.includes(3),
      ),
    ).toBe(true);
  });

  it("enriches all Grade 7 Learning Competencies with Budget of Work week ranges, Suggested Activities, and Suggested Performance Tasks", async () => {
    const dataDir = await makeTempDir();
    const engine = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
    });

    const grade7 = await engine.listCurriculum({ gradeLevel: 7 });
    expect(grade7).toHaveLength(43);
    for (const item of grade7) {
      expect(item.budgetOfWork).toBeDefined();
      expect(item.budgetOfWork?.term).toBeTruthy();
      expect(item.budgetOfWork?.weekRange).toBeTruthy();
      expect(item.budgetOfWork?.suggestedActivities).toBeTruthy();
      expect(item.budgetOfWork?.suggestedPerformanceTasks).toBeTruthy();
    }

    const ictFirst = grade7.find(
      (i) => i.component === "ICT" && i.competencyNumber === 1,
    );
    expect(ictFirst?.budgetOfWork).toMatchObject({
      term: "First Term",
      weekRange: "1 to 3",
    });
    expect(ictFirst?.budgetOfWork?.suggestedActivities).toContain(
      "ICT Sector Research Map",
    );
    expect(ictFirst?.budgetOfWork?.suggestedPerformanceTasks).toContain(
      "Binary to Decimal Conversion Challenge",
    );

    const g7IctSecondTerm = await engine.listCurriculum({
      gradeLevel: 7,
      component: "ICT",
      term: "Second Term",
    });
    expect(g7IctSecondTerm).toHaveLength(3);
    expect(
      g7IctSecondTerm.every(
        (i) => i.budgetOfWork?.term === "Second Term",
      ),
    ).toBe(true);

    const afaFirst = grade7.find(
      (i) => i.component === "AFA" && i.competencyNumber === 1,
    );
    expect(afaFirst?.budgetOfWork?.weekRange).toBe("1");
    expect(afaFirst?.budgetOfWork?.suggestedActivities).toContain(
      "Agriculture Career Spotlight",
    );
    expect(afaFirst?.budgetOfWork?.suggestedPerformanceTasks).toContain(
      "Personal Crop Bed Planting",
    );

    const fcsNapkin = grade7.find(
      (i) =>
        i.component === "FCS" &&
        i.learningCompetency.toLowerCase().includes("napkin"),
    );
    expect(fcsNapkin?.budgetOfWork?.weekRange).toBe("8");
    expect(fcsNapkin?.budgetOfWork?.suggestedActivities).toContain(
      "Napkin Folding",
    );

    const iaMeasure = grade7.find(
      (i) =>
        i.component === "IA" &&
        i.learningCompetency.toLowerCase().includes("measuring instruments"),
    );
    expect(iaMeasure?.budgetOfWork?.weekRange).toBe("6 to 8");
    expect(iaMeasure?.budgetOfWork?.suggestedActivities).toContain(
      "Measuring Instrument Observation",
    );
    expect(iaMeasure?.budgetOfWork?.suggestedPerformanceTasks).toContain(
      "Personal Measurement Exercise",
    );
  });

  it("creates, updates, persists, and deletes custom Learning Competencies with validation", async () => {
    const dataDir = await makeTempDir();
    const engine1 = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
    });

    await expect(
      engine1.saveCustomCompetency({
        gradeLevels: [7],
        quarters: [1],
        component: "ICT",
        contentTopic: "Local Web Basics",
        contentStandard: "The learners demonstrate understanding of HTML.",
        performanceStandard: "The learners create a webpage.",
        learningCompetency: "   ",
      }),
    ).rejects.toThrow(/learning competency/i);

    const created = await engine1.saveCustomCompetency({
      gradeLevels: [7],
      quarters: [1],
      component: "ICT",
      contentTopic: "Local Web Basics",
      contentSubTopics: ["semantic HTML", "accessibility"],
      contentStandard: "The learners demonstrate understanding of HTML.",
      performanceStandard: "The learners create an accessible webpage.",
      learningCompetency: "build a personal portfolio page using semantic HTML",
      budgetOfWork: {
        term: "Third Term",
        weekRange: "9 to 10",
        suggestedActivities: "- Portfolio wireframe lab",
        suggestedPerformanceTasks: "- Publish local HTML portfolio",
      },
      customNotes: "Use school lab computers with offline browsers.",
    });

    expect(created.id).toMatch(/^custom-/);
    expect(created.source).toBe("custom");
    expect(created.quarterLabel).toBe("Quarter I");

    const updated = await engine1.saveCustomCompetency({
      id: created.id,
      gradeLevels: [7],
      quarters: [1],
      component: "ICT",
      contentTopic: "Local Web Basics",
      contentSubTopics: ["semantic HTML"],
      contentStandard: "The learners demonstrate understanding of HTML.",
      performanceStandard: "The learners create an accessible webpage.",
      learningCompetency: "build a structured webpage using semantic HTML5",
      customNotes: "Pair programming in 50-minute block.",
    });
    expect(updated.id).toBe(created.id);
    expect(updated.learningCompetency).toBe(
      "build a structured webpage using semantic HTML5",
    );

    const engine2 = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
    });
    const ictList = await engine2.listCurriculum({
      gradeLevel: 7,
      quarter: 1,
      component: "ICT",
      query: "semantic HTML5",
    });
    expect(ictList).toHaveLength(1);
    expect(ictList[0]).toMatchObject({
      id: created.id,
      source: "custom",
      customNotes: "Pair programming in 50-minute block.",
    });

    const fullG7Ict = await engine2.listCurriculum({
      gradeLevel: 7,
      quarter: 1,
      component: "ICT",
    });
    expect(fullG7Ict).toHaveLength(10);

    await engine2.deleteCustomCompetency(created.id);
    const afterDelete = await engine2.listCurriculum({
      gradeLevel: 7,
      quarter: 1,
      component: "ICT",
    });
    expect(afterDelete).toHaveLength(9);

    await expect(engine2.deleteCustomCompetency("cg-g7-ict-q1-01")).rejects.toThrow(
      /not found|cannot delete/i,
    );
  });

  it("persists unpacked Budget of Work notes on built-in and custom competencies without altering built-in fields", async () => {
    const dataDir = await makeTempDir();
    const engine1 = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
    });

    const noted = await engine1.saveCompetencyNotes(
      "cg-g7-ict-q1-01",
      "Day 1: 15-min sector matching warm-up; Day 2: career poster in pairs.",
    );
    expect(noted.id).toBe("cg-g7-ict-q1-01");
    expect(noted.source).toBe("built-in");
    expect(noted.customNotes).toBe(
      "Day 1: 15-min sector matching warm-up; Day 2: career poster in pairs.",
    );
    expect(noted.budgetOfWork?.weekRange).toBe("1 to 3");

    const engine2 = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
    });
    const found = await engine2.listCurriculum({
      gradeLevel: 7,
      component: "ICT",
      query: "career poster",
    });
    expect(found).toHaveLength(1);
    expect(found[0]?.id).toBe("cg-g7-ict-q1-01");

    const cleared = await engine2.saveCompetencyNotes("cg-g7-ict-q1-01", "   ");
    expect(cleared.customNotes).toBeUndefined();

    await expect(
      engine2.saveCompetencyNotes("missing-id", "Note"),
    ).rejects.toThrow(/not found/i);
  });

  it("creates, edits, persists, and deletes Class Sections with validation across engine instances", async () => {
    const dataDir = await makeTempDir();
    const engine1 = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
    });

    expect(await engine1.listClassSections()).toEqual([]);

    await expect(
      engine1.saveClassSection({
        gradeLevel: 7,
        sectionName: "   ",
        students: ["Ana", "Ben"],
      }),
    ).rejects.toThrow(/section name/i);

    await expect(
      engine1.saveClassSection({
        gradeLevel: 7,
        sectionName: "7-Rizal",
        students: ["   ", ""],
      }),
    ).rejects.toThrow(/student/i);

    const created = await engine1.saveClassSection({
      gradeLevel: 7,
      sectionName: "  7-Rizal  ",
      students: ["  Ana Cruz ", "", "Ben Reyes", "Cara Lim  "],
    });
    expect(created.id).toMatch(/^sec-/);
    expect(created).toMatchObject({
      gradeLevel: 7,
      sectionName: "7-Rizal",
      students: ["Ana Cruz", "Ben Reyes", "Cara Lim"],
    });

    const updated = await engine1.saveClassSection({
      id: created.id,
      gradeLevel: 8,
      sectionName: "8-Bonifacio",
      students: ["Ana Cruz", "Danilo Santos"],
    });
    expect(updated).toEqual({
      id: created.id,
      gradeLevel: 8,
      sectionName: "8-Bonifacio",
      students: ["Ana Cruz", "Danilo Santos"],
    });

    const engine2 = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
    });
    expect(await engine2.listClassSections()).toEqual([updated]);

    await engine2.deleteClassSection(created.id);
    expect(await engine2.listClassSections()).toEqual([]);

    await expect(engine2.deleteClassSection("missing-sec")).rejects.toThrow(
      /not found/i,
    );
  });
});
