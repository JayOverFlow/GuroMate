import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { Connect, Plugin } from "vite";
import {
  ClassSectionNotFoundError,
  ClassSectionValidationError,
  CurriculumNotFoundError,
  CurriculumValidationError,
  DllNotFoundError,
  DllValidationError,
  DlpNotFoundError,
  DlpValidationError,
  QuizNotFoundError,
  QuizValidationError,
  ReferenceMaterialError,
  SettingsValidationError,
  createGuroMateEngine,
} from "../engine/createGuroMateEngine";
import {
  GRADE_LEVELS,
  QUARTERS,
  QUIZ_QUESTION_TYPES,
  TLE_COMPONENTS,
  type AiProviderSettings,
  type ClassSectionInput,
  type ClassroomContext,
  type ClassroomFacility,
  type CurriculumFilter,
  type CustomCompetencyInput,
  type DailyLessonLog,
  type DailyLessonPlan,
  type DeliveryModality,
  type DllSessionConfig,
  type GenerateDllInput,
  type GenerateDlpInput,
  type GenerateQuizInput,
  type GradeLevel,
  type GuroMateEngine,
  type QuarterNumber,
  type Quiz,
  type QuizItemCounts,
  type ReferenceMaterial,
  type SessionNumber,
  type SettingsPatch,
  type TleComponent,
} from "../engine/types";

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_REFERENCE_UPLOAD_BODY_BYTES = 16 * 1024 * 1024;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function readJsonBody(
  req: IncomingMessage,
  maxBytes: number = MAX_BODY_BYTES,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      const limitMb = Math.round(maxBytes / (1024 * 1024));
      throw new HttpError(413, `Request body exceeds ${limitMb} MB limit.`);
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

function sendDocx(res: ServerResponse, filename: string, buffer: Buffer): void {
  res.statusCode = 200;
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.end(buffer);
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
      throw new HttpError(400, `Invalid component: ${componentRaw}`);
    }
    filter.component = componentRaw as TleComponent;
  }

  const sector = url.searchParams.get("sector");
  if (sector) filter.sector = sector;

  const query = url.searchParams.get("query");
  if (query) filter.query = query;

  const hasBowRaw = url.searchParams.get("hasBow");
  if (hasBowRaw !== null && hasBowRaw !== "") {
    if (hasBowRaw === "true") {
      filter.hasBow = true;
    } else if (hasBowRaw === "false") {
      filter.hasBow = false;
    } else {
      throw new HttpError(400, `Invalid hasBow: ${hasBowRaw}`);
    }
  }

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
            ...(typeof bow.sourceDocument === "string"
              ? { sourceDocument: bow.sourceDocument }
              : {}),
          },
        }
      : {}),
  };
}

function parseClassSectionBody(body: unknown): ClassSectionInput {
  if (!isRecord(body)) {
    throw new HttpError(400, "Class section payload must be a JSON object.");
  }
  return {
    gradeLevel: Number(body.gradeLevel) as GradeLevel,
    sectionName:
      typeof body.sectionName === "string" ? body.sectionName : "",
    students: Array.isArray(body.students)
      ? body.students.filter((s): s is string => typeof s === "string")
      : [],
  };
}

function parseClassroomContext(raw: unknown): ClassroomContext | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!isRecord(raw)) {
    throw new HttpError(400, "classroomContext must be a JSON object.");
  }
  return {
    periodMinutes: Number(raw.periodMinutes),
    facility: raw.facility as ClassroomFacility,
    modality: raw.modality as DeliveryModality,
  };
}

function parseReferenceMaterial(raw: unknown): ReferenceMaterial | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!isRecord(raw)) {
    throw new HttpError(400, "referenceMaterial must be a JSON object.");
  }
  return {
    ...(typeof raw.sourceLabel === "string"
      ? { sourceLabel: raw.sourceLabel }
      : {}),
    text: typeof raw.text === "string" ? raw.text : "",
  };
}

function parseGenerateDllBody(body: unknown): GenerateDllInput {
  if (!isRecord(body)) {
    throw new HttpError(400, "DLL generation payload must be a JSON object.");
  }
  const classroomContext = parseClassroomContext(body.classroomContext);
  const referenceMaterial = parseReferenceMaterial(body.referenceMaterial);
  const sessions: DllSessionConfig[] = Array.isArray(body.sessions)
    ? body.sessions.map((entry) => {
        if (!isRecord(entry)) {
          throw new HttpError(400, "Each session config must be an object.");
        }
        return {
          sessionNumber: Number(entry.sessionNumber) as SessionNumber,
          mode:
            entry.mode === "non-instructional"
              ? "non-instructional"
              : "instructional",
          competencyIds: Array.isArray(entry.competencyIds)
            ? entry.competencyIds.filter((s): s is string => typeof s === "string")
            : [],
          ...(typeof entry.nonInstructionalReason === "string"
            ? { nonInstructionalReason: entry.nonInstructionalReason }
            : {}),
        };
      })
    : [];
  return {
    ...(typeof body.lessonTitle === "string"
      ? { lessonTitle: body.lessonTitle }
      : {}),
    gradeAndSection:
      typeof body.gradeAndSection === "string" ? body.gradeAndSection : "",
    ...(typeof body.references === "string"
      ? { references: body.references }
      : {}),
    ...(classroomContext ? { classroomContext } : {}),
    ...(referenceMaterial ? { referenceMaterial } : {}),
    ...(typeof body.promptNotes === "string"
      ? { promptNotes: body.promptNotes }
      : {}),
    sessions,
  };
}

function parseGenerateDlpBody(body: unknown): GenerateDlpInput {
  if (!isRecord(body)) {
    throw new HttpError(400, "DLP generation payload must be a JSON object.");
  }
  const classroomContext = parseClassroomContext(body.classroomContext);
  const referenceMaterial = parseReferenceMaterial(body.referenceMaterial);
  const optional = {
    ...(typeof body.lessonTitle === "string" ? { lessonTitle: body.lessonTitle } : {}),
    ...(typeof body.references === "string" ? { references: body.references } : {}),
    ...(classroomContext ? { classroomContext } : {}),
    ...(referenceMaterial ? { referenceMaterial } : {}),
    ...(typeof body.promptNotes === "string" ? { promptNotes: body.promptNotes } : {}),
  };
  if (body.mode === "derive") {
    if (typeof body.dllId !== "string" || !body.dllId.trim()) {
      throw new HttpError(400, "dllId is required when deriving from a DLL Session.");
    }
    return {
      mode: "derive",
      dllId: body.dllId,
      sessionNumber: Number(body.sessionNumber) as SessionNumber,
      ...optional,
    };
  }
  return {
    mode: "scratch",
    gradeAndSection:
      typeof body.gradeAndSection === "string" ? body.gradeAndSection : "",
    competencyIds: Array.isArray(body.competencyIds)
      ? body.competencyIds.filter((s): s is string => typeof s === "string")
      : [],
    ...optional,
  };
}

function parseQuizItemCounts(raw: unknown): QuizItemCounts {
  const counts: QuizItemCounts = {
    multipleChoice: 0,
    trueFalse: 0,
    identification: 0,
    essayRubric: 0,
  };
  if (!isRecord(raw)) return counts;
  for (const type of QUIZ_QUESTION_TYPES) {
    const val = raw[type];
    counts[type] = typeof val === "number" ? val : Number(val ?? 0);
  }
  return counts;
}

function parseGenerateQuizBody(body: unknown): GenerateQuizInput {
  if (!isRecord(body)) {
    throw new HttpError(400, "Quiz generation payload must be a JSON object.");
  }
  const optional = {
    ...(typeof body.title === "string" ? { title: body.title } : {}),
    ...(typeof body.promptNotes === "string" ? { promptNotes: body.promptNotes } : {}),
    itemCounts: parseQuizItemCounts(body.itemCounts),
  };
  if (body.sourceKind === "dll") {
    if (typeof body.dllId !== "string" || !body.dllId.trim()) {
      throw new HttpError(400, "dllId is required when generating from a DLL Session.");
    }
    return {
      sourceKind: "dll",
      dllId: body.dllId,
      sessionNumber: Number(body.sessionNumber) as SessionNumber,
      ...optional,
    };
  }
  if (body.sourceKind === "dlp") {
    if (typeof body.dlpId !== "string" || !body.dlpId.trim()) {
      throw new HttpError(400, "dlpId is required when generating from a DLP.");
    }
    return {
      sourceKind: "dlp",
      dlpId: body.dlpId,
      ...optional,
    };
  }
  return {
    sourceKind: "standalone",
    gradeAndSection:
      typeof body.gradeAndSection === "string" ? body.gradeAndSection : "",
    competencyIds: Array.isArray(body.competencyIds)
      ? body.competencyIds.filter((s): s is string => typeof s === "string")
      : [],
    ...optional,
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

      if (req.method === "POST" && urlPath === "/api/settings/models") {
        const body = await readJsonBody(req);
        if (!isRecord(body)) {
          throw new HttpError(400, "Model list payload must be an object.");
        }
        const aiOverride = isRecord(body.ai)
          ? (body.ai as Partial<AiProviderSettings>)
          : undefined;
        const result = await engine.listAiModels(aiOverride);
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

      if (req.method === "GET" && urlPath === "/api/class-sections") {
        sendJson(res, 200, await engine.listClassSections());
        return;
      }

      if (req.method === "POST" && urlPath === "/api/class-sections") {
        const input = parseClassSectionBody(await readJsonBody(req));
        sendJson(res, 201, await engine.saveClassSection(input));
        return;
      }

      const sectionMatch = urlPath.match(/^\/api\/class-sections\/([^/]+)$/);
      if (sectionMatch) {
        const id = decodeURIComponent(sectionMatch[1]!);
        if (req.method === "PUT") {
          const input = parseClassSectionBody(await readJsonBody(req));
          sendJson(res, 200, await engine.saveClassSection({ ...input, id }));
          return;
        }
        if (req.method === "DELETE") {
          await engine.deleteClassSection(id);
          sendJson(res, 200, { ok: true });
          return;
        }
      }

      if (req.method === "POST" && urlPath === "/api/reference-material/extract") {
        const body = await readJsonBody(req, MAX_REFERENCE_UPLOAD_BODY_BYTES);
        if (!isRecord(body)) {
          throw new HttpError(400, "Reference material payload must be a JSON object.");
        }
        const extracted = await engine.extractReferenceMaterial({
          filename: typeof body.filename === "string" ? body.filename : "",
          dataBase64: typeof body.dataBase64 === "string" ? body.dataBase64 : "",
        });
        sendJson(res, 200, extracted);
        return;
      }

      if (req.method === "GET" && urlPath === "/api/dlls") {
        sendJson(res, 200, await engine.listDlls());
        return;
      }

      if (req.method === "POST" && urlPath === "/api/dlls/generate") {
        const input = parseGenerateDllBody(await readJsonBody(req));
        sendJson(res, 201, await engine.generateDll(input));
        return;
      }

      const dllDocxMatch = urlPath.match(/^\/api\/dlls\/([^/]+)\/docx$/);
      if (req.method === "GET" && dllDocxMatch) {
        const id = decodeURIComponent(dllDocxMatch[1]!);
        const { filename, buffer } = await engine.exportDllDocx(id);
        sendDocx(res, filename, buffer);
        return;
      }

      const dllMatch = urlPath.match(/^\/api\/dlls\/([^/]+)$/);
      if (dllMatch) {
        const id = decodeURIComponent(dllMatch[1]!);
        if (req.method === "GET") {
          sendJson(res, 200, await engine.getDll(id));
          return;
        }
        if (req.method === "PUT") {
          const body = await readJsonBody(req);
          if (!isRecord(body)) {
            throw new HttpError(400, "DLL payload must be a JSON object.");
          }
          const updated = await engine.saveDll({
            ...(body as unknown as DailyLessonLog),
            id,
          });
          sendJson(res, 200, updated);
          return;
        }
        if (req.method === "DELETE") {
          await engine.deleteDll(id);
          sendJson(res, 200, { ok: true });
          return;
        }
      }

      if (req.method === "GET" && urlPath === "/api/dlps") {
        sendJson(res, 200, await engine.listDlps());
        return;
      }

      if (req.method === "POST" && urlPath === "/api/dlps/generate") {
        const input = parseGenerateDlpBody(await readJsonBody(req));
        sendJson(res, 201, await engine.generateDlp(input));
        return;
      }

      const dlpDocxMatch = urlPath.match(/^\/api\/dlps\/([^/]+)\/docx$/);
      if (req.method === "GET" && dlpDocxMatch) {
        const id = decodeURIComponent(dlpDocxMatch[1]!);
        const { filename, buffer } = await engine.exportDlpDocx(id);
        sendDocx(res, filename, buffer);
        return;
      }

      const dlpMatch = urlPath.match(/^\/api\/dlps\/([^/]+)$/);
      if (dlpMatch) {
        const id = decodeURIComponent(dlpMatch[1]!);
        if (req.method === "GET") {
          sendJson(res, 200, await engine.getDlp(id));
          return;
        }
        if (req.method === "PUT") {
          const body = await readJsonBody(req);
          if (!isRecord(body)) {
            throw new HttpError(400, "DLP payload must be a JSON object.");
          }
          const updated = await engine.saveDlp({
            ...(body as unknown as DailyLessonPlan),
            id,
          });
          sendJson(res, 200, updated);
          return;
        }
        if (req.method === "DELETE") {
          await engine.deleteDlp(id);
          sendJson(res, 200, { ok: true });
          return;
        }
      }

      if (req.method === "GET" && urlPath === "/api/quizzes") {
        sendJson(res, 200, await engine.listQuizzes());
        return;
      }

      if (req.method === "POST" && urlPath === "/api/quizzes/generate") {
        const input = parseGenerateQuizBody(await readJsonBody(req));
        sendJson(res, 201, await engine.generateQuiz(input));
        return;
      }

      const quizSyncMatch = urlPath.match(/^\/api\/quizzes\/([^/]+)\/sync$/);
      if (req.method === "POST" && quizSyncMatch) {
        const id = decodeURIComponent(quizSyncMatch[1]!);
        sendJson(res, 200, await engine.syncQuizToLesson(id));
        return;
      }

      const quizDocxMatch = urlPath.match(/^\/api\/quizzes\/([^/]+)\/docx$/);
      if (req.method === "GET" && quizDocxMatch) {
        const id = decodeURIComponent(quizDocxMatch[1]!);
        const { filename, buffer } = await engine.exportQuizDocx(id);
        sendDocx(res, filename, buffer);
        return;
      }

      const quizMatch = urlPath.match(/^\/api\/quizzes\/([^/]+)$/);
      if (quizMatch) {
        const id = decodeURIComponent(quizMatch[1]!);
        if (req.method === "GET") {
          sendJson(res, 200, await engine.getQuiz(id));
          return;
        }
        if (req.method === "PUT") {
          const body = await readJsonBody(req);
          if (!isRecord(body)) {
            throw new HttpError(400, "Quiz payload must be a JSON object.");
          }
          const updated = await engine.saveQuiz({
            ...(body as unknown as Quiz),
            id,
          });
          sendJson(res, 200, updated);
          return;
        }
        if (req.method === "DELETE") {
          await engine.deleteQuiz(id);
          sendJson(res, 200, { ok: true });
          return;
        }
      }

      sendJson(res, 404, { error: `Unknown API route: ${req.method} ${urlPath}` });
    })().catch((err) => {
      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: err.message });
        return;
      }
      if (
        err instanceof SettingsValidationError ||
        err instanceof CurriculumValidationError ||
        err instanceof ClassSectionValidationError ||
        err instanceof DllValidationError ||
        err instanceof DlpValidationError ||
        err instanceof QuizValidationError ||
        err instanceof ReferenceMaterialError
      ) {
        sendJson(res, 400, { error: err.message });
        return;
      }
      if (
        err instanceof CurriculumNotFoundError ||
        err instanceof ClassSectionNotFoundError ||
        err instanceof DllNotFoundError ||
        err instanceof DlpNotFoundError ||
        err instanceof QuizNotFoundError
      ) {
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
