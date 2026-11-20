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
      `${baseUrl}/api/curriculum?gradeLevel=11`,
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
});
