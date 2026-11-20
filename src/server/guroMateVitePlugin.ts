import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { Connect, Plugin } from "vite";
import {
  CurriculumNotFoundError,
  CurriculumValidationError,
  SettingsValidationError,
  createGuroMateEngine,
} from "../engine/createGuroMateEngine";
import {
  GRADE_LEVELS,
  QUARTERS,
  TLE_COMPONENTS,
  type AiProviderSettings,
  type CurriculumFilter,
  type CustomCompetencyInput,
  type GradeLevel,
  type GuroMateEngine,
  type QuarterNumber,
  type SettingsPatch,
  type TleComponent,
} from "../engine/types";

const MAX_BODY_BYTES = 1024 * 1024;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > MAX_BODY_BYTES) {
      throw new HttpError(413, "Request body exceeds 1 MB limit.");
    }
    chunks.push(buf);
  }

  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "Invalid JSON request body.");
  }
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCurriculumFilter(reqUrl: string): CurriculumFilter {
  const url = new URL(reqUrl, "http://127.0.0.1");
  const filter: CurriculumFilter = {};

  const gradeRaw = url.searchParams.get("gradeLevel");
  if (gradeRaw) {
    const grade = Number(gradeRaw);
    if (!GRADE_LEVELS.includes(grade as GradeLevel)) {
      throw new HttpError(400, `Invalid gradeLevel: ${gradeRaw}`);
    }
    filter.gradeLevel = grade as GradeLevel;
  }

  const quarterRaw = url.searchParams.get("quarter");
  if (quarterRaw) {
    const quarter = Number(quarterRaw);
    if (!QUARTERS.includes(quarter as QuarterNumber)) {
      throw new HttpError(400, `Invalid quarter: ${quarterRaw}`);
    }
    filter.quarter = quarter as QuarterNumber;
  }

  const term = url.searchParams.get("term");
  if (term) filter.term = term;

  const componentRaw = url.searchParams.get("component");
  if (componentRaw) {
    if (!TLE_COMPONENTS.includes(componentRaw as TleComponent)) {
      throw new HttpError(400, `Invalid TLE component: ${componentRaw}`);
    }
    filter.component = componentRaw as TleComponent;
  }

  const sector = url.searchParams.get("sector");
  if (sector) filter.sector = sector;

  const query = url.searchParams.get("query");
  if (query) filter.query = query;

  return filter;
}

function parseCustomCompetencyBody(body: unknown): CustomCompetencyInput {
  if (!isRecord(body)) {
    throw new HttpError(400, "Custom competency payload must be a JSON object.");
  }
  const bow = isRecord(body.budgetOfWork) ? body.budgetOfWork : undefined;
  return {
    gradeLevels: Array.isArray(body.gradeLevels)
      ? (body.gradeLevels as GradeLevel[])
      : [],
    quarters: Array.isArray(body.quarters)
      ? (body.quarters as QuarterNumber[])
      : [],
    component: body.component as TleComponent,
    sector: typeof body.sector === "string" ? body.sector : null,
    contentTopic:
      typeof body.contentTopic === "string" ? body.contentTopic : "",
    contentSubTopics: Array.isArray(body.contentSubTopics)
      ? body.contentSubTopics.filter((s): s is string => typeof s === "string")
      : [],
    contentStandard:
      typeof body.contentStandard === "string" ? body.contentStandard : "",
    performanceStandard:
      typeof body.performanceStandard === "string"
        ? body.performanceStandard
        : "",
    learningCompetency:
      typeof body.learningCompetency === "string"
        ? body.learningCompetency
        : "",
    customNotes:
      typeof body.customNotes === "string" ? body.customNotes : undefined,
    ...(bow
      ? {
          budgetOfWork: {
            term: typeof bow.term === "string" ? bow.term : "",
            weekRange: typeof bow.weekRange === "string" ? bow.weekRange : "",
            suggestedActivities:
              typeof bow.suggestedActivities === "string"
                ? bow.suggestedActivities
                : "",
            suggestedPerformanceTasks:
              typeof bow.suggestedPerformanceTasks === "string"
                ? bow.suggestedPerformanceTasks
                : "",
          },
        }
      : {}),
  };
}

/** Creates the HTTP middleware exposing GuroMate Engine operations under `/api`. */
export function createGuroMateMiddleware(
  engine: GuroMateEngine,
): Connect.NextHandleFunction {
  return (req, res, next) => {
    const urlPath = (req.url ?? "").split("?")[0] ?? "";
    if (!urlPath.startsWith("/api/") && urlPath !== "/api") {
      next();
      return;
    }

    void (async () => {
      if (req.method === "GET" && urlPath === "/api/settings") {
        const settings = await engine.getSettings();
        sendJson(res, 200, settings);
        return;
      }

      if (req.method === "PUT" && urlPath === "/api/settings") {
        const body = await readJsonBody(req);
        if (!isRecord(body)) {
          throw new HttpError(400, "Settings payload must be a JSON object.");
        }
        const saved = await engine.saveSettings(body as SettingsPatch);
        sendJson(res, 200, saved);
        return;
      }

      if (
        req.method === "POST" &&
        urlPath === "/api/settings/test-connection"
      ) {
        const body = await readJsonBody(req);
        if (!isRecord(body)) {
          throw new HttpError(400, "Connection check payload must be an object.");
        }
        const aiOverride = isRecord(body.ai)
          ? (body.ai as Partial<AiProviderSettings>)
          : undefined;
        const result = await engine.testAiConnection(aiOverride);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "GET" && urlPath === "/api/curriculum") {
        const filter = parseCurriculumFilter(req.url ?? "");
        const items = await engine.listCurriculum(filter);
        sendJson(res, 200, items);
        return;
      }

      if (req.method === "POST" && urlPath === "/api/curriculum/custom") {
        const body = await readJsonBody(req);
        const input = parseCustomCompetencyBody(body);
        const created = await engine.saveCustomCompetency(input);
        sendJson(res, 201, created);
        return;
      }

      const customMatch = urlPath.match(/^\/api\/curriculum\/custom\/([^/]+)$/);
      if (customMatch) {
        const id = decodeURIComponent(customMatch[1]!);
        if (req.method === "PUT") {
          const body = await readJsonBody(req);
          const input = parseCustomCompetencyBody(body);
          const updated = await engine.saveCustomCompetency({ ...input, id });
          sendJson(res, 200, updated);
          return;
        }
        if (req.method === "DELETE") {
          await engine.deleteCustomCompetency(id);
          sendJson(res, 200, { ok: true });
          return;
        }
      }

      const notesMatch = urlPath.match(/^\/api\/curriculum\/([^/]+)\/notes$/);
      if (req.method === "PUT" && notesMatch) {
        const id = decodeURIComponent(notesMatch[1]!);
        const body = await readJsonBody(req);
        if (!isRecord(body) || typeof body.customNotes !== "string") {
          throw new HttpError(400, "customNotes string is required.");
        }
        const updated = await engine.saveCompetencyNotes(id, body.customNotes);
        sendJson(res, 200, updated);
        return;
      }

      sendJson(res, 404, { error: `Unknown API route: ${req.method} ${urlPath}` });
    })().catch((err) => {
      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: err.message });
        return;
      }
      if (
        err instanceof SettingsValidationError ||
        err instanceof CurriculumValidationError
      ) {
        sendJson(res, 400, { error: err.message });
        return;
      }
      if (err instanceof CurriculumNotFoundError) {
        sendJson(res, 404, { error: err.message });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      sendJson(res, 500, { error: message });
    });
  };
}

function attachGuroMateMiddleware(
  middlewares: Connect.Server,
  root: string,
): void {
  const engine = createGuroMateEngine({
    dataDir: path.resolve(root, "data"),
    templatesDir: root,
  });
  middlewares.use(createGuroMateMiddleware(engine));
}

/** Vite plugin mounting the GuroMate Engine middleware onto dev and preview servers. */
export function guroMateVitePlugin(): Plugin {
  return {
    name: "guromate-engine-middleware",
    configureServer(server) {
      attachGuroMateMiddleware(server.middlewares, server.config.root);
    },
    configurePreviewServer(server) {
      attachGuroMateMiddleware(server.middlewares, server.config.root);
    },
  };
}
