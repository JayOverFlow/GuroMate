import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { Connect, Plugin } from "vite";
import {
  SettingsValidationError,
  createGuroMateEngine,
} from "../engine/createGuroMateEngine";
import type {
  AiProviderSettings,
  GuroMateEngine,
  SettingsPatch,
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

      sendJson(res, 404, { error: `Unknown API route: ${req.method} ${urlPath}` });
    })().catch((err) => {
      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: err.message });
        return;
      }
      if (err instanceof SettingsValidationError) {
        sendJson(res, 400, { error: err.message });
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
