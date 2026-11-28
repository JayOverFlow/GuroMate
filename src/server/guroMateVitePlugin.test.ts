import { createServer, type Server } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createGuroMateEngine } from "../engine/createGuroMateEngine";
import { extractTableCellTexts } from "../engine/dllDocx";
import { readZipEntry } from "../engine/zip";
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

  it("auto-populates DO 003 Annex A Declaration of AI Use with active AI model info, persists per-lesson edits, preserves legacy compatibility, and injects exact Table 0 Row 7 Col 1 XML cells over HTTP", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "guromate-http-do003-"));
    tempDirs.push(dataDir);
    const engine = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
      aiAdapter: {
        async generateText(req) {
          if (req.prompt.includes("Daily Lesson Log (DLL)")) {
            return {
              text: JSON.stringify({
                lessonTitle: "DO 003 HTTP DLL",
                references: "MATATAG TLE 7 CG",
                sessions: [1, 2, 3, 4, 5].map((n) => ({
                  sessionNumber: n,
                  learningObjectives: `• Objective ${n}`,
                  preLesson: `Pre ${n}`,
                  lessonFlow: `Flow ${n}`,
                  learningResources: `• Resource ${n}`,
                  integrationAndContextualization: `Integration ${n}`,
                  formativeAssessment: `Assessment ${n}`,
                  extendedLearningOpportunities: `Extended ${n}`,
                })),
              }),
              model: req.settings.modelId,
            };
          }
          return {
            text: JSON.stringify({
              lessonTitle: "DO 003 HTTP DLP",
              references: "MATATAG TLE 7 CG",
              learningObjectives: "• Identify safe workplace habits.",
              preLesson: { teacherActivity: "T Pre", studentActivity: "S Pre" },
              lessonFlow: { teacherActivity: "T Flow", studentActivity: "S Flow" },
              learningResources: { teacherActivity: "T Res", studentActivity: "S Res" },
              integrationAndContextualization: { teacherActivity: "T Int", studentActivity: "" },
              formativeAssessment: { teacherActivity: "T Ass", studentActivity: "S Ass" },
              extendedLearningOpportunities: { teacherActivity: "T Ext", studentActivity: "" },
            }),
            model: req.settings.modelId,
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

    // Configure active OpenRouter provider & model via HTTP
    const settingsRes = await fetch(`${baseUrl}/api/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ai: {
          aiProvider: "openrouter",
          apiKey: "or-key",
          baseUrl: "https://openrouter.ai/api/v1",
          modelId: "google/gemini-2.5-flash",
        },
      }),
    });
    expect(settingsRes.status).toBe(200);

    const ict = (await engine.listCurriculum({ gradeLevel: 7, component: "ICT" }))[0]!;

    // 1. Generate DLL and verify auto-populated DO 003 Annex A declaration + .docx XML cell
    const dllGenRes = await fetch(`${baseUrl}/api/dlls/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gradeAndSection: "Grade 7 - Rizal",
        sessions: [1, 2, 3, 4, 5].map((n) => ({
          sessionNumber: n,
          mode: "instructional",
          competencyIds: [ict.id],
        })),
      }),
    });
    expect(dllGenRes.status).toBe(201);
    const createdDll = (await dllGenRes.json()) as {
      id: string;
      aiDeclaration?: string;
    };
    expect(createdDll.aiDeclaration).toMatch(/DepEd Order No\.\s*003,\s*s\.\s*2026/i);
    expect(createdDll.aiDeclaration).toMatch(/Annex A/i);
    expect(createdDll.aiDeclaration).toContain("OpenRouter (google/gemini-2.5-flash)");
    expect(createdDll.aiDeclaration).toMatch(/auxiliary/i);
    expect(createdDll.aiDeclaration).toMatch(/review|validat/i);
    expect(createdDll.aiDeclaration).toMatch(/no confidential learner/i);

    const dllAutoDocxRes = await fetch(
      `${baseUrl}/api/dlls/${encodeURIComponent(createdDll.id)}/docx`,
    );
    expect(dllAutoDocxRes.status).toBe(200);
    const dllAutoTables = extractTableCellTexts(
      readZipEntry(
        Buffer.from(await dllAutoDocxRes.arrayBuffer()),
        "word/document.xml",
      ).toString("utf8"),
    );
    expect(dllAutoTables[0]![7]![1]).toBe(createdDll.aiDeclaration);

    // 2. Edit per-lesson DLL declaration via PUT and verify updated .docx Table 0 Row 7 Col 1
    const editedDllDecl =
      "Declaration of AI Use (DO 003, s. 2026 Annex A): Edited DLL declaration citing OpenRouter (google/gemini-2.5-flash); teacher-validated with no learner PII.";
    const dllPutRes = await fetch(
      `${baseUrl}/api/dlls/${encodeURIComponent(createdDll.id)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...createdDll,
          aiDeclaration: editedDllDecl,
        }),
      },
    );
    expect(dllPutRes.status).toBe(200);
    const updatedDll = (await dllPutRes.json()) as { aiDeclaration?: string };
    expect(updatedDll.aiDeclaration).toBe(editedDllDecl);

    const dllEditedDocxRes = await fetch(
      `${baseUrl}/api/dlls/${encodeURIComponent(createdDll.id)}/docx`,
    );
    const dllEditedTables = extractTableCellTexts(
      readZipEntry(
        Buffer.from(await dllEditedDocxRes.arrayBuffer()),
        "word/document.xml",
      ).toString("utf8"),
    );
    expect(dllEditedTables[0]![7]![1]).toBe(editedDllDecl);

    // 3. Generate DLP, verify auto-populated DO 003 Annex A declaration, edit via PUT, verify .docx cell
    const dlpGenRes = await fetch(`${baseUrl}/api/dlps/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "scratch",
        gradeAndSection: "Grade 7 - Rizal",
        competencyIds: [ict.id],
      }),
    });
    expect(dlpGenRes.status).toBe(201);
    const createdDlp = (await dlpGenRes.json()) as {
      id: string;
      aiDeclaration?: string;
    };
    expect(createdDlp.aiDeclaration).toMatch(/DepEd Order No\.\s*003,\s*s\.\s*2026/i);
    expect(createdDlp.aiDeclaration).toContain("OpenRouter (google/gemini-2.5-flash)");

    const editedDlpDecl =
      "Declaration of AI Use (DO 003, s. 2026 Annex A): Edited DLP declaration citing OpenRouter (google/gemini-2.5-flash); teacher-validated with no learner PII.";
    const dlpPutRes = await fetch(
      `${baseUrl}/api/dlps/${encodeURIComponent(createdDlp.id)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...createdDlp,
          aiDeclaration: editedDlpDecl,
        }),
      },
    );
    expect(dlpPutRes.status).toBe(200);
    expect(await dlpPutRes.json()).toMatchObject({ aiDeclaration: editedDlpDecl });

    const dlpEditedDocxRes = await fetch(
      `${baseUrl}/api/dlps/${encodeURIComponent(createdDlp.id)}/docx`,
    );
    const dlpEditedTables = extractTableCellTexts(
      readZipEntry(
        Buffer.from(await dlpEditedDocxRes.arrayBuffer()),
        "word/document.xml",
      ).toString("utf8"),
    );
    expect(dlpEditedTables[0]![7]![1]).toBe(editedDlpDecl);

    // 4. Backward compatibility: legacy saved DLL & DLP lacking aiDeclaration + legacy settings.json fallback
    const legacyDll = { ...createdDll, id: "dll-legacy-http" };
    delete legacyDll.aiDeclaration;
    const legacyDlp = { ...createdDlp, id: "dlp-legacy-http" };
    delete legacyDlp.aiDeclaration;
    await writeFile(
      path.join(dataDir, "dlls.json"),
      JSON.stringify([legacyDll], null, 2),
      "utf8",
    );
    await writeFile(
      path.join(dataDir, "dlps.json"),
      JSON.stringify([legacyDlp], null, 2),
      "utf8",
    );
    await writeFile(
      path.join(dataDir, "settings.json"),
      JSON.stringify(
        {
          profile: {
            studentTeacherName: "LEGACY USER",
            aiDeclaration:
              "This lesson plan was developed using AI and subsequently reviewed for accuracy and alignment with curriculum standards.",
          },
          ai: {
            aiProvider: "openrouter",
            apiKey: "or-key",
            baseUrl: "https://openrouter.ai/api/v1",
            modelId: "google/gemini-2.5-flash",
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const legacyDllDocxRes = await fetch(`${baseUrl}/api/dlls/dll-legacy-http/docx`);
    expect(legacyDllDocxRes.status).toBe(200);
    const legacyDllTables = extractTableCellTexts(
      readZipEntry(
        Buffer.from(await legacyDllDocxRes.arrayBuffer()),
        "word/document.xml",
      ).toString("utf8"),
    );
    expect(legacyDllTables[0]![7]![1]).toMatch(/DepEd Order No\.\s*003,\s*s\.\s*2026/i);
    expect(legacyDllTables[0]![7]![1]).toContain("OpenRouter (google/gemini-2.5-flash)");
    expect(legacyDllTables[0]![7]![1]).not.toContain("{aiTool}");

    const legacyDlpDocxRes = await fetch(`${baseUrl}/api/dlps/dlp-legacy-http/docx`);
    expect(legacyDlpDocxRes.status).toBe(200);
    const legacyDlpTables = extractTableCellTexts(
      readZipEntry(
        Buffer.from(await legacyDlpDocxRes.arrayBuffer()),
        "word/document.xml",
      ).toString("utf8"),
    );
    expect(legacyDlpTables[0]![7]![1]).toMatch(/DepEd Order No\.\s*003,\s*s\.\s*2026/i);
    expect(legacyDlpTables[0]![7]![1]).toContain("OpenRouter (google/gemini-2.5-flash)");
    expect(legacyDlpTables[0]![7]![1]).not.toContain("{aiTool}");
  });

  it("serves two-step DLL planning (POST /api/dlls/plan -> editable Lesson Blueprint -> POST /api/dlls/generate with locked teacher choices -> .docx export)", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "guromate-http-dll-plan-"));
    tempDirs.push(dataDir);
    const seenPrompts: string[] = [];

    const engine = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
      aiAdapter: {
        async generateText(req) {
          seenPrompts.push(req.prompt);
          if (req.prompt.includes("Create an editable 5-Session Lesson Blueprint")) {
            return {
              text: JSON.stringify({
                lessonTitle: "HTTP Planned ICT Week",
                references: "MATATAG TLE 7 ICT CG",
                sessions: [1, 2, 3, 4].map((n) => ({
                  sessionNumber: n,
                  progressionFocus: `Session ${n} progressive focus`,
                  learningObjectives: `• Explain ICT concept ${n}.\n• Perform ICT task ${n}.\n• Value safe ICT habits ${n}.`,
                  activityOptions: [
                    {
                      id: `http-s${n}-a`,
                      title: `BoW Activity ${n}`,
                      summary: `Adapted BoW task ${n}.`,
                      source: "bow",
                      recommended: true,
                    },
                    {
                      id: `http-s${n}-b`,
                      title: `Hands-On Lab Relay ${n}`,
                      summary: `Collaborative workstation relay ${n}.`,
                      source: "authentic",
                      recommended: false,
                    },
                  ],
                  assessmentOptions: [
                    {
                      type: "exit-ticket",
                      preview: `Exit slip for session ${n}.`,
                      recommended: true,
                    },
                    {
                      type: "checklist",
                      preview: `Skill checklist for session ${n}.`,
                      recommended: false,
                    },
                    {
                      type: "demo-rubric",
                      preview: `Demo rubric for session ${n}.`,
                      recommended: false,
                    },
                    {
                      type: "worksheet",
                      preview: `Worksheet for session ${n}.`,
                      recommended: false,
                    },
                    {
                      type: "short-quiz",
                      preview: `Short quiz for session ${n}.`,
                      recommended: false,
                    },
                  ],
                })),
              }),
              model: "mock-http-model",
            };
          }

          return {
            text: JSON.stringify({
              lessonTitle: "Ignored AI Title",
              references: "MATATAG TLE 7 ICT CG",
              sessions: [1, 2, 3, 4].map((n) => ({
                sessionNumber: n,
                learningObjectives: `• AI draft objective ${n}`,
                preLesson: `Pre-lesson activity: “Ready ${n}” Check well-being and share objectives.`,
                lessonFlow: `Hands-On Lab Relay ${n}: Modeled demo followed by collaborative lab stations.`,
                learningResources: "• Lab PCs\n• Emergency/offline backup: Printed cue cards & whiteboard",
                integrationAndContextualization: "Link to barangay digital services.",
                formativeAssessment: `Observation / Skill Checklist: Monitor session ${n} with help cards and oral/visual accommodations.`,
                extendedLearningOpportunities: `Community observation log ${n}.`,
              })),
            }),
            model: "mock-http-model",
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

    // Invalid plan payload returns 400
    const badPlanRes = await fetch(`${baseUrl}/api/dlls/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gradeAndSection: "", sessions: [] }),
    });
    expect(badPlanRes.status).toBe(400);

    const ict = (await engine.listCurriculum({ gradeLevel: 7, component: "ICT" }))[0]!;
    const sessions = [
      { sessionNumber: 1, mode: "instructional", competencyIds: [ict.id] },
      { sessionNumber: 2, mode: "instructional", competencyIds: [ict.id] },
      { sessionNumber: 3, mode: "instructional", competencyIds: [ict.id] },
      { sessionNumber: 4, mode: "instructional", competencyIds: [ict.id] },
      {
        sessionNumber: 5,
        mode: "non-instructional",
        competencyIds: [],
        nonInstructionalReason: "Division Seminar",
      },
    ];

    // Step 1: Plan Lesson
    const planRes = await fetch(`${baseUrl}/api/dlls/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gradeAndSection: "Grade 7 - Mabini",
        classroomContext: {
          periodMinutes: 60,
          facility: "computer-lab",
          modality: "face-to-face",
        },
        sessions,
      }),
    });
    expect(planRes.status).toBe(200);
    const blueprint = (await planRes.json()) as {
      lessonTitle: string;
      references: string;
      sessions: Array<{
        sessionNumber: number;
        mode: string;
        nonInstructionalReason?: string;
        progressionFocus: string;
        learningObjectives: string;
        activityOptions: Array<{ id: string; title: string; summary: string; recommended: boolean }>;
        selectedActivityId: string;
        assessmentOptions: Array<{ type: string; label: string; preview: string; recommended: boolean }>;
        selectedAssessmentType?: string;
      }>;
    };

    expect(blueprint.lessonTitle).toBe("HTTP Planned ICT Week");
    expect(blueprint.sessions).toHaveLength(5);
    expect(blueprint.sessions[0]!.selectedActivityId).toBe("http-s1-a");
    expect(blueprint.sessions[0]!.selectedAssessmentType).toBe("exit-ticket");
    expect(blueprint.sessions[0]!.assessmentOptions).toHaveLength(5);
    expect(blueprint.sessions[4]!.mode).toBe("non-instructional");
    expect(blueprint.sessions[4]!.nonInstructionalReason).toBe("Division Seminar");

    // Step 2: Teacher tweaks Session 1 objectives, switches activity & assessment, and Approves & Generates DLL
    const teacherEditedObjectives = [
      "• Classify three ICT productivity tools accurately.",
      "• Execute workstation setup steps safely with a partner.",
      "• Demonstrate cooperative problem-solving during lab work.",
    ].join("\n");

    const approvedBlueprint = {
      ...blueprint,
      lessonTitle: "Approved HTTP ICT DLL",
      sessions: blueprint.sessions.map((s) =>
        s.sessionNumber === 1
          ? {
              ...s,
              learningObjectives: teacherEditedObjectives,
              selectedActivityId: "http-s1-b",
              selectedAssessmentType: "checklist",
            }
          : s,
      ),
    };

    const genRes = await fetch(`${baseUrl}/api/dlls/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gradeAndSection: "Grade 7 - Mabini",
        classroomContext: {
          periodMinutes: 60,
          facility: "computer-lab",
          modality: "face-to-face",
        },
        sessions,
        blueprint: approvedBlueprint,
      }),
    });
    expect(genRes.status).toBe(201);
    const created = (await genRes.json()) as {
      id: string;
      lessonTitle: string;
      sessions: Array<{
        sessionNumber: number;
        learningObjectives: string;
        selectedActivityTitle?: string;
        selectedAssessmentType?: string;
      }>;
    };

    expect(seenPrompts).toHaveLength(2);
    expect(seenPrompts[1]).toContain("Approved Lesson Blueprint");
    expect(seenPrompts[1]).toContain("Hands-On Lab Relay 1");
    expect(seenPrompts[1]).toContain("Observation / Skill Checklist");

    expect(created.lessonTitle).toBe("Approved HTTP ICT DLL");
    expect(created.sessions[0]!.learningObjectives).toBe(teacherEditedObjectives);
    expect(created.sessions[0]!.selectedActivityTitle).toBe("Hands-On Lab Relay 1");
    expect(created.sessions[0]!.selectedAssessmentType).toBe("checklist");

    // Verify persistence via GET /api/dlls/:id and valid .docx export
    const fetchedRes = await fetch(`${baseUrl}/api/dlls/${encodeURIComponent(created.id)}`);
    expect(fetchedRes.status).toBe(200);
    const fetched = (await fetchedRes.json()) as typeof created;
    expect(fetched.sessions[0]!.selectedActivityTitle).toBe("Hands-On Lab Relay 1");
    expect(fetched.sessions[0]!.selectedAssessmentType).toBe("checklist");

    const docxRes = await fetch(`${baseUrl}/api/dlls/${encodeURIComponent(created.id)}/docx`);
    expect(docxRes.status).toBe(200);
    const docXml = readZipEntry(
      Buffer.from(await docxRes.arrayBuffer()),
      "word/document.xml",
    ).toString("utf8");
    expect(docXml).toContain("Approved HTTP ICT DLL");
    expect(docXml).toContain("Execute workstation setup steps safely with a partner.");
    const tables = extractTableCellTexts(docXml);
    expect(tables[1]![4]![1]).toBe("");
    for (let col = 1; col <= 5; col++) {
      expect(tables[4]![2]![col]).toBe("");
    }
  });

  it("serves two-step DLP planning (POST /api/dlps/plan -> editable Lesson Blueprint -> POST /api/dlps/generate) in both scratch and derive modes with strict DLL->DLP locking, 2-hour pacing, persistence, and .docx export", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "guromate-http-dlp-plan-"));
    tempDirs.push(dataDir);
    const seenPrompts: string[] = [];

    const engine = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
      aiAdapter: {
        async generateText(req) {
          seenPrompts.push(req.prompt);
          if (req.prompt.includes("Create an editable 5-Session Lesson Blueprint")) {
            return {
              text: JSON.stringify({
                lessonTitle: "HTTP Parent ICT Lab Week",
                references: "MATATAG TLE 7 ICT CG",
                sessions: [1, 2, 3, 4, 5].map((n) => ({
                  sessionNumber: n,
                  progressionFocus: `Parent stage ${n}`,
                  learningObjectives: [
                    `• Explain parent ICT principle ${n}.`,
                    `• Demonstrate parent lab procedure ${n} safely.`,
                    `• Practice responsible teamwork ${n}.`,
                  ].join("\n"),
                  activityOptions: [
                    {
                      id: `p-s${n}-a`,
                      title: `Parent Shop Station ${n}`,
                      summary: `Guided hands-on station for Session ${n}.`,
                      source: "bow",
                      recommended: true,
                    },
                    {
                      id: `p-s${n}-b`,
                      title: `Parent Alt Activity ${n}`,
                      summary: `Alternative activity ${n}.`,
                      source: "authentic",
                      recommended: false,
                    },
                  ],
                  assessmentOptions: [
                    {
                      type: "demo-rubric",
                      preview: `3-criterion lab rubric for Session ${n}.`,
                      recommended: true,
                    },
                    {
                      type: "exit-ticket",
                      preview: `Exit slip ${n}.`,
                      recommended: false,
                    },
                  ],
                })),
              }),
              model: "mock-http-dlp-model",
            };
          }
          if (req.prompt.includes("Daily Lesson Log (DLL)")) {
            return {
              text: JSON.stringify({
                lessonTitle: "HTTP Parent ICT Lab Week",
                references: "MATATAG TLE 7 ICT CG",
                sessions: [1, 2, 3, 4, 5].map((n) => ({
                  sessionNumber: n,
                  learningObjectives: `• AI parent obj ${n}`,
                  preLesson: `Pre ${n}`,
                  lessonFlow: `Parent Shop Station ${n}: Guided demo and paired lab.`,
                  learningResources: `• Multimeter and breadboard\n• Emergency/offline backup: Printed circuit cards`,
                  integrationAndContextualization: `Barangay electronics shop link ${n}.`,
                  formativeAssessment: `Performance / Demo Rubric: Score Session ${n} with help cards and accommodations.`,
                  extendedLearningOpportunities: `Home safety checklist ${n}.`,
                })),
              }),
              model: "mock-http-dlp-model",
            };
          }
          if (req.prompt.includes("single-session Lesson Blueprint")) {
            return {
              text: JSON.stringify({
                lessonTitle: "HTTP Planned 2-Hour DLP",
                references: "MATATAG TLE 7 ICT CG",
                progressionFocus: "Single-session 2-hour demonstration teaching",
                learningObjectives:
                  "• Cognitive: Identify key hardware tools accurately.\n• Psychomotor: Assemble the test setup observing OHS/PPE.\n• Affective: Value safe tool handling with classmates.",
                activityOptions: [
                  {
                    id: "http-dlp-a",
                    title: "Guided Tool Identification Walk",
                    summary: "Pairs inspect labeled tools and safety cards.",
                    source: "bow",
                    recommended: true,
                  },
                  {
                    id: "http-dlp-b",
                    title: "Hands-On Bench Assembly Relay",
                    summary: "Pairs execute step-by-step bench assembly with OHS checks.",
                    source: "authentic",
                    recommended: false,
                  },
                ],
                assessmentOptions: [
                  {
                    type: "checklist",
                    preview: "Observation checklist verifying OHS steps and accuracy.",
                    recommended: true,
                  },
                  {
                    type: "worksheet",
                    preview: "Structured troubleshooting worksheet with key.",
                    recommended: false,
                  },
                ],
              }),
              model: "mock-http-dlp-model",
            };
          }
          return {
            text: JSON.stringify({
              lessonTitle: "Ignored AI DLP Title",
              references: "MATATAG TLE 7 ICT CG",
              learningObjectives: "• Ignored AI objective",
              preLesson: {
                teacherActivity: "(15 min) Opening routine, well-being check, hook, and verbatim objectives.",
                studentActivity: "(15 min) Join routine, check-in, and read objectives aloud.",
              },
              lessonFlow: {
                teacherActivity: "(85 min) Present key points (20 min); guide questions; OHS/PPE demo and hands-on lab (55 min); synthesis (10 min).",
                studentActivity: "(85 min) Answer guide questions, wear PPE, execute lab steps, and share takeaways.",
              },
              learningResources: {
                teacherActivity: "• Multimeter, slides\n• Emergency/offline backup: Printed circuit diagrams",
                studentActivity: "• Breadboard, worksheet\n• Emergency/offline backup: Paper schematic cards",
              },
              integrationAndContextualization: {
                teacherActivity: "Connect to local barangay repair technicians.",
                studentActivity: "",
              },
              formativeAssessment: {
                teacherActivity: "(20 min) Ready-to-use rubric/worksheet items with Answer Key, help-seeking cards, and visual/oral accommodations.",
                studentActivity: "(20 min) Complete assessment and raise help cards when needed.",
              },
              extendedLearningOpportunities: {
                teacherActivity: "Audit home extension cords for OHS compliance.",
                studentActivity: "",
              },
            }),
            model: "mock-http-dlp-model",
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

    // Invalid plan payload returns 400
    const badPlanRes = await fetch(`${baseUrl}/api/dlps/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "scratch", gradeAndSection: "", competencyIds: [] }),
    });
    expect(badPlanRes.status).toBe(400);

    const ict = (await engine.listCurriculum({ gradeLevel: 7, component: "ICT" }))[0]!;
    const twoHourContext = {
      periodMinutes: 120,
      facility: "shop-workshop",
      modality: "face-to-face",
    };

    // 1. Scratch two-step flow over HTTP
    const scratchPlanRes = await fetch(`${baseUrl}/api/dlps/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "scratch",
        gradeAndSection: "Grade 7 - Rizal",
        classroomContext: twoHourContext,
        referenceMaterial: {
          sourceLabel: "TESDA OHS Guide.txt",
          text: "Always disconnect power and wear insulated gloves before continuity testing.",
        },
        competencyIds: [ict.id],
      }),
    });
    expect(scratchPlanRes.status).toBe(200);
    const scratchBp = (await scratchPlanRes.json()) as {
      mode: string;
      lessonTitle: string;
      learningObjectives: string;
      activityOptions: Array<{ id: string; title: string; recommended: boolean }>;
      selectedActivityId: string;
      assessmentOptions: Array<{ type: string; label: string; preview: string; recommended: boolean }>;
      selectedAssessmentType: string;
    };
    expect(scratchBp.mode).toBe("scratch");
    expect(scratchBp.selectedActivityId).toBe("http-dlp-a");
    expect(scratchBp.selectedAssessmentType).toBe("checklist");
    expect(scratchBp.assessmentOptions).toHaveLength(5);

    const editedScratchObjectives = [
      "• Identify four circuit testing tools accurately.",
      "• Assemble and test a safe bench setup following OHS/PPE rules.",
      "• Value cooperative lab safety with teammates.",
    ].join("\n");
    const approvedScratchBp = {
      ...scratchBp,
      lessonTitle: "Approved HTTP 2-Hour Bench DLP",
      learningObjectives: editedScratchObjectives,
      selectedActivityId: "http-dlp-b",
      selectedAssessmentType: "worksheet",
    };

    const scratchGenRes = await fetch(`${baseUrl}/api/dlps/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "scratch",
        gradeAndSection: "Grade 7 - Rizal",
        classroomContext: twoHourContext,
        competencyIds: [ict.id],
        blueprint: approvedScratchBp,
      }),
    });
    expect(scratchGenRes.status).toBe(201);
    const createdScratch = (await scratchGenRes.json()) as {
      id: string;
      lessonTitle: string;
      selectedActivityTitle?: string;
      selectedAssessmentType?: string;
      classroomContext?: { periodMinutes: number };
      intentions: { learningObjectives: string };
    };
    expect(createdScratch.lessonTitle).toBe("Approved HTTP 2-Hour Bench DLP");
    expect(createdScratch.intentions.learningObjectives).toBe(editedScratchObjectives);
    expect(createdScratch.selectedActivityTitle).toBe("Hands-On Bench Assembly Relay");
    expect(createdScratch.selectedAssessmentType).toBe("worksheet");
    expect(createdScratch.classroomContext?.periodMinutes).toBe(120);

    // 2. Derive two-step flow over HTTP with strict parent DLL Session locking
    const dllSessions = [1, 2, 3, 4, 5].map((n) => ({
      sessionNumber: n,
      mode: "instructional",
      competencyIds: [ict.id],
    }));
    const dllPlanRes = await fetch(`${baseUrl}/api/dlls/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gradeAndSection: "Grade 7 - Bonifacio",
        classroomContext: twoHourContext,
        sessions: dllSessions,
      }),
    });
    const dllBp = await dllPlanRes.json();
    const dllGenRes = await fetch(`${baseUrl}/api/dlls/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gradeAndSection: "Grade 7 - Bonifacio",
        classroomContext: twoHourContext,
        sessions: dllSessions,
        blueprint: dllBp,
      }),
    });
    expect(dllGenRes.status).toBe(201);
    const parentDll = (await dllGenRes.json()) as {
      id: string;
      sessions: Array<{
        sessionNumber: number;
        learningObjectives: string;
        selectedActivityTitle?: string;
        selectedAssessmentType?: string;
      }>;
    };
    const parentSession3 = parentDll.sessions[2]!;

    const derivePlanRes = await fetch(`${baseUrl}/api/dlps/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "derive",
        dllId: parentDll.id,
        sessionNumber: 3,
      }),
    });
    expect(derivePlanRes.status).toBe(200);
    const deriveBp = (await derivePlanRes.json()) as {
      mode: string;
      sourceDllId?: string;
      sourceSessionNumber?: number;
      lockedToParentSession?: boolean;
      learningObjectives: string;
      activityOptions: Array<{ id: string; title: string; recommended: boolean }>;
      selectedActivityId: string;
      selectedAssessmentType: string;
      inheritedLearningResources?: string;
    };
    expect(deriveBp.mode).toBe("derive");
    expect(deriveBp.sourceDllId).toBe(parentDll.id);
    expect(deriveBp.sourceSessionNumber).toBe(3);
    expect(deriveBp.lockedToParentSession).toBe(true);
    expect(deriveBp.learningObjectives).toBe(parentSession3.learningObjectives);
    expect(
      deriveBp.activityOptions.find((a) => a.id === deriveBp.selectedActivityId)?.title,
    ).toBe("Parent Shop Station 3");
    expect(deriveBp.selectedAssessmentType).toBe("demo-rubric");
    expect(deriveBp.inheritedLearningResources).toContain("Multimeter and breadboard");

    const deriveGenRes = await fetch(`${baseUrl}/api/dlps/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "derive",
        dllId: parentDll.id,
        sessionNumber: 3,
        blueprint: {
          ...deriveBp,
          lessonTitle: "Derived Session 3 2-Hour DLP",
          selectedAssessmentType: "short-quiz", // must be overridden by strict parent lock
        },
      }),
    });
    expect(deriveGenRes.status).toBe(201);
    const createdDerived = (await deriveGenRes.json()) as {
      id: string;
      sourceDllId?: string;
      sourceSessionNumber?: number;
      lessonTitle: string;
      selectedActivityTitle?: string;
      selectedAssessmentType?: string;
      classroomContext?: { periodMinutes: number };
      intentions: { learningObjectives: string };
    };
    expect(createdDerived.sourceDllId).toBe(parentDll.id);
    expect(createdDerived.sourceSessionNumber).toBe(3);
    expect(createdDerived.lessonTitle).toBe("Derived Session 3 2-Hour DLP");
    expect(createdDerived.intentions.learningObjectives).toBe(
      parentSession3.learningObjectives,
    );
    expect(createdDerived.selectedActivityTitle).toBe("Parent Shop Station 3");
    expect(createdDerived.selectedAssessmentType).toBe("demo-rubric");
    expect(createdDerived.classroomContext?.periodMinutes).toBe(120);

    // Persistence via GET /api/dlps/:id and paired .docx export with blank Learner Context & Reflections
    const getDerivedRes = await fetch(
      `${baseUrl}/api/dlps/${encodeURIComponent(createdDerived.id)}`,
    );
    expect(getDerivedRes.status).toBe(200);
    expect(await getDerivedRes.json()).toMatchObject({
      id: createdDerived.id,
      selectedActivityTitle: "Parent Shop Station 3",
      selectedAssessmentType: "demo-rubric",
    });

    const docxRes = await fetch(
      `${baseUrl}/api/dlps/${encodeURIComponent(createdDerived.id)}/docx`,
    );
    expect(docxRes.status).toBe(200);
    const docXml = readZipEntry(
      Buffer.from(await docxRes.arrayBuffer()),
      "word/document.xml",
    ).toString("utf8");
    const tables = extractTableCellTexts(docXml);
    expect(tables[0]![0]![1]).toBe("Derived Session 3 2-Hour DLP");
    expect(tables[1]![2]![1]).toContain("Demonstrate parent lab procedure 3 safely.");
    expect(tables[1]![3]![1]).toBe("");
    expect(tables[4]![3]![1]).toBe("");
    expect(tables[4]![3]![2]).toBe("");
    expect(seenPrompts.at(-1)).toContain("120 minutes");
    expect(seenPrompts.at(-1)).toContain("Multimeter and breadboard");
  });

  it("enforces deterministic DO 016 Alignment Check, single auto-repair guardrail, non-blocking .docx export, and live refresh on PUT over HTTP", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "guromate-http-align-"));
    tempDirs.push(dataDir);

    let scenario: "dll-compliant" | "dll-repair-soft" | "dlp-malformed-mismatch" =
      "dll-compliant";
    let callCount = 0;

    const compliantDllSession = (n: number, omitSoft = false) => ({
      sessionNumber: n,
      learningObjectives: [
        `• Explain ICT safety standard ${n} accurately.`,
        `• Perform guided tool setup ${n} observing OHS/PPE.`,
        `• Practice respectful peer teamwork ${n}.`,
      ].join("\n"),
      preLesson: `Pre-lesson activity: “Safety Pulse ${n}” — Well-being check and objectives.`,
      lessonFlow: `Shop Station ${n}: Teacher demo followed by collaborative hands-on practice.`,
      learningResources: omitSoft
        ? "• Projector and slides"
        : "• Projector and slides\n• Emergency/offline backup: Printed visual cards and chalkboard",
      integrationAndContextualization: `Barangay ICT shop link ${n}.`,
      formativeAssessment: omitSoft
        ? `Short quiz for session ${n}.`
        : `Observation / Skill Checklist for session ${n}. Learners raise help cards for teacher feedback. Accommodations: oral explanation and small-group option.`,
      extendedLearningOpportunities: `Inspect safe cables at home for session ${n}.`,
    });

    const engine = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
      aiAdapter: {
        async generateText() {
          callCount += 1;
          if (scenario === "dll-compliant") {
            return {
              text: JSON.stringify({
                lessonTitle: "Compliant HTTP DLL",
                references: "MATATAG TLE 7 ICT CG",
                sessions: [1, 2, 3, 4, 5].map((n) => compliantDllSession(n)),
              }),
              model: "mock-align-model",
            };
          }
          if (scenario === "dll-repair-soft") {
            if (callCount === 1) {
              // Missing required Lesson Flow on Session 2 -> triggers 1 repair retry
              return {
                text: JSON.stringify({
                  lessonTitle: "Repaired HTTP DLL",
                  references: "MATATAG TLE 7 ICT CG",
                  sessions: [1, 2, 3, 4, 5].map((n) =>
                    n === 2
                      ? { ...compliantDllSession(n), lessonFlow: "" }
                      : compliantDllSession(n),
                  ),
                }),
                model: "mock-align-model",
              };
            }
            // Repair fills Lesson Flow, but leaves soft warnings on Session 2 (no emergency backup, no accommodations)
            return {
              text: JSON.stringify({
                lessonTitle: "Repaired HTTP DLL",
                references: "MATATAG TLE 7 ICT CG",
                sessions: [1, 2, 3, 4, 5].map((n) =>
                  compliantDllSession(n, n === 2),
                ),
              }),
              model: "mock-align-model",
            };
          }
          // dlp-malformed-mismatch: 1st call malformed JSON -> 1 repair retry -> leaves period mismatch + missing emergency backup & accommodations
          if (callCount === 1) {
            return { text: "broken-json", model: "mock-align-model" };
          }
          return {
            text: JSON.stringify({
              lessonTitle: "Repaired HTTP DLP",
              references: "MATATAG TLE 7 ICT CG",
              learningObjectives: [
                "• Explain ICT safety standard 1 accurately.",
                "• Perform guided tool setup 1 observing OHS/PPE.",
                "• Practice respectful peer teamwork 1.",
              ].join("\n"),
              preLesson: {
                teacherActivity: "(10 min) Greeting, prayer, attendance, well-being check, hook, and objectives.",
                studentActivity: "(10 min) Join opening routine and read objectives.",
              },
              lessonFlow: {
                teacherActivity: "(30 min) Model tool setup and supervise paired station.",
                studentActivity: "(30 min) Execute tool setup steps in pairs.",
              },
              learningResources: {
                teacherActivity: "• Projector and slides",
                studentActivity: "• Laptop",
              },
              integrationAndContextualization: {
                teacherActivity: "Link to barangay repair technicians.",
                studentActivity: "",
              },
              formativeAssessment: {
                teacherActivity: "(10 min) Short quiz without accommodations.",
                studentActivity: "(10 min) Answer quiz.",
              },
              extendedLearningOpportunities: {
                teacherActivity: "Inspect home cords for safety.",
                studentActivity: "",
              },
            }),
            model: "mock-align-model",
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
    const dllSessions = [1, 2, 3, 4, 5].map((n) => ({
      sessionNumber: n,
      mode: "instructional",
      competencyIds: [ict.id],
    }));

    // 1. Compliant DLL -> zero extra AI calls (callCount === 1)
    scenario = "dll-compliant";
    callCount = 0;
    const compliantRes = await fetch(`${baseUrl}/api/dlls/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gradeAndSection: "Grade 7 - Rizal",
        sessions: dllSessions,
      }),
    });
    expect(compliantRes.status).toBe(201);
    const compliantDll = (await compliantRes.json()) as {
      id: string;
      alignmentCheck?: { passed: boolean; structuralValid: boolean; autoRepaired: boolean };
    };
    expect(callCount).toBe(1);
    expect(compliantDll.alignmentCheck).toMatchObject({
      passed: true,
      structuralValid: true,
      autoRepaired: false,
    });

    // 2. DLL missing required field -> exactly 1 repair retry -> soft warnings persisted -> PUT refreshes -> .docx exports cleanly
    scenario = "dll-repair-soft";
    callCount = 0;
    const repairedDllRes = await fetch(`${baseUrl}/api/dlls/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gradeAndSection: "Grade 7 - Rizal",
        sessions: dllSessions,
      }),
    });
    expect(repairedDllRes.status).toBe(201);
    const repairedDll = (await repairedDllRes.json()) as {
      id: string;
      sessions: Array<Record<string, unknown>>;
      alignmentCheck?: {
        passed: boolean;
        structuralValid: boolean;
        autoRepaired: boolean;
        items: Array<{ code: string; severity: string; message: string }>;
      };
    };
    expect(callCount).toBe(2);
    expect(repairedDll.alignmentCheck?.structuralValid).toBe(true);
    expect(repairedDll.alignmentCheck?.passed).toBe(false);
    expect(repairedDll.alignmentCheck?.autoRepaired).toBe(true);
    expect(
      repairedDll.alignmentCheck?.items.some(
        (i) => i.code === "emergency-resources" && i.severity === "warning",
      ),
    ).toBe(true);
    expect(
      repairedDll.alignmentCheck?.items.some(
        (i) => i.code === "formative-support" && i.severity === "warning",
      ),
    ).toBe(true);

    // Export still works even with soft warnings
    const dllDocxRes = await fetch(
      `${baseUrl}/api/dlls/${encodeURIComponent(repairedDll.id)}/docx`,
    );
    expect(dllDocxRes.status).toBe(200);

    // PUT /api/dlls/:id refreshes alignmentCheck live when teacher fixes warnings
    const fixedSessions = repairedDll.sessions.map((s, idx) =>
      idx === 1
        ? {
            ...s,
            learningResources:
              "• Projector\n• Emergency/offline backup: Printed visual cards",
            formativeAssessment:
              "Observation checklist with help cards for teacher feedback and visual/oral accommodations.",
          }
        : s,
    );
    const putDllRes = await fetch(
      `${baseUrl}/api/dlls/${encodeURIComponent(repairedDll.id)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...repairedDll, sessions: fixedSessions }),
      },
    );
    expect(putDllRes.status).toBe(200);
    const updatedDll = (await putDllRes.json()) as {
      alignmentCheck?: { passed: boolean; structuralValid: boolean };
    };
    expect(updatedDll.alignmentCheck?.passed).toBe(true);
    expect(updatedDll.alignmentCheck?.structuralValid).toBe(true);

    // 3. DLP malformed JSON -> exactly 1 repair retry -> period mismatch (50 vs 60) + missing backup/accommodations -> PUT fixes all -> .docx exports
    scenario = "dlp-malformed-mismatch";
    callCount = 0;
    const dlpGenRes = await fetch(`${baseUrl}/api/dlps/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "scratch",
        gradeAndSection: "Grade 7 - Rizal",
        classroomContext: {
          periodMinutes: 60,
          facility: "computer-lab",
          modality: "face-to-face",
        },
        competencyIds: [ict.id],
      }),
    });
    expect(dlpGenRes.status).toBe(201);
    const createdDlp = (await dlpGenRes.json()) as {
      id: string;
      lessonFlow: { teacherActivity: string; studentActivity: string };
      learningResources: { teacherActivity: string; studentActivity: string };
      formativeAssessment: { teacherActivity: string; studentActivity: string };
      alignmentCheck?: {
        passed: boolean;
        structuralValid: boolean;
        autoRepaired: boolean;
        items: Array<{ code: string; severity: string; message: string }>;
      };
    };
    expect(callCount).toBe(2);
    expect(createdDlp.alignmentCheck?.structuralValid).toBe(true);
    expect(createdDlp.alignmentCheck?.passed).toBe(false);
    expect(createdDlp.alignmentCheck?.autoRepaired).toBe(true);
    expect(
      createdDlp.alignmentCheck?.items.some(
        (i) => i.code === "dlp-pacing" && i.severity === "warning" && i.message.includes("50"),
      ),
    ).toBe(true);
    expect(
      createdDlp.alignmentCheck?.items.some(
        (i) => i.code === "emergency-resources" && i.severity === "warning",
      ),
    ).toBe(true);
    expect(
      createdDlp.alignmentCheck?.items.some(
        (i) => i.code === "formative-support" && i.severity === "warning",
      ),
    ).toBe(true);

    // .docx export is never blocked by soft warnings
    const dlpDocxRes = await fetch(
      `${baseUrl}/api/dlps/${encodeURIComponent(createdDlp.id)}/docx`,
    );
    expect(dlpDocxRes.status).toBe(200);

    // PUT /api/dlps/:id resolves pacing, backup, and accommodation warnings live
    const putDlpRes = await fetch(
      `${baseUrl}/api/dlps/${encodeURIComponent(createdDlp.id)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...createdDlp,
          lessonFlow: {
            teacherActivity: "(40 min) Model tool setup and supervise paired station.",
            studentActivity: "(40 min) Execute tool setup steps in pairs.",
          },
          learningResources: {
            teacherActivity: "• Projector\n• Emergency/offline backup: Printed visual cards",
            studentActivity: "• Laptop\n• Emergency/offline backup: Paper cards",
          },
          formativeAssessment: {
            teacherActivity:
              "(10 min) Short quiz with Answer Key. Raise help cards for teacher feedback. Accommodations: oral option and visual cues.",
            studentActivity: "(10 min) Complete quiz and raise help cards for guidance.",
          },
        }),
      },
    );
    expect(putDlpRes.status).toBe(200);
    const updatedDlp = (await putDlpRes.json()) as {
      alignmentCheck?: { passed: boolean; structuralValid: boolean };
    };
    expect(updatedDlp.alignmentCheck?.passed).toBe(true);
    expect(updatedDlp.alignmentCheck?.structuralValid).toBe(true);
  });
});
