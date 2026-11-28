import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createGuroMateEngine } from "../engine/createGuroMateEngine";
import { createGuroMateMiddleware } from "./guroMateVitePlugin";

describe("guroMateVitePlugin HTTP middleware", () => {
  const servers: Server[] = [];
  const tempDirs: string[] = [];

  async function startTestServer() {
    const dataDir = await mkdtemp(path.join(tmpdir(), "guromate-http-"));
    tempDirs.push(dataDir);
    const engine = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
      aiAdapter: {
        async generateText(req) {
          return { text: "OK", model: req.settings.modelId };
        },
        async listModels(settings) {
          if (settings.baseUrl.includes("fail.example")) {
            throw new Error("Upstream unreachable");
          }
          return [
            { id: "paid-model", label: "Paid Model" },
            {
              id: "free-model:free",
              label: "Free Model",
              isFree: true,
              freeBadge: "Free",
            },
          ];
        },
      },
    });
    const middleware = createGuroMateMiddleware(engine);
    const server = createServer((req, res) => {
      middleware(req, res, () => {
        res.statusCode = 404;
        res.end("Not Found");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    servers.push(server);
    const { port } = server.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  afterEach(async () => {
    await Promise.all(
      servers
        .splice(0)
        .map((s) => new Promise<void>((resolve) => s.close(() => resolve()))),
    );
    await Promise.all(
      tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it("serves GET/PUT /api/settings and POST /api/settings/test-connection", async () => {
    const baseUrl = await startTestServer();

    const getRes = await fetch(`${baseUrl}/api/settings`);
    expect(getRes.status).toBe(200);
    const initial = (await getRes.json()) as {
      profile: { studentTeacherName: string };
    };
    expect(initial.profile.studentTeacherName).toBe("JOHN REX B. DURAN");

    const putRes = await fetch(`${baseUrl}/api/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile: { studentTeacherName: "JUAN DELA CRUZ" },
        ai: {
          aiProvider: "ollama",
          apiKey: "",
          baseUrl: "http://localhost:11434/v1",
          modelId: "qwen2.5",
        },
      }),
    });
    expect(putRes.status).toBe(200);
    const updated = (await putRes.json()) as {
      profile: { studentTeacherName: string };
      ai: { modelId: string };
    };
    expect(updated.profile.studentTeacherName).toBe("JUAN DELA CRUZ");
    expect(updated.ai.modelId).toBe("qwen2.5");

    const checkRes = await fetch(`${baseUrl}/api/settings/test-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(checkRes.status).toBe(200);
    const checkJson = (await checkRes.json()) as { ok: boolean; model: string };
    expect(checkJson).toMatchObject({ ok: true, model: "qwen2.5" });

    const badJsonRes = await fetch(`${baseUrl}/api/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{bad",
    });
    expect(badJsonRes.status).toBe(400);
  });

  it("serves POST /api/settings/models with live free-first results and curated fallback", async () => {
    const baseUrl = await startTestServer();

    const liveRes = await fetch(`${baseUrl}/api/settings/models`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ai: {
          aiProvider: "openrouter",
          apiKey: "or-key",
          baseUrl: "https://openrouter.ai/api/v1",
        },
      }),
    });
    expect(liveRes.status).toBe(200);
    const liveJson = (await liveRes.json()) as {
      source: string;
      models: Array<{ id: string }>;
    };
    expect(liveJson.source).toBe("live");
    expect(liveJson.models.map((m) => m.id)).toEqual([
      "free-model:free",
      "paid-model",
    ]);

    const fallbackRes = await fetch(`${baseUrl}/api/settings/models`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ai: {
          aiProvider: "openrouter",
          apiKey: "or-key",
          baseUrl: "https://fail.example/v1",
        },
      }),
    });
    expect(fallbackRes.status).toBe(200);
    const fallbackJson = (await fallbackRes.json()) as {
      source: string;
      models: Array<{ id: string }>;
      message?: string;
    };
    expect(fallbackJson.source).toBe("curated");
    expect(fallbackJson.models.length).toBeGreaterThan(0);
    expect(fallbackJson.message).toContain("Upstream unreachable");

    const badRes = await fetch(`${baseUrl}/api/settings/models`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "[]",
    });
    expect(badRes.status).toBe(400);
  });

  it("serves curriculum catalog filtering, custom competency CRUD, and BoW note persistence over /api/curriculum", async () => {
    const baseUrl = await startTestServer();

    const listRes = await fetch(
      `${baseUrl}/api/curriculum?gradeLevel=7&quarter=1&component=ICT`,
    );
    expect(listRes.status).toBe(200);
    const items = (await listRes.json()) as Array<{ id: string }>;
    expect(items).toHaveLength(9);

    const termRes = await fetch(
      `${baseUrl}/api/curriculum?gradeLevel=7&component=ICT&term=${encodeURIComponent("Second Term")}`,
    );
    expect(termRes.status).toBe(200);
    const termItems = (await termRes.json()) as Array<{ id: string }>;
    expect(termItems).toHaveLength(3);

    const badFilterRes = await fetch(
      `${baseUrl}/api/curriculum?gradeLevel=13`,
    );
    expect(badFilterRes.status).toBe(400);

    const createRes = await fetch(`${baseUrl}/api/curriculum/custom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gradeLevels: [9, 10],
        quarters: [1, 3],
        component: "ICT",
        sector: "COMPUTER PROGRAMMING",
        contentTopic: "Git Basics",
        contentStandard: "The learners demonstrate understanding of version control.",
        performanceStandard: "The learners manage source revisions.",
        learningCompetency: "commit changes cleanly to a local repository",
      }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string; source: string };
    expect(created.source).toBe("custom");

    const noteRes = await fetch(
      `${baseUrl}/api/curriculum/${encodeURIComponent("cg-g7-ict-q1-01")}/notes`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customNotes: "Use local ICT sector chart." }),
      },
    );
    expect(noteRes.status).toBe(200);
    const noted = (await noteRes.json()) as { customNotes?: string };
    expect(noted.customNotes).toBe("Use local ICT sector chart.");

    const updateRes = await fetch(
      `${baseUrl}/api/curriculum/custom/${encodeURIComponent(created.id)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gradeLevels: [9, 10],
          quarters: [1, 3],
          component: "ICT",
          sector: "COMPUTER PROGRAMMING",
          contentTopic: "Git Basics",
          contentStandard: "The learners demonstrate understanding of version control.",
          performanceStandard: "The learners manage source revisions.",
          learningCompetency: "stage and commit changes to a local repository",
        }),
      },
    );
    expect(updateRes.status).toBe(200);

    const delRes = await fetch(
      `${baseUrl}/api/curriculum/custom/${encodeURIComponent(created.id)}`,
      { method: "DELETE" },
    );
    expect(delRes.status).toBe(200);

    const missingNoteRes = await fetch(
      `${baseUrl}/api/curriculum/does-not-exist/notes`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customNotes: "x" }),
      },
    );
    expect(missingNoteRes.status).toBe(404);
  });

  it("supports Grades 11-12, SHS_CORE, One-Term, hasBow, and sourceDocument over /api/curriculum and /api/class-sections", async () => {
    const baseUrl = await startTestServer();

    const createShsRes = await fetch(`${baseUrl}/api/curriculum/custom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gradeLevels: [11],
        quarters: [1],
        component: "SHS_CORE",
        sector: "Effective Communication",
        contentTopic: "Workplace Communication",
        contentStandard: "The learners demonstrate understanding of workplace communication.",
        performanceStandard: "The learners deliver clear oral presentations.",
        learningCompetency: "compose concise technical memos",
        budgetOfWork: {
          term: "One-Term",
          weekRange: "1 to 2",
          suggestedActivities: "- Memo drafting workshop",
          suggestedPerformanceTasks: "- Technical memo portfolio",
          sourceDocument: "SHS Core BoW - Effective Communication.pdf",
        },
      }),
    });
    expect(createShsRes.status).toBe(201);
    const createdShs = (await createShsRes.json()) as {
      id: string;
      component: string;
      budgetOfWork?: { term: string; sourceDocument?: string };
    };
    expect(createdShs.component).toBe("SHS_CORE");
    expect(createdShs.budgetOfWork?.sourceDocument).toBe(
      "SHS Core BoW - Effective Communication.pdf",
    );

    const createG12Res = await fetch(`${baseUrl}/api/curriculum/custom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gradeLevels: [12],
        quarters: [1],
        component: "IA",
        sector: "Electrical Installation",
        contentTopic: "Circuit Diagnostics",
        contentStandard: "The learners demonstrate understanding of diagnostics.",
        performanceStandard: "The learners troubleshoot circuits safely.",
        learningCompetency: "diagnose branch circuit faults",
      }),
    });
    expect(createG12Res.status).toBe(201);

    const shsFilterRes = await fetch(
      `${baseUrl}/api/curriculum?gradeLevel=11&component=SHS_CORE&term=${encodeURIComponent("One-Term")}&hasBow=true`,
    );
    expect(shsFilterRes.status).toBe(200);
    const shsFiltered = (await shsFilterRes.json()) as Array<{
      id: string;
      budgetOfWork?: { sourceDocument?: string };
    }>;
    expect(shsFiltered).toHaveLength(1);
    expect(shsFiltered[0]?.id).toBe(createdShs.id);
    expect(shsFiltered[0]?.budgetOfWork?.sourceDocument).toBe(
      "SHS Core BoW - Effective Communication.pdf",
    );

    const g12NoBowRes = await fetch(
      `${baseUrl}/api/curriculum?gradeLevel=12&hasBow=false`,
    );
    expect(g12NoBowRes.status).toBe(200);
    const g12NoBow = (await g12NoBowRes.json()) as Array<{
      id: string;
      budgetOfWork?: unknown;
    }>;
    expect(g12NoBow.length).toBeGreaterThanOrEqual(1);
    expect(g12NoBow.every((item) => !item.budgetOfWork)).toBe(true);

    const badHasBowRes = await fetch(
      `${baseUrl}/api/curriculum?hasBow=maybe`,
    );
    expect(badHasBowRes.status).toBe(400);

    const g11SectionRes = await fetch(`${baseUrl}/api/class-sections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gradeLevel: 11,
        sectionName: "11-STEM-A",
        students: ["Ana Cruz", "Ben Reyes"],
      }),
    });
    expect(g11SectionRes.status).toBe(201);
    expect(await g11SectionRes.json()).toMatchObject({
      gradeLevel: 11,
      sectionName: "11-STEM-A",
    });

    const g12SectionRes = await fetch(`${baseUrl}/api/class-sections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gradeLevel: 12,
        sectionName: "12-TVL-ICT",
        students: ["Cara Lim"],
      }),
    });
    expect(g12SectionRes.status).toBe(201);
    expect(await g12SectionRes.json()).toMatchObject({
      gradeLevel: 12,
      sectionName: "12-TVL-ICT",
    });
  });

  it("serves Class Section CRUD and error status codes over /api/class-sections", async () => {
    const baseUrl = await startTestServer();

    const emptyRes = await fetch(`${baseUrl}/api/class-sections`);
    expect(emptyRes.status).toBe(200);
    expect(await emptyRes.json()).toEqual([]);

    const invalidRes = await fetch(`${baseUrl}/api/class-sections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gradeLevel: 7,
        sectionName: "",
        students: ["Ana"],
      }),
    });
    expect(invalidRes.status).toBe(400);

    const createRes = await fetch(`${baseUrl}/api/class-sections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gradeLevel: 7,
        sectionName: "7-Sampaguita",
        students: ["Ana Cruz", "Ben Reyes"],
      }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      id: string;
      sectionName: string;
    };
    expect(created.sectionName).toBe("7-Sampaguita");

    const updateRes = await fetch(
      `${baseUrl}/api/class-sections/${encodeURIComponent(created.id)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gradeLevel: 8,
          sectionName: "8-Narra",
          students: ["Ana Cruz", "Ben Reyes", "Cara Lim"],
        }),
      },
    );
    expect(updateRes.status).toBe(200);
    expect(await updateRes.json()).toMatchObject({
      id: created.id,
      gradeLevel: 8,
      sectionName: "8-Narra",
      students: ["Ana Cruz", "Ben Reyes", "Cara Lim"],
    });

    const listRes = await fetch(`${baseUrl}/api/class-sections`);
    expect(listRes.status).toBe(200);
    expect(await listRes.json()).toHaveLength(1);

    const delRes = await fetch(
      `${baseUrl}/api/class-sections/${encodeURIComponent(created.id)}`,
      { method: "DELETE" },
    );
    expect(delRes.status).toBe(200);

    const missingRes = await fetch(`${baseUrl}/api/class-sections/missing-id`, {
      method: "DELETE",
    });
    expect(missingRes.status).toBe(404);
  });

  it("serves DLL generation, listing, inline editing, deletion, and .docx download over /api/dlls", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "guromate-http-dll-"));
    tempDirs.push(dataDir);
    const engine = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
      aiAdapter: {
        async generateText() {
          return {
            text: JSON.stringify({
              lessonTitle: "HTTP DLL Test",
              references: "CG",
              sessions: [1, 2, 3, 4, 5].map((n) => ({
                sessionNumber: n,
                learningObjectives: `Obj ${n}`,
                preLesson: `Pre ${n}`,
                lessonFlow: `Flow ${n}`,
                learningResources: `Res ${n}`,
                integrationAndContextualization: `Int ${n}`,
                formativeAssessment: `Ass ${n}`,
                extendedLearningOpportunities: `Ext ${n}`,
              })),
            }),
          };
        },
      },
    });
    const middleware = createGuroMateMiddleware(engine);
    const server = createServer((req, res) => {
      middleware(req, res, () => {
        res.statusCode = 404;
        res.end("Not Found");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    servers.push(server);
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    const emptyRes = await fetch(`${baseUrl}/api/dlls`);
    expect(emptyRes.status).toBe(200);
    expect(await emptyRes.json()).toEqual([]);

    const badRes = await fetch(`${baseUrl}/api/dlls/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gradeAndSection: "", sessions: [] }),
    });
    expect(badRes.status).toBe(400);

    const ict = (await engine.listCurriculum({ gradeLevel: 7, component: "ICT" }))[0]!;
    const genRes = await fetch(`${baseUrl}/api/dlls/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gradeAndSection: "7-Rizal",
        promptNotes: "Lab note",
        sessions: [
          { sessionNumber: 1, mode: "instructional", competencyIds: [ict.id] },
          { sessionNumber: 2, mode: "instructional", competencyIds: [ict.id] },
          { sessionNumber: 3, mode: "instructional", competencyIds: [ict.id] },
          { sessionNumber: 4, mode: "instructional", competencyIds: [ict.id] },
          { sessionNumber: 5, mode: "non-instructional", competencyIds: [], nonInstructionalReason: "Holiday" },
        ],
      }),
    });
    expect(genRes.status).toBe(201);
    const created = (await genRes.json()) as {
      id: string;
      lessonTitle: string;
      sessions: Array<{ lessonFlow: string }>;
    };
    expect(created.lessonTitle).toBe("HTTP DLL Test");

    const getRes = await fetch(`${baseUrl}/api/dlls/${encodeURIComponent(created.id)}`);
    expect(getRes.status).toBe(200);

    const putRes = await fetch(`${baseUrl}/api/dlls/${encodeURIComponent(created.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...created,
        lessonTitle: "HTTP DLL Updated",
      }),
    });
    expect(putRes.status).toBe(200);
    const updated = (await putRes.json()) as { lessonTitle: string };
    expect(updated.lessonTitle).toBe("HTTP DLL Updated");

    const docxRes = await fetch(`${baseUrl}/api/dlls/${encodeURIComponent(created.id)}/docx`);
    expect(docxRes.status).toBe(200);
    expect(docxRes.headers.get("content-type")).toContain(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(docxRes.headers.get("content-disposition")).toContain(".docx");
    const docxBytes = Buffer.from(await docxRes.arrayBuffer());
    expect(docxBytes.subarray(0, 2).toString("ascii")).toBe("PK");

    const delRes = await fetch(`${baseUrl}/api/dlls/${encodeURIComponent(created.id)}`, {
      method: "DELETE",
    });
    expect(delRes.status).toBe(200);

    const missingRes = await fetch(`${baseUrl}/api/dlls/${encodeURIComponent(created.id)}`);
    expect(missingRes.status).toBe(404);
  });

  it("serves DLP generation (scratch and derived), listing, inline editing, deletion, and .docx download over /api/dlps", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "guromate-http-dlp-"));
    tempDirs.push(dataDir);
    const engine = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
      aiAdapter: {
        async generateText(req) {
          if (req.prompt.includes("Daily Lesson Log (DLL)")) {
            return {
              text: JSON.stringify({
                lessonTitle: "HTTP DLL Source",
                references: "CG",
                sessions: [1, 2, 3, 4, 5].map((n) => ({
                  sessionNumber: n,
                  learningObjectives: `DLL Obj ${n}`,
                  preLesson: `Pre ${n}`,
                  lessonFlow: `Flow ${n}`,
                  learningResources: `Res ${n}`,
                  integrationAndContextualization: `Int ${n}`,
                  formativeAssessment: `Ass ${n}`,
                  extendedLearningOpportunities: `Ext ${n}`,
                })),
              }),
            };
          }
          return {
            text: JSON.stringify({
              lessonTitle: "HTTP DLP Test",
              references: "CG",
              learningObjectives: "DLP Obj",
              preLesson: { teacherActivity: "T Pre", studentActivity: "S Pre" },
              lessonFlow: { teacherActivity: "T Flow", studentActivity: "S Flow" },
              learningResources: { teacherActivity: "T Res", studentActivity: "S Res" },
              integrationAndContextualization: {
                teacherActivity: "T Int",
                studentActivity: "S Int",
              },
              formativeAssessment: { teacherActivity: "T Ass", studentActivity: "S Ass" },
              extendedLearningOpportunities: {
                teacherActivity: "T Ext",
                studentActivity: "S Ext",
              },
            }),
          };
        },
      },
    });
    const middleware = createGuroMateMiddleware(engine);
    const server = createServer((req, res) => {
      middleware(req, res, () => {
        res.statusCode = 404;
        res.end("Not Found");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    servers.push(server);
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    const emptyRes = await fetch(`${baseUrl}/api/dlps`);
    expect(emptyRes.status).toBe(200);
    expect(await emptyRes.json()).toEqual([]);

    const badRes = await fetch(`${baseUrl}/api/dlps/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "scratch", gradeAndSection: "", competencyIds: [] }),
    });
    expect(badRes.status).toBe(400);

    const ict = (await engine.listCurriculum({ gradeLevel: 7, component: "ICT" }))[0]!;
    const scratchRes = await fetch(`${baseUrl}/api/dlps/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "scratch",
        gradeAndSection: "7-Rizal",
        competencyIds: [ict.id],
        promptNotes: "Lab note",
      }),
    });
    expect(scratchRes.status).toBe(201);
    const created = (await scratchRes.json()) as {
      id: string;
      lessonTitle: string;
      preLesson: { teacherActivity: string; studentActivity: string };
    };
    expect(created.lessonTitle).toBe("HTTP DLP Test");
    expect(created.preLesson.studentActivity).toBe("S Pre");

    const dll = await engine.generateDll({
      gradeAndSection: "7-Rizal",
      sessions: [1, 2, 3, 4, 5].map((n) => ({
        sessionNumber: n as 1 | 2 | 3 | 4 | 5,
        mode: "instructional" as const,
        competencyIds: [ict.id],
      })),
    });
    const deriveRes = await fetch(`${baseUrl}/api/dlps/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "derive",
        dllId: dll.id,
        sessionNumber: 2,
      }),
    });
    expect(deriveRes.status).toBe(201);
    const derived = (await deriveRes.json()) as {
      sourceDllId: string;
      sourceSessionNumber: number;
      intentions: { learningObjectives: string };
    };
    expect(derived.sourceDllId).toBe(dll.id);
    expect(derived.sourceSessionNumber).toBe(2);
    expect(derived.intentions.learningObjectives).toBe("DLL Obj 2");

    const getRes = await fetch(`${baseUrl}/api/dlps/${encodeURIComponent(created.id)}`);
    expect(getRes.status).toBe(200);

    const putRes = await fetch(`${baseUrl}/api/dlps/${encodeURIComponent(created.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...created,
        lessonTitle: "HTTP DLP Updated",
      }),
    });
    expect(putRes.status).toBe(200);
    expect(await putRes.json()).toMatchObject({ lessonTitle: "HTTP DLP Updated" });

    const docxRes = await fetch(`${baseUrl}/api/dlps/${encodeURIComponent(created.id)}/docx`);
    expect(docxRes.status).toBe(200);
    expect(docxRes.headers.get("content-type")).toContain(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(docxRes.headers.get("content-disposition")).toContain(".docx");
    const docxBytes = Buffer.from(await docxRes.arrayBuffer());
    expect(docxBytes.subarray(0, 2).toString("ascii")).toBe("PK");

    const delRes = await fetch(`${baseUrl}/api/dlps/${encodeURIComponent(created.id)}`, {
      method: "DELETE",
    });
    expect(delRes.status).toBe(200);

    const missingRes = await fetch(`${baseUrl}/api/dlps/${encodeURIComponent(created.id)}`);
    expect(missingRes.status).toBe(404);
  });

  it("serves Quiz generation, listing, inline editing, lesson sync, deletion, and .docx download over /api/quizzes", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "guromate-http-quiz-"));
    tempDirs.push(dataDir);
    const engine = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
      aiAdapter: {
        async generateText(req) {
          if (req.prompt.includes("Daily Lesson Log (DLL)")) {
            return {
              text: JSON.stringify({
                lessonTitle: "HTTP DLL Quiz Source",
                references: "CG",
                sessions: [1, 2, 3, 4, 5].map((n) => ({
                  sessionNumber: n,
                  learningObjectives: `Obj ${n}`,
                  preLesson: `Pre ${n}`,
                  lessonFlow: `Flow ${n}`,
                  learningResources: `Res ${n}`,
                  integrationAndContextualization: `Int ${n}`,
                  formativeAssessment: `Ass ${n}`,
                  extendedLearningOpportunities: `Ext ${n}`,
                })),
              }),
            };
          }
          return {
            text: JSON.stringify({
              title: "HTTP Formative Quiz",
              sections: [
                {
                  type: "multipleChoice",
                  directions: "Pick A-D.",
                  items: [
                    {
                      prompt: "Sample question?",
                      choices: ["Opt 1", "Opt 2", "Opt 3", "Opt 4"],
                      answer: "A. Opt 1",
                    },
                  ],
                },
              ],
            }),
          };
        },
      },
    });
    const middleware = createGuroMateMiddleware(engine);
    const server = createServer((req, res) => {
      middleware(req, res, () => {
        res.statusCode = 404;
        res.end("Not Found");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    servers.push(server);
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    const emptyRes = await fetch(`${baseUrl}/api/quizzes`);
    expect(emptyRes.status).toBe(200);
    expect(await emptyRes.json()).toEqual([]);

    const badRes = await fetch(`${baseUrl}/api/quizzes/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceKind: "standalone",
        gradeAndSection: "7-Rizal",
        competencyIds: [],
        itemCounts: { multipleChoice: 0, trueFalse: 0, identification: 0, essayRubric: 0 },
      }),
    });
    expect(badRes.status).toBe(400);

    const ict = (await engine.listCurriculum({ gradeLevel: 7, component: "ICT" }))[0]!;
    const dll = await engine.generateDll({
      gradeAndSection: "7-Rizal",
      sessions: [1, 2, 3, 4, 5].map((n) => ({
        sessionNumber: n as 1 | 2 | 3 | 4 | 5,
        mode: "instructional" as const,
        competencyIds: [ict.id],
      })),
    });

    const genRes = await fetch(`${baseUrl}/api/quizzes/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceKind: "dll",
        dllId: dll.id,
        sessionNumber: 1,
        itemCounts: { multipleChoice: 1, trueFalse: 0, identification: 0, essayRubric: 0 },
      }),
    });
    expect(genRes.status).toBe(201);
    const created = (await genRes.json()) as { id: string; title: string };
    expect(created.title).toBe("HTTP Formative Quiz");

    const putRes = await fetch(`${baseUrl}/api/quizzes/${encodeURIComponent(created.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...created, title: "HTTP Quiz Updated" }),
    });
    expect(putRes.status).toBe(200);
    expect(await putRes.json()).toMatchObject({ title: "HTTP Quiz Updated" });

    const syncRes = await fetch(`${baseUrl}/api/quizzes/${encodeURIComponent(created.id)}/sync`, {
      method: "POST",
    });
    expect(syncRes.status).toBe(200);
    expect((await engine.getDll(dll.id)).sessions[0]!.formativeAssessment).toContain(
      "HTTP Quiz Updated",
    );

    const docxRes = await fetch(`${baseUrl}/api/quizzes/${encodeURIComponent(created.id)}/docx`);
    expect(docxRes.status).toBe(200);
    expect(docxRes.headers.get("content-type")).toContain(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(docxRes.headers.get("content-disposition")).toContain(".docx");
    const docxBytes = Buffer.from(await docxRes.arrayBuffer());
    expect(docxBytes.subarray(0, 2).toString("ascii")).toBe("PK");

    const delRes = await fetch(`${baseUrl}/api/quizzes/${encodeURIComponent(created.id)}`, {
      method: "DELETE",
    });
    expect(delRes.status).toBe(200);
    const missingRes = await fetch(`${baseUrl}/api/quizzes/${encodeURIComponent(created.id)}`);
    expect(missingRes.status).toBe(404);
  });

  it("extracts .txt, .docx, and .pdf Reference Material over POST /api/reference-material/extract with higher body limit, truncation, and clear error messages", async () => {
    const baseUrl = await startTestServer();
    const { createZip } = await import("../engine/zip");

    // 1. Plain text (.txt) with BOM and CRLF
    const txtRes = await fetch(`${baseUrl}/api/reference-material/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: "TESDA-Safety-Notes.txt",
        dataBase64: Buffer.from("\uFEFFRule 1: Wear safety goggles.\r\nRule 2: Inspect cords.", "utf8").toString("base64"),
      }),
    });
    expect(txtRes.status).toBe(200);
    const txtJson = (await txtRes.json()) as {
      sourceLabel: string;
      text: string;
      truncated: boolean;
      originalLength: number;
      maxLength: number;
    };
    expect(txtJson.sourceLabel).toBe("TESDA-Safety-Notes.txt");
    expect(txtJson.text).toBe("Rule 1: Wear safety goggles.\nRule 2: Inspect cords.");
    expect(txtJson.truncated).toBe(false);

    // 2. Word document (.docx) built in-memory via createZip
    const docXml =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      "<w:p><w:r><w:t>DepEd Lesson Exemplar: Bread &amp; Pastry</w:t></w:r></w:p>" +
      "<w:p><w:r><w:t>Preheat oven to 180 C before baking.</w:t></w:r></w:p>" +
      "</w:body></w:document>";
    const docxBuf = createZip([
      { name: "word/document.xml", data: Buffer.from(docXml, "utf8") },
    ]);
    const docxRes = await fetch(`${baseUrl}/api/reference-material/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: "Lesson-Exemplar-FCS.docx",
        dataBase64: docxBuf.toString("base64"),
      }),
    });
    expect(docxRes.status).toBe(200);
    const docxJson = (await docxRes.json()) as { sourceLabel: string; text: string; truncated: boolean };
    expect(docxJson.sourceLabel).toBe("Lesson-Exemplar-FCS.docx");
    expect(docxJson.text).toContain("DepEd Lesson Exemplar: Bread & Pastry");
    expect(docxJson.text).toContain("Preheat oven to 180 C before baking.");
    expect(docxJson.truncated).toBe(false);

    // 3. Minimal valid PDF (.pdf) extracted via pdftotext
    const buildMinimalPdf = (text: string): Buffer => {
      const escaped = text.replace(/([()\\])/g, "\\$1");
      const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
      const objects = [
        "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
        "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
        "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
        `4 0 obj << /Length ${Buffer.byteLength(stream, "ascii")} >> stream\n${stream}\nendstream endobj`,
        "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
      ];
      let body = "%PDF-1.4\n";
      const offsets: number[] = [];
      for (const obj of objects) {
        offsets.push(Buffer.byteLength(body, "ascii"));
        body += `${obj}\n`;
      }
      const xrefOffset = Buffer.byteLength(body, "ascii");
      body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
      for (const off of offsets) {
        body += `${String(off).padStart(10, "0")} 00000 n \n`;
      }
      body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
      return Buffer.from(body, "ascii");
    };
    const pdfBuf = buildMinimalPdf("DepEd Learning Activity Sheet: Ohms Law V = I x R");
    const pdfRes = await fetch(`${baseUrl}/api/reference-material/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: "LAS-Ohms-Law.pdf",
        dataBase64: pdfBuf.toString("base64"),
      }),
    });
    expect(pdfRes.status).toBe(200);
    const pdfJson = (await pdfRes.json()) as { sourceLabel: string; text: string; truncated: boolean };
    expect(pdfJson.sourceLabel).toBe("LAS-Ohms-Law.pdf");
    expect(pdfJson.text).toContain("DepEd Learning Activity Sheet: Ohms Law V = I x R");
    expect(pdfJson.truncated).toBe(false);

    // 4. Payload larger than default 1 MB JSON body cap succeeds and truncates to maxLength
    const largeText = "Electrical safety check line.\n".repeat(45_000); // ~1.35 MB raw -> ~1.8 MB base64 JSON
    const largeRes = await fetch(`${baseUrl}/api/reference-material/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: "Long-Manual.txt",
        dataBase64: Buffer.from(largeText, "utf8").toString("base64"),
      }),
    });
    expect(largeRes.status).toBe(200);
    const largeJson = (await largeRes.json()) as {
      text: string;
      truncated: boolean;
      originalLength: number;
      maxLength: number;
    };
    expect(largeJson.truncated).toBe(true);
    expect(largeJson.text.length).toBeLessThanOrEqual(largeJson.maxLength);
    expect(largeJson.originalLength).toBeGreaterThan(largeJson.maxLength);

    // 5. Clear HTTP 400 errors for unsupported / unreadable files
    const unsupportedRes = await fetch(`${baseUrl}/api/reference-material/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: "diagram.png",
        dataBase64: Buffer.from("not-an-image").toString("base64"),
      }),
    });
    expect(unsupportedRes.status).toBe(400);
    expect(((await unsupportedRes.json()) as { error: string }).error).toMatch(/\.txt.*\.docx.*\.pdf/i);

    const corruptDocxRes = await fetch(`${baseUrl}/api/reference-material/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: "broken.docx",
        dataBase64: Buffer.from("not a zip archive").toString("base64"),
      }),
    });
    expect(corruptDocxRes.status).toBe(400);
    expect(((await corruptDocxRes.json()) as { error: string }).error).toMatch(/\.docx/i);

    const corruptPdfRes = await fetch(`${baseUrl}/api/reference-material/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: "corrupt.pdf",
        dataBase64: Buffer.from("not a pdf").toString("base64"),
      }),
    });
    expect(corruptPdfRes.status).toBe(400);
    expect(((await corruptPdfRes.json()) as { error: string }).error).toMatch(/pdf/i);
  });

  it("grounds HTTP DLL and DLP generation in Classroom Context (2 hrs) and Reference Material while keeping exported .docx Learner Context and Reflections blank", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "guromate-http-ctx-"));
    tempDirs.push(dataDir);
    const capturedPrompts: string[] = [];
    const engine = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
      aiAdapter: {
        async generateText(req) {
          capturedPrompts.push(req.prompt);
          if (req.prompt.includes("Daily Lesson Log (DLL)")) {
            return {
              text: JSON.stringify({
                lessonTitle: "2-Hour Shop Practicum DLL",
                references: "CG",
                sessions: [1, 2, 3, 4, 5].map((n) => ({
                  sessionNumber: n,
                  learningObjectives: `• Obj ${n}`,
                  preLesson: `Pre ${n}`,
                  lessonFlow: `Flow ${n}`,
                  learningResources: `Res ${n}`,
                  integrationAndContextualization: `Int ${n}`,
                  formativeAssessment: `Ass ${n}`,
                  extendedLearningOpportunities: `Ext ${n}`,
                })),
              }),
            };
          }
          return {
            text: JSON.stringify({
              lessonTitle: "2-Hour Shop Practicum DLP",
              references: "CG",
              learningObjectives: "• DLP Obj",
              preLesson: { teacherActivity: "T Pre", studentActivity: "S Pre" },
              lessonFlow: { teacherActivity: "T Flow", studentActivity: "S Flow" },
              learningResources: { teacherActivity: "T Res", studentActivity: "S Res" },
              integrationAndContextualization: { teacherActivity: "T Int", studentActivity: "" },
              formativeAssessment: { teacherActivity: "T Ass", studentActivity: "S Ass" },
              extendedLearningOpportunities: { teacherActivity: "T Ext", studentActivity: "" },
            }),
          };
        },
      },
    });
    const middleware = createGuroMateMiddleware(engine);
    const server = createServer((req, res) => {
      middleware(req, res, () => {
        res.statusCode = 404;
        res.end("Not Found");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    servers.push(server);
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    const ict = (await engine.listCurriculum({ gradeLevel: 7, component: "ICT" }))[0]!;
    const classroomContext = {
      periodMinutes: 120,
      facility: "computer-lab",
      modality: "face-to-face",
    };
    const referenceMaterial = {
      sourceLabel: "DepEd Exemplar.txt",
      text: "Check grounding wrist strap before handling RAM modules.",
    };

    const dllRes = await fetch(`${baseUrl}/api/dlls/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gradeAndSection: "7-Rizal",
        classroomContext,
        referenceMaterial,
        promptNotes: "Use 2 learners per workstation.",
        sessions: [1, 2, 3, 4, 5].map((n) => ({
          sessionNumber: n,
          mode: "instructional",
          competencyIds: [ict.id],
        })),
      }),
    });
    expect(dllRes.status).toBe(201);
    const createdDll = (await dllRes.json()) as {
      id: string;
      classroomContext?: typeof classroomContext;
    };
    expect(createdDll.classroomContext).toEqual(classroomContext);
    expect(capturedPrompts[0]).toContain("120 minutes (2 hrs)");
    expect(capturedPrompts[0]).toContain("Check grounding wrist strap");

    const dlpRes = await fetch(`${baseUrl}/api/dlps/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "derive",
        dllId: createdDll.id,
        sessionNumber: 1,
        promptNotes: "Extra troubleshooting cue.",
      }),
    });
    expect(dlpRes.status).toBe(201);
    const createdDlp = (await dlpRes.json()) as {
      id: string;
      classroomContext?: typeof classroomContext;
    };
    expect(createdDlp.classroomContext).toEqual(classroomContext);
    expect(capturedPrompts[1]).toContain("120 minutes (2 hrs)");
    expect(capturedPrompts[1]).toContain("Check grounding wrist strap");

    const { readZipEntry } = await import("../engine/zip");
    const { extractTableCellTexts } = await import("../engine/dllDocx");

    const dllDocxRes = await fetch(`${baseUrl}/api/dlls/${encodeURIComponent(createdDll.id)}/docx`);
    const dllDocXml = readZipEntry(Buffer.from(await dllDocxRes.arrayBuffer()), "word/document.xml").toString("utf8");
    const dllTables = extractTableCellTexts(dllDocXml);
    expect(dllTables[1]![4]![1]).toBe("");
    for (let col = 1; col <= 5; col++) {
      expect(dllTables[4]![2]![col]).toBe("");
    }
    expect(dllDocXml).not.toContain("Check grounding wrist strap");
    expect(dllDocXml).not.toContain("Use 2 learners per workstation.");

    const dlpDocxRes = await fetch(`${baseUrl}/api/dlps/${encodeURIComponent(createdDlp.id)}/docx`);
    const dlpDocXml = readZipEntry(Buffer.from(await dlpDocxRes.arrayBuffer()), "word/document.xml").toString("utf8");
    const dlpTables = extractTableCellTexts(dlpDocXml);
    expect(dlpTables[1]![3]![1]).toBe("");
    expect(dlpTables[4]![3]![1]).toBe("");
    expect(dlpTables[4]![3]![2]).toBe("");
    expect(dlpDocXml).not.toContain("Check grounding wrist strap");
    expect(dlpDocXml).not.toContain("Extra troubleshooting cue.");
  });
});
