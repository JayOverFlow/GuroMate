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
});
