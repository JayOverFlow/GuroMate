import type { DailyLessonLog, TeacherProfileSettings } from "./types";

interface Span {
  start: number;
  end: number;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function findTopLevelTagSpans(xml: string, tagName: string): Span[] {
  const openRe = new RegExp(`<${tagName}(?=[\\s>])`, "g");
  const closeTag = `</${tagName}>`;
  const tokenRe = new RegExp(`<(\\/?)${tagName}(?=[\\s>])`, "g");
  const spans: Span[] = [];
  let depth = 0;
  let currentStart = -1;

  for (const match of xml.matchAll(tokenRe)) {
    const isClose = match[1] === "/";
    const idx = match.index ?? 0;
    if (!isClose) {
      if (depth === 0) currentStart = idx;
      depth += 1;
    } else {
      depth -= 1;
      if (depth === 0 && currentStart >= 0) {
        spans.push({ start: currentStart, end: idx + closeTag.length });
        currentStart = -1;
      }
    }
  }
  void openRe;
  return spans;
}

function extractFirstMatch(xml: string, regex: RegExp): string {
  const match = xml.match(regex);
  return match ? match[0] : "";
}

function buildParagraph(pPr: string, rPr: string, lineText: string): string {
  if (!lineText) {
    return `<w:p>${pPr}</w:p>`;
  }
  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(lineText)}</w:t></w:r></w:p>`;
}

export function replaceCellText(tcXml: string, text: string): string {
  const openEnd = tcXml.indexOf(">") + 1;
  const openTag = tcXml.slice(0, openEnd);
  const tcPr = extractFirstMatch(tcXml, /<w:tcPr\b[\s\S]*?<\/w:tcPr>/);
  const firstP = extractFirstMatch(tcXml, /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/);
  const pPr = extractFirstMatch(firstP, /<w:pPr\b[\s\S]*?<\/w:pPr>/);
  const firstRunRPr = firstP.match(/<w:r\b[^>]*>\s*(<w:rPr\b[\s\S]*?<\/w:rPr>)/)?.[1];
  const hasRun = /<w:r\b/.test(firstP);
  const pPrRPr = extractFirstMatch(pPr, /<w:rPr\b[\s\S]*?<\/w:rPr>/);
  const rPr = firstRunRPr ?? (hasRun ? "" : pPrRPr);

  const lines = text.trim() ? text.split(/\r?\n/) : [""];
  const paragraphs = lines.map((line) => buildParagraph(pPr, rPr, line)).join("");
  return `${openTag}${tcPr}${paragraphs}</w:tc>`;
}

function mapSessionRow(
  rowIdx: number,
  sessions: DailyLessonLog["sessions"],
  getValue: (session: DailyLessonLog["sessions"][number]) => string,
): Array<readonly [string, (tc: string) => string]> {
  return sessions.map(
    (s, idx) =>
      [`${rowIdx}:${idx + 1}`, (tc: string) => replaceCellText(tc, getValue(s))] as const,
  );
}

export interface IntentionsStandards {
  learningCompetencies: string[];
  contentStandards: string[];
  performanceStandards: string[];
}

export function buildIntentionsStandardsCell(
  tcXml: string,
  intentions: IntentionsStandards,
): string {
  const openEnd = tcXml.indexOf(">") + 1;
  const openTag = tcXml.slice(0, openEnd);
  const tcPr = extractFirstMatch(tcXml, /<w:tcPr\b[\s\S]*?<\/w:tcPr>/);
  const pSpans = findTopLevelTagSpans(tcXml, "w:p");
  const paragraphs = pSpans.map((s) => tcXml.slice(s.start, s.end));

  // Template Table 1 R1 C1 layout: P0=LC heading, P1=LC bullet, P2=spacer,
  // P3=CS heading, P4=CS stem, P5=CS bullet, P6=spacer,
  // P7=PS heading, P8=PS stem, P9=PS bullet.
  if (paragraphs.length < 10) {
    const combined = [
      "Learning Competency:",
      ...intentions.learningCompetencies.map((c) => `- ${c}`),
      "",
      "Content Standards:",
      "The learners should have knowledge and understanding of:",
      ...intentions.contentStandards.map((c) => `- ${c}`),
      "",
      "Performance Standards:",
      "By the end of the term, the learners are able to:",
      ...intentions.performanceStandards.map((c) => `- ${c}`),
    ].join("\n");
    return replaceCellText(tcXml, combined);
  }

  const bulletP = (templateP: string, items: string[]): string => {
    const pPr = extractFirstMatch(templateP, /<w:pPr\b[\s\S]*?<\/w:pPr>/);
    const rPr = extractFirstMatch(pPr, /<w:rPr\b[\s\S]*?<\/w:rPr>/);
    const list = items.length > 0 ? items : [""];
    return list.map((item) => buildParagraph(pPr, rPr, item)).join("");
  };

  const parts = [
    paragraphs[0]!,
    bulletP(paragraphs[1]!, intentions.learningCompetencies),
    paragraphs[2]!,
    paragraphs[3]!,
    paragraphs[4]!,
    bulletP(paragraphs[5]!, intentions.contentStandards),
    paragraphs[6]!,
    paragraphs[7]!,
    paragraphs[8]!,
    bulletP(paragraphs[9]!, intentions.performanceStandards),
  ];

  return `${openTag}${tcPr}${parts.join("")}</w:tc>`;
}

function updateTableCells(
  tableXml: string,
  updates: Map<string, (tcXml: string) => string>,
): string {
  const rowSpans = findTopLevelTagSpans(tableXml, "w:tr");
  const replacements: Array<{ start: number; end: number; next: string }> = [];

  rowSpans.forEach((rowSpan, rowIdx) => {
    const rowXml = tableXml.slice(rowSpan.start, rowSpan.end);
    const cellSpans = findTopLevelTagSpans(rowXml, "w:tc");
    cellSpans.forEach((cellSpan, colIdx) => {
      const updater = updates.get(`${rowIdx}:${colIdx}`);
      if (!updater) return;
      const absStart = rowSpan.start + cellSpan.start;
      const absEnd = rowSpan.start + cellSpan.end;
      replacements.push({
        start: absStart,
        end: absEnd,
        next: updater(tableXml.slice(absStart, absEnd)),
      });
    });
  });

  let out = tableXml;
  for (let i = replacements.length - 1; i >= 0; i--) {
    const r = replacements[i]!;
    out = out.slice(0, r.start) + r.next + out.slice(r.end);
  }
  return out;
}

export function applyTableUpdates(
  documentXml: string,
  tableUpdates: Array<Map<string, (tc: string) => string>>,
  templateLabel: string,
): string {
  const tableSpans = findTopLevelTagSpans(documentXml, "w:tbl");
  if (tableSpans.length < tableUpdates.length) {
    throw new Error(
      `Unexpected ${templateLabel} template layout: expected at least ${tableUpdates.length} tables, found ${tableSpans.length}.`,
    );
  }

  let out = documentXml;
  for (let ti = tableUpdates.length - 1; ti >= 0; ti--) {
    const span = tableSpans[ti]!;
    const updatedTable = updateTableCells(
      out.slice(span.start, span.end),
      tableUpdates[ti]!,
    );
    out = out.slice(0, span.start) + updatedTable + out.slice(span.end);
  }
  return out;
}

/** Injects Daily Lesson Log fields and Teacher Profile signatories into `word/document.xml`. */
export function injectDllIntoDocumentXml(
  documentXml: string,
  dll: DailyLessonLog,
  profile: TeacherProfileSettings,
): string {
  const tableUpdates: Array<Map<string, (tc: string) => string>> = [
    // Table 0: Header metadata
    new Map([
      ["0:1", (tc) => replaceCellText(tc, dll.lessonTitle)],
      ["1:1", (tc) => replaceCellText(tc, dll.learningAreas)],
      ["2:1", (tc) => replaceCellText(tc, profile.studentTeacherName)],
      ["3:1", (tc) => replaceCellText(tc, profile.cooperatingTeacherName)],
      ["4:1", (tc) => replaceCellText(tc, dll.gradeAndSection)],
      ["5:1", (tc) => replaceCellText(tc, "5")],
      ["6:1", (tc) => replaceCellText(tc, dll.references)],
      ["7:1", (tc) => replaceCellText(tc, profile.aiDeclaration)],
    ]),
    // Table 1: Intentions (Standards, per-session Learning Objectives, blank Learner Context)
    new Map([
      ["1:1", (tc) => buildIntentionsStandardsCell(tc, dll.intentions)],
      ...mapSessionRow(3, dll.sessions, (s) => s.learningObjectives),
      ["4:1", (tc) => replaceCellText(tc, "")],
    ]),
    // Table 2: Learning Experience
    new Map([
      ...mapSessionRow(1, dll.sessions, (s) => s.preLesson),
      ...mapSessionRow(2, dll.sessions, (s) => s.lessonFlow),
      ...mapSessionRow(3, dll.sessions, (s) => s.learningResources),
      ...mapSessionRow(4, dll.sessions, (s) => s.integrationAndContextualization),
    ]),
    // Table 3: Assessing Learning
    new Map(mapSessionRow(1, dll.sessions, (s) => s.formativeAssessment)),
    // Table 4: Ways Forward (Extended Learning Opportunities + blank Reflections)
    new Map([
      ...mapSessionRow(1, dll.sessions, (s) => s.extendedLearningOpportunities),
      ...mapSessionRow(2, dll.sessions, () => ""),
    ]),
    // Table 5: Pre-Service Teacher signatory
    new Map([["0:0", (tc) => replaceCellText(tc, profile.studentTeacherName)]]),
    // Table 6: Cooperating Teacher, TLE Coordinator, Academic Head signatories
    new Map([
      ["1:0", (tc) => replaceCellText(tc, profile.cooperatingTeacherName)],
      ["1:2", (tc) => replaceCellText(tc, profile.tleCoordinatorName)],
      ["1:4", (tc) => replaceCellText(tc, profile.academicHeadName)],
    ]),
  ];

  return applyTableUpdates(documentXml, tableUpdates, "DLL");
}

/** Extracts plain text per table, row, and cell from `word/document.xml` for verification. */
export function extractTableCellTexts(documentXml: string): string[][][] {
  return findTopLevelTagSpans(documentXml, "w:tbl").map((tblSpan) => {
    const tblXml = documentXml.slice(tblSpan.start, tblSpan.end);
    return findTopLevelTagSpans(tblXml, "w:tr").map((rowSpan) => {
      const rowXml = tblXml.slice(rowSpan.start, rowSpan.end);
      return findTopLevelTagSpans(rowXml, "w:tc").map((cellSpan) => {
        const cellXml = rowXml.slice(cellSpan.start, cellSpan.end);
        const texts = Array.from(cellXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)).map(
          (m) => unescapeXml(m[1] ?? ""),
        );
        return texts.join("").trim();
      });
    });
  });
}
