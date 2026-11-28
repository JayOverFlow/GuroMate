import type {
  BowTerm,
  BudgetOfWorkInfo,
  CurriculumCompetency,
  GradeLevel,
  TleComponent,
} from "./types";

export interface BowDocumentInput {
  /** Relative path from the Budget of Works root (e.g. "Grade 7/[G7] TLE_ ICT.pdf"). */
  relativePath: string;
  /** Plain text extracted from the PDF via `pdftotext -layout`. */
  text: string;
}

export interface ParsedBowRow {
  gradeLevels: GradeLevel[];
  component: TleComponent;
  sector: string | null;
  sectorDescription: string | null;
  term: BowTerm;
  weekRange: string;
  contentTopic: string;
  contentStandard: string;
  performanceStandard: string;
  learningCompetency: string;
  suggestedActivities: string;
  suggestedPerformanceTasks: string;
  sourceDocument: string;
}

/**
 * Maps a Grade 12 Technical-Professional (Tech-Pro) cluster and elective name
 * onto one of GuroMate's existing TLE Components (ICT, AFA, FCS, IA) per ADR-0003.
 */
export function mapGrade12TechProCluster(
  cluster: string,
  elective: string,
): TleComponent {
  const c = cluster.trim().toLowerCase();
  const e = elective.trim().toLowerCase();

  if (
    c.includes("ict support") ||
    c.includes("computer programming") ||
    c.includes("creative arts and design")
  ) {
    return "ICT";
  }

  if (
    c.includes("aesthetic") ||
    c.includes("wellness") ||
    c.includes("artisanry") ||
    c.includes("hospitality") ||
    c.includes("tourism")
  ) {
    return "FCS";
  }

  if (c.includes("maritime")) {
    if (e.includes("catering")) {
      return "FCS";
    }
    return "IA";
  }

  if (
    c.includes("construction") ||
    c.includes("automotive") ||
    c.includes("small engine") ||
    c.includes("industrial")
  ) {
    return "IA";
  }

  if (
    c.includes("agri") ||
    c.includes("fishery") ||
    c.includes("fisheries") ||
    c.includes("aquaculture") ||
    c.includes("animal production") ||
    c.includes("crop production") ||
    c.includes("horticulture") ||
    c.includes("forestry") ||
    c.includes("food processing") ||
    /\bafa\b/.test(c)
  ) {
    return "AFA";
  }

  throw new Error(
    `Unknown Grade 12 Tech-Pro cluster "${cluster}" for elective "${elective}"`,
  );
}

/**
 * Normalizes English, Filipino, and single-term Budget of Work term headers
 * into GuroMate's canonical BowTerm values.
 */
export function normalizeBowTerm(rawTerm: string): BowTerm {
  const normalized = rawTerm.trim().replace(/\s+/g, " ");
  const lower = normalized.toLowerCase();

  if (lower.startsWith("first term") || lower.startsWith("unang termino")) {
    return "First Term";
  }
  if (lower.startsWith("second term") || lower.startsWith("ikalawang termino")) {
    return "Second Term";
  }
  if (lower.startsWith("third term") || lower.startsWith("ikatlong termino")) {
    return "Third Term";
  }
  if (
    lower === "term" ||
    lower === "term plan" ||
    lower === "one-term" ||
    lower.startsWith("term plan:")
  ) {
    return "One-Term";
  }

  throw new Error(`Unrecognized Budget of Work term header: "${rawTerm}"`);
}

const COMPONENT_NAME_MAP: Array<[RegExp, TleComponent]> = [
  [/^information and communications technology$/i, "ICT"],
  [/^agriculture and fishery arts$/i, "AFA"],
  [/^family and consumer science(s)?$/i, "FCS"],
  [/^industrial arts$/i, "IA"],
];

function matchComponentHeading(text: string): TleComponent | null {
  const cleaned = text.trim().replace(/\s+/g, " ");
  for (const [pattern, comp] of COMPONENT_NAME_MAP) {
    if (pattern.test(cleaned)) return comp;
  }
  return null;
}

function cleanLine(raw: string): string {
  return raw.replace(/[\u200b\ufeff\r]/g, "");
}

function isRunningHeaderOrFooter(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^Page\s+\d+\s+of\s+\d+$/i.test(trimmed)) return true;
  if (/^Pahina\s+\d+\s+ng\s+\d+$/i.test(trimmed)) return true;
  if (/^Last\s+updated\b/i.test(trimmed)) return true;
  if (/^Huling\s+na-update\b/i.test(trimmed)) return true;
  if (/^Budget\s+of\s+Work\s+(Grade|Baitang)\b/i.test(trimmed)) return true;
  return false;
}

function isFootnoteLine(line: string): boolean {
  const trimmed = line.trim();
  if (/^\*\s*Teachers\s+may\s+assign/i.test(trimmed)) return true;
  if (/^\*\s*Note:/i.test(trimmed)) return true;
  if (/^Note:\s*The\s+Budget\s+of\s+Work/i.test(trimmed)) return true;
  return false;
}

function isAppendixStart(line: string): boolean {
  const trimmed = line.trim();
  return (
    /^QUARTERLY\s+TO\s+TRIMESTRAL\s+MAPPING/i.test(trimmed) ||
    /^SUGGESTED\s+CLUSTERING\s+OF\s+LEARNING\s+COMPETENCIES/i.test(trimmed)
  );
}

const TERM_HEADER_RE =
  /^\s*(First Term(?:\s*:.*)?|Second Term(?:\s*:.*)?|Third Term(?:\s*:.*)?|Unang Termino|Ikalawang Termino|Ikatlong Termino|Term Plan|Term)\s*$/i;

const WEEK_TOKEN_RE =
  /^(?:\d+(?:\s*(?:to|-|–|&|,)\s*\d+)?|\*|Weeks?\s+\d+(?:\s*(?:to|-|–)\s*\d+)?)$/i;

interface DocumentMeta {
  gradeLevels: GradeLevel[];
  defaultComponent: TleComponent;
  sector: string | null;
  sectorDescription: string | null;
  sourceDocument: string;
}

function inferDocumentMeta(
  relativePath: string,
  allLines: string[],
): DocumentMeta {
  const normalizedPath = relativePath.replace(/\\/g, "/");
  const filename = normalizedPath.split("/").pop() ?? normalizedPath;
  const stem = filename.replace(/\.pdf$/i, "").trim();

  let gradeLevels: GradeLevel[];
  if (/Grade\s*7|\[G7\]/i.test(normalizedPath)) {
    gradeLevels = [7];
  } else if (/Grade\s*8|\[G8\]/i.test(normalizedPath)) {
    gradeLevels = [8];
  } else if (/Grade\s*9\s*-\s*10|\[G9\s*_\s*G10\]/i.test(normalizedPath)) {
    gradeLevels = [9, 10];
  } else if (/Grade\s*11|\[G11\]/i.test(normalizedPath)) {
    gradeLevels = [11];
  } else if (/Grade\s*12|\[G12\]/i.test(normalizedPath)) {
    gradeLevels = [12];
  } else {
    throw new Error(`Cannot infer grade level from path: "${relativePath}"`);
  }

  let defaultComponent: TleComponent = "ICT";
  let sector: string | null = null;
  let sectorDescription: string | null = null;

  if (gradeLevels[0] === 11) {
    defaultComponent = "SHS_CORE";
    sector = stem.replace(/^\[G11\]\s*/i, "").trim();
  } else if (gradeLevels[0] === 12) {
    const tpIdx = allLines.findIndex((l) => /TECHNICAL-PROFESSIONAL/i.test(l));
    const cluster =
      tpIdx >= 0 && allLines[tpIdx + 1]
        ? allLines[tpIdx + 1]!.trim().replace(/\s+/g, " ")
        : "";
    const electiveLine = allLines.find((l) => /^\s*Elective\s{2,}/i.test(l));
    const electiveFromDoc = electiveLine
      ? electiveLine.replace(/^\s*Elective\s+/i, "").trim().replace(/\s+/g, " ")
      : "";
    const electiveFromFile = stem
      .replace(/^\[G12\]\s*/i, "")
      .replace(/_/g, ":")
      .trim();
    sector = electiveFromDoc || electiveFromFile;
    sectorDescription = cluster || null;
    defaultComponent = mapGrade12TechProCluster(cluster, sector);
  } else if (gradeLevels[0] === 9) {
    const compMatch = filename.match(/TLE_\s*(ICT|AFA|FCS|IA)\s*-/i);
    if (compMatch?.[1]) {
      defaultComponent = compMatch[1].toUpperCase() as TleComponent;
    }
    const sectorLine = allLines.find((l) => /^\s*Sector\s{2,}/i.test(l));
    if (sectorLine) {
      sector = sectorLine
        .replace(/^\s*Sector\s+/i, "")
        .trim()
        .replace(/\s+/g, " ");
    } else {
      const fileSector = stem.replace(/^.*-\s*/, "").trim();
      sector = fileSector || null;
    }
  } else {
    // Grade 7 or Grade 8
    if (/TLE_\s*ICT\b/i.test(filename)) {
      defaultComponent = "ICT";
    } else if (/TLE_\s*AFA\b/i.test(filename)) {
      defaultComponent = "AFA";
    }
  }

  return {
    gradeLevels,
    defaultComponent,
    sector,
    sectorDescription,
    sourceDocument: normalizedPath,
  };
}

function collapseSpaces(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/**
 * Formats bulleted lines (● / ○ / ■) into normalized markdown bullet text.
 */
function formatBulletLines(lines: string[]): string {
  const out: Array<{ indent: number; text: string }> = [];

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const bulletMatch = trimmed.match(/^([●○■•\-])\s*(.*)$/);
    if (bulletMatch) {
      const symbol = bulletMatch[1]!;
      const content = collapseSpaces(bulletMatch[2] ?? "");
      const indent =
        symbol === "●" || symbol === "•" || symbol === "-"
          ? 0
          : symbol === "○"
            ? 2
            : 4;
      out.push({ indent, text: content });
    } else if (out.length > 0) {
      const prev = out[out.length - 1]!;
      prev.text = collapseSpaces(`${prev.text} ${trimmed}`);
    } else {
      out.push({ indent: 0, text: collapseSpaces(trimmed) });
    }
  }

  return out
    .filter((entry) => entry.text.length > 0)
    .map((entry) => `${" ".repeat(entry.indent)}- ${entry.text}`)
    .join("\n");
}

function extractStandards(metaLines: string[]): {
  contentStandard: string;
  performanceStandard: string;
} {
  let mode: "none" | "cs" | "ps" | "other" = "none";
  const csLines: string[] = [];
  const psLines: string[] = [];

  for (const line of metaLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const psMatch = line.match(
      /^\s*(?:Performance\s+Standard|Pamantayan\s+sa\s+Pagganap|Pamantayan|sa\s+Pagganap)(?:\s{2,}(.+)|\s*)$/i,
    );
    if (psMatch) {
      mode = "ps";
      if (psMatch[1]?.trim()) psLines.push(psMatch[1].trim());
      continue;
    }

    const csMatch = line.match(
      /^\s*(?:Content\s+Standard|Pamantayang\s+Pangnilalaman|Pamantayang|Pangnilalaman)(?:\s{2,}(.+)|\s*)$/i,
    );
    if (csMatch) {
      mode = "cs";
      if (csMatch[1]?.trim()) csLines.push(csMatch[1].trim());
      continue;
    }

    const otherMatch = line.match(
      /^\s*(?:Sector|Elective|Essential\s+Life\s+Skills|Suggested(?:\s+Communicative\s+Events)?|Communicative\s+Events|Mga\s+Mungkahing|Sitwasyong\s+Komunikatibo)(?:\s{2,}.*|\s*)$/i,
    );
    if (otherMatch) {
      mode = "other";
      continue;
    }

    if (mode === "cs") {
      csLines.push(trimmed);
    } else if (mode === "ps") {
      psLines.push(trimmed);
    }
  }

  const cleanStandard = (lines: string[]): string => {
    const joined = lines
      .map((l) => l.replace(/^[●○■•]\s*/, "").trim())
      .filter(Boolean)
      .join(" ");
    return collapseSpaces(joined);
  };

  return {
    contentStandard: cleanStandard(csLines),
    performanceStandard: cleanStandard(psLines),
  };
}

interface TableRowBlock {
  weekRange: string;
  lcLines: string[];
  actLines: string[];
}

function findActivitySplitColumn(
  tableLines: string[],
  actHeaderCol: number,
  lcHeaderCol: number,
): number {
  // Look for top-level bullets `●` in the right half of the table
  const minRight = Math.max(lcHeaderCol + 20, Math.floor(actHeaderCol * 0.65));
  const candidateCols: number[] = [];

  for (const line of tableLines) {
    if (
      /Suggested\s+Performance\s+Tasks?/i.test(line) ||
      /^\s*Suggested\s*$/i.test(line) ||
      /^\s*Performance\s+Tasks?\b/i.test(line)
    ) {
      continue;
    }
    let idx = line.indexOf("●", minRight);
    while (idx !== -1) {
      if (idx <= actHeaderCol + 10) {
        candidateCols.push(idx);
      }
      idx = line.indexOf("●", idx + 1);
    }
  }

  if (candidateCols.length > 0) {
    // Use the minimum observed right-column bullet position minus 2 chars of safety margin
    return Math.max(minRight, Math.min(...candidateCols) - 2);
  }

  return Math.max(minRight, actHeaderCol - 12);
}

const LEADING_WEEK_RE =
  /^\s{0,10}(\d+(?:\s*(?:to|-|–|&|,)\s*\d+)?|\*)(?:\s{2,}|$)/i;

function splitThreeColLine(
  line: string,
  actColStart: number,
): { week: string; lc: string; act: string } {
  let weekPart = "";
  let lcStartCol = 0;

  const weekMatch = line.match(LEADING_WEEK_RE);
  if (weekMatch?.[1]) {
    weekPart = collapseSpaces(weekMatch[1]);
    lcStartCol = weekMatch[0].length;
  }

  if (actColStart < 0) {
    return {
      week: weekPart,
      lc: (" ".repeat(lcStartCol) + line.slice(lcStartCol)).trimEnd(),
      act: "",
    };
  }

  // If the first non-space character after week is far to the right, it belongs to Suggested Activities
  const relFirst = line.slice(lcStartCol).search(/\S/);
  if (relFirst >= 0) {
    const absFirst = lcStartCol + relFirst;
    const rightOnlyThreshold = Math.max(38, Math.min(actColStart - 12, 46));
    if (absFirst >= rightOnlyThreshold) {
      return {
        week: weekPart,
        lc: "",
        act: line.slice(absFirst).trimEnd(),
      };
    }
  }

  // Prefer splitting right before a right-side bullet preceded by >= 3 spaces
  const minRightBulletCol = Math.max(38, actColStart - 20);
  let actualSplit = actColStart;
  const rightBulletRe = /\s{3,}([●○■])/g;
  rightBulletRe.lastIndex = Math.max(lcStartCol, minRightBulletCol - 3);
  const bulletMatch = rightBulletRe.exec(line);
  if (bulletMatch) {
    const bulletPos = bulletMatch.index + bulletMatch[0].length - 1;
    if (bulletPos >= minRightBulletCol && bulletPos <= actColStart + 18) {
      actualSplit = bulletPos;
    }
  }

  // If we'd slice through the middle of a word, nudge left/right to the nearest multi-space gap
  if (
    actualSplit > lcStartCol &&
    actualSplit < line.length &&
    line[actualSplit] !== " " &&
    line[actualSplit - 1] !== " "
  ) {
    let best = -1;
    for (let delta = 0; delta <= 14; delta++) {
      const leftPos = actualSplit - delta;
      if (leftPos >= lcStartCol + 2 && line.slice(leftPos - 2, leftPos) === "  ") {
        best = leftPos;
        break;
      }
      const rightPos = actualSplit + delta;
      if (
        rightPos + 2 <= line.length &&
        line.slice(rightPos, rightPos + 2) === "  "
      ) {
        best = rightPos + 2;
        break;
      }
    }
    if (best !== -1) {
      actualSplit = best;
    }
  }

  const lcPart =
    lcStartCol < actualSplit
      ? (" ".repeat(lcStartCol) + line.slice(lcStartCol, actualSplit)).trimEnd()
      : "";
  const actPart = line.slice(Math.max(lcStartCol, actualSplit)).trimEnd();
  return { week: weekPart, lc: lcPart, act: actPart };
}

const PERF_TASK_LABEL_RE =
  /^\s{0,16}(?:Suggested\s+Performance\s+Tasks?|Suggested|Performance\s+Tasks?)(?:\s{2,}(.*)|\s*)$/i;

function parseTabularTerm(
  tableLines: string[],
  headerLine: string,
): {
  blocks: TableRowBlock[];
  suggestedPerformanceTasks: string;
} {
  const lcIdx = headerLine.search(
    /\b(Learning\s+Competenc(?:y|ies)|Kasanayang\s+Pampagkatuto)\b/i,
  );
  const actIdx = headerLine.search(/\bSuggested\s+Activities\b/i);

  const hasActivitiesCol = actIdx >= 0;
  const actColStart = hasActivitiesCol
    ? findActivitySplitColumn(tableLines, actIdx, Math.max(0, lcIdx))
    : -1;

  // Group non-empty runs of lines into raw blocks separated by blank lines
  const rawBlocks: string[][] = [];
  let current: string[] = [];

  for (const line of tableLines) {
    // Skip repeated table headers on subsequent pages
    if (
      /\b(Week|Linggo)\b/i.test(line) &&
      /\b(Learning\s+Competenc(?:y|ies)|Kasanayang\s+Pampagkatuto)\b/i.test(line)
    ) {
      if (current.length > 0) {
        rawBlocks.push(current);
        current = [];
      }
      continue;
    }
    if (isFootnoteLine(line)) {
      if (current.length > 0) {
        rawBlocks.push(current);
        current = [];
      }
      continue;
    }

    if (line.trim() === "") {
      if (current.length > 0) {
        rawBlocks.push(current);
        current = [];
      }
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) {
    rawBlocks.push(current);
  }

  const blocks: TableRowBlock[] = [];
  const perfTaskLines: string[] = [];
  let inPerformanceTasks = false;

  for (const rawBlock of rawBlocks) {
    // Detect Suggested Performance Tasks block (by left label OR Performance Task bullet header)
    const hasPerfLabel = rawBlock.some((line) => PERF_TASK_LABEL_RE.test(line));
    const hasPerfBullet = rawBlock.some((line) =>
      /^\s*[●•]\s*(?:Individual|Group)?\s*(?:Performance\s+Task|Task\s*-|Learning\s+Activity|Activity\s*:)/i.test(
        line,
      ),
    );
    const hasLeadingWeek = rawBlock.some((line) => LEADING_WEEK_RE.test(line));

    if (inPerformanceTasks || hasPerfLabel || (!hasLeadingWeek && hasPerfBullet)) {
      inPerformanceTasks = true;
      for (const line of rawBlock) {
        const labelMatch = line.match(PERF_TASK_LABEL_RE);
        const right = labelMatch ? (labelMatch[1] ?? "").trim() : line.trim();
        if (right) perfTaskLines.push(right);
      }
      continue;
    }

    // Parse columns for this block
    let weekRange = "";
    const lcLines: string[] = [];
    const actLines: string[] = [];

    for (const line of rawBlock) {
      const { week, lc, act } = splitThreeColLine(line, actColStart);
      if (week && WEEK_TOKEN_RE.test(week)) {
        weekRange = weekRange ? `${weekRange} ${week}` : week;
      }
      if (lc.trim()) lcLines.push(lc);
      if (act.trim()) actLines.push(act);
    }

    // If this block is a page-break continuation (no week, no LC, only Suggested Activities), attach to previous block!
    if (!weekRange && lcLines.length === 0 && actLines.length > 0 && blocks.length > 0) {
      blocks[blocks.length - 1]!.actLines.push(...actLines);
      continue;
    }

    // If this block has LC continuation lines without a week (either non-bullet text OR deeply indented sub-bullet after page break), attach to previous block
    const firstLcLine = lcLines[0] ?? "";
    const firstLcTrimmed = firstLcLine.trim();
    const firstLcIndent = firstLcLine.search(/\S/);
    const prevBlock = blocks[blocks.length - 1];
    const prevHasBullet =
      prevBlock?.lcLines.some((l) => /^\s*[●•]/.test(l)) ?? false;
    const prevFirstBullet = prevBlock?.lcLines.find((l) => /^\s*[●•]/.test(l));
    const prevBulletIndent = prevFirstBullet
      ? prevFirstBullet.search(/\S/)
      : -1;
    const isDeepSubBullet =
      /^[●○■•]/.test(firstLcTrimmed) &&
      prevBulletIndent >= 0 &&
      firstLcIndent > prevBulletIndent + 4;
    const startsWithTopBullet = /^[●•]/.test(firstLcTrimmed) && !isDeepSubBullet;
    const startsWithComp = matchComponentHeading(firstLcTrimmed) !== null;
    if (
      !weekRange &&
      (!startsWithTopBullet || !prevHasBullet) &&
      !startsWithComp &&
      prevBlock &&
      lcLines.length > 0
    ) {
      prevBlock.lcLines.push(...lcLines);
      if (actLines.length > 0) {
        prevBlock.actLines.push(...actLines);
      }
      continue;
    }

    if (lcLines.length > 0) {
      blocks.push({
        weekRange,
        lcLines,
        actLines,
      });
    }
  }

  return {
    blocks,
    suggestedPerformanceTasks: formatBulletLines(perfTaskLines),
  };
}

function extractCompetenciesFromLcLines(
  lcLines: string[],
  defaultComponent: TleComponent,
  fallbackTopic: string,
): {
  component: TleComponent;
  contentTopic: string;
  competencies: string[];
} {
  let component = defaultComponent;
  let contentTopic = fallbackTopic;
  const competencies: string[] = [];
  const headingLines: string[] = [];
  let inBullets = false;
  let topBulletIndent: number | null = null;

  for (const raw of lcLines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const indent = raw.search(/\S/);

    if (!inBullets) {
      const compMatch = matchComponentHeading(trimmed);
      if (compMatch) {
        component = compMatch;
        continue;
      }
      if (/^[●•]/.test(trimmed)) {
        inBullets = true;
        topBulletIndent = indent;
        if (headingLines.length > 0) {
          contentTopic = collapseSpaces(headingLines.join(" "));
        }
        competencies.push(collapseSpaces(trimmed.replace(/^[●•]\s*/, "")));
        continue;
      }
      headingLines.push(trimmed);
    } else {
      const isTopLevelBullet =
        /^[●•]/.test(trimmed) &&
        (topBulletIndent === null || indent <= topBulletIndent + 4);
      if (isTopLevelBullet) {
        competencies.push(collapseSpaces(trimmed.replace(/^[●•]\s*/, "")));
      } else if (/^[●•○■]/.test(trimmed) || /^[a-z]\.\s+/i.test(trimmed)) {
        // Sub-item (including deeply indented level-3 ● sub-bullets) belonging to the current competency
        if (competencies.length > 0) {
          const sub = collapseSpaces(trimmed.replace(/^[●•○■]\s*/, ""));
          competencies[competencies.length - 1] = `${competencies[competencies.length - 1]} — ${sub}`;
        }
      } else {
        // Wrapped continuation line of the current competency
        if (competencies.length > 0) {
          competencies[competencies.length - 1] = collapseSpaces(
            `${competencies[competencies.length - 1]} ${trimmed}`,
          );
        }
      }
    }
  }

  return { component, contentTopic, competencies };
}

/**
 * Parses a DepEd Budget of Work PDF's `pdftotext -layout` text into structured competency rows.
 */
export function parseBowDocument(input: BowDocumentInput): ParsedBowRow[] {
  const rawLines = input.text
    .split(/\f/)
    .flatMap((page) => page.split("\n"))
    .map(cleanLine)
    .filter((line) => !isRunningHeaderOrFooter(line));

  const meta = inferDocumentMeta(input.relativePath, rawLines);

  // Split into term sections
  interface TermSection {
    term: BowTerm;
    lines: string[];
  }
  const sections: TermSection[] = [];
  let currentSection: TermSection | null = null;

  for (const line of rawLines) {
    if (isAppendixStart(line)) {
      break;
    }
    const termMatch = line.match(TERM_HEADER_RE);
    if (termMatch?.[1]) {
      currentSection = {
        term: normalizeBowTerm(termMatch[1]),
        lines: [],
      };
      sections.push(currentSection);
      continue;
    }
    if (currentSection) {
      currentSection.lines.push(line);
    }
  }

  const results: ParsedBowRow[] = [];

  for (const section of sections) {
    const headerIdx = section.lines.findIndex(
      (l) =>
        (/\b(Week|Linggo)\b/i.test(l) &&
          /\b(Learning\s+Competenc(?:y|ies)|Kasanayang\s+Pampagkatuto)\b/i.test(
            l,
          )) ||
        /^\s*Learning\s+Competencies\s*$/i.test(l),
    );
    if (headerIdx < 0) continue;

    const metaLines = section.lines.slice(0, headerIdx);
    const headerLine = section.lines[headerIdx]!;
    const tableLines = section.lines.slice(headerIdx + 1);

    const { contentStandard, performanceStandard } = extractStandards(metaLines);

    const { blocks, suggestedPerformanceTasks } = parseTabularTerm(
      tableLines,
      headerLine,
    );

    let lastComponent = meta.defaultComponent;
    let lastTopic = meta.sector ?? section.term;

    for (const block of blocks) {
      const { component, contentTopic, competencies } =
        extractCompetenciesFromLcLines(block.lcLines, lastComponent, lastTopic);
      lastComponent = component;
      lastTopic = contentTopic;

      const suggestedActivities = formatBulletLines(block.actLines);
      const weekRange = collapseSpaces(block.weekRange);

      for (const lc of competencies) {
        if (!lc) continue;
        results.push({
          gradeLevels: [...meta.gradeLevels],
          component,
          sector: meta.sector,
          sectorDescription: meta.sectorDescription,
          term: section.term,
          weekRange,
          contentTopic,
          contentStandard,
          performanceStandard,
          learningCompetency: lc,
          suggestedActivities,
          suggestedPerformanceTasks,
          sourceDocument: meta.sourceDocument,
        });
      }
    }
  }

  return results;
}

export interface MergeBowStats {
  matchedCgCount: number;
  standaloneAddedCount: number;
  totalCatalogCount: number;
}

export interface MergeBowResult {
  catalog: CurriculumCompetency[];
  stats: MergeBowStats;
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’`"“”.,;:!?()[\]{}\/\\–—-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSectorForMatch(sector: string | null): string {
  if (!sector) return "";
  return normalizeForMatch(sector).replace(/s\b/g, "");
}

function competencySimilarity(a: string, b: string): number {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (
    Math.min(na.length, nb.length) >= 20 &&
    (na.includes(nb) || nb.includes(na))
  ) {
    return 0.92;
  }

  const tokensA = new Set(na.split(" ").filter((t) => t.length > 1));
  const tokensB = new Set(nb.split(" ").filter((t) => t.length > 1));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let overlap = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) overlap += 1;
  }
  return (2 * overlap) / (tokensA.size + tokensB.size);
}

function sameGradeLevels(
  a: readonly GradeLevel[],
  b: readonly GradeLevel[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every((g, i) => g === b[i]);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

const TERM_ORDER: Record<BowTerm, number> = {
  "First Term": 1,
  "Second Term": 2,
  "Third Term": 3,
  "One-Term": 4,
};

function buildBudgetOfWorkInfo(row: ParsedBowRow): BudgetOfWorkInfo {
  return {
    term: row.term,
    weekRange: row.weekRange,
    suggestedActivities: row.suggestedActivities,
    suggestedPerformanceTasks: row.suggestedPerformanceTasks,
    sourceDocument: row.sourceDocument,
  };
}

const COMPETENCY_ACTION_VERBS = new Set([
  "analyze",
  "apply",
  "appreciate",
  "assemble",
  "assess",
  "bake",
  "calculate",
  "check",
  "cite",
  "classify",
  "clean",
  "compare",
  "compute",
  "conceptualize",
  "configure",
  "construct",
  "convert",
  "cook",
  "create",
  "critique",
  "cut",
  "define",
  "demonstrate",
  "describe",
  "design",
  "determine",
  "develop",
  "differentiate",
  "discuss",
  "distinguish",
  "draft",
  "draw",
  "embed",
  "enumerate",
  "evaluate",
  "examine",
  "execute",
  "explain",
  "explore",
  "familiarize",
  "follow",
  "formulate",
  "handle",
  "harvest",
  "identify",
  "illustrate",
  "inspect",
  "install",
  "interpret",
  "label",
  "layout",
  "list",
  "maintain",
  "make",
  "manage",
  "market",
  "measure",
  "name",
  "navigate",
  "observe",
  "operate",
  "organize",
  "outline",
  "perform",
  "plan",
  "plant",
  "practice",
  "prepare",
  "present",
  "produce",
  "promote",
  "recite",
  "recognize",
  "recommend",
  "record",
  "reflect",
  "repair",
  "report",
  "select",
  "sell",
  "serve",
  "sew",
  "show",
  "solve",
  "state",
  "store",
  "summarize",
  "test",
  "trace",
  "troubleshoot",
  "understand",
  "use",
  "utilize",
  "value",
  "verify",
  "write",
]);

function parseWeekBounds(
  weekRange: string,
): { start: number; end: number } | null {
  const matches = weekRange.match(/\d+/g);
  if (!matches || matches.length === 0) return null;
  const nums = matches.map((m) => Number.parseInt(m, 10));
  return {
    start: Math.min(...nums),
    end: Math.max(...nums),
  };
}

function mergeWeekRanges(existing: string, incoming: string): string {
  const a = parseWeekBounds(existing);
  const b = parseWeekBounds(incoming);
  if (!a || !b) return existing || incoming;
  const start = Math.min(a.start, b.start);
  const end = Math.max(a.end, b.end);
  return start === end ? String(start) : `${start} to ${end}`;
}

function isSubTopicUnpackingPhrase(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 12) return false;
  const firstWord = (words[0] ?? "").toLowerCase().replace(/[^a-z-]/g, "");
  if (!firstWord || COMPETENCY_ACTION_VERBS.has(firstWord)) return false;
  return true;
}

function appendSubTopicUnique(subTopics: string[], rawTopic: string): void {
  const cleaned = rawTopic.trim().replace(/[.:\s]+$/, "");
  const norm = normalizeForMatch(cleaned);
  if (!norm) return;
  if (subTopics.some((existing) => normalizeForMatch(existing) === norm)) {
    return;
  }
  subTopics.push(cleaned);
}

interface ActiveCgMatch {
  item: CurriculumCompetency;
  sourceDocument: string;
  gradeKey: string;
  component: TleComponent;
  sectorNorm: string;
  term: BowTerm;
  lastWeekEnd: number | null;
}

/**
 * Deterministically and idempotently merges parsed Budget of Work rows into
 * the curriculum catalog:
 * - Enriches matching Grade 7-10 CG competencies in place (preserving customNotes).
 * - Rolls contiguous weekly sub-topic unpacking rows onto their parent matched CG competency.
 * - Adds unmatched Grade 7-10 BoW rows and all Grade 11-12 BoW rows as standalone
 *   built-in competencies with deterministic `bow-*` IDs.
 * - Preserves all existing custom competencies untouched.
 */
export function mergeBowIntoCatalog(
  existingCatalog: readonly CurriculumCompetency[],
  parsedRows: readonly ParsedBowRow[],
): MergeBowResult {
  // Base built-in CG items (strip previously generated standalone `bow-*` items and stale BoW metadata for clean re-ingestion)
  const cgItems: CurriculumCompetency[] = existingCatalog
    .filter((item) => item.source === "built-in" && !item.id.startsWith("bow-"))
    .map((item) => {
      const { budgetOfWork: _staleBow, ...rest } = item;
      return {
        ...rest,
        gradeLevels: [...item.gradeLevels],
        quarters: [...item.quarters],
        contentSubTopics: [...item.contentSubTopics],
      };
    });

  const customItems: CurriculumCompetency[] = existingCatalog
    .filter((item) => item.source === "custom")
    .map((item) => ({ ...item }));

  const matchedCgIds = new Set<string>();
  const activityChunksByCgId = new Map<string, string[]>();
  const unmatchedRows: ParsedBowRow[] = [];
  let activeMatch: ActiveCgMatch | null = null;

  for (const row of parsedRows) {
    const canMatchCg = row.gradeLevels.every((g) => g <= 10);
    if (!canMatchCg) {
      activeMatch = null;
      unmatchedRows.push(row);
      continue;
    }

    const rowSectorNorm = normalizeSectorForMatch(row.sector);
    const rowGradeKey = row.gradeLevels.join("-");
    let bestItem: CurriculumCompetency | null = null;
    let bestScore = 0;

    for (const cg of cgItems) {
      if (cg.component !== row.component) continue;
      if (!sameGradeLevels(cg.gradeLevels, row.gradeLevels)) continue;
      if (
        row.gradeLevels.includes(9) &&
        rowSectorNorm &&
        normalizeSectorForMatch(cg.sector) !== rowSectorNorm
      ) {
        continue;
      }

      const rawScore = competencySimilarity(
        cg.learningCompetency,
        row.learningCompetency,
      );
      if (rawScore < 0.72) continue;

      // Slight preference for not-yet-matched CG items to prevent collisions
      const adjustedScore = matchedCgIds.has(cg.id) ? rawScore - 0.05 : rawScore;
      if (adjustedScore > bestScore) {
        bestScore = adjustedScore;
        bestItem = cg;
      }
    }

    if (bestItem) {
      bestItem.budgetOfWork = buildBudgetOfWorkInfo(row);
      const initialAct = row.suggestedActivities.trim();
      activityChunksByCgId.set(bestItem.id, initialAct ? [initialAct] : []);
      matchedCgIds.add(bestItem.id);
      activeMatch = {
        item: bestItem,
        sourceDocument: row.sourceDocument,
        gradeKey: rowGradeKey,
        component: row.component,
        sectorNorm: rowSectorNorm,
        term: row.term,
        lastWeekEnd: parseWeekBounds(row.weekRange)?.end ?? null,
      };
      continue;
    }

    const rowBounds = parseWeekBounds(row.weekRange);
    const canRollIntoActive =
      activeMatch !== null &&
      activeMatch.item.budgetOfWork !== undefined &&
      activeMatch.sourceDocument === row.sourceDocument &&
      activeMatch.gradeKey === rowGradeKey &&
      activeMatch.component === row.component &&
      activeMatch.sectorNorm === rowSectorNorm &&
      activeMatch.term === row.term &&
      activeMatch.lastWeekEnd !== null &&
      rowBounds !== null &&
      rowBounds.start >= activeMatch.lastWeekEnd &&
      rowBounds.start <= activeMatch.lastWeekEnd + 1 &&
      isSubTopicUnpackingPhrase(row.learningCompetency);

    if (canRollIntoActive && activeMatch && rowBounds) {
      const parent = activeMatch.item;
      const bow = parent.budgetOfWork!;
      bow.weekRange = mergeWeekRanges(bow.weekRange, row.weekRange);

      const act = row.suggestedActivities.trim();
      if (act) {
        const chunks = activityChunksByCgId.get(parent.id) ?? [];
        if (!chunks.includes(act)) {
          chunks.push(act);
          activityChunksByCgId.set(parent.id, chunks);
          bow.suggestedActivities = chunks.join("\n");
        }
      }
      if (!bow.suggestedPerformanceTasks && row.suggestedPerformanceTasks) {
        bow.suggestedPerformanceTasks = row.suggestedPerformanceTasks;
      }

      appendSubTopicUnique(parent.contentSubTopics, row.learningCompetency);
      activeMatch.lastWeekEnd = Math.max(activeMatch.lastWeekEnd!, rowBounds.end);
    } else {
      activeMatch = null;
      unmatchedRows.push(row);
    }
  }

  // Sort standalone rows deterministically before assigning IDs
  const sortedStandalone = [...unmatchedRows].sort((a, b) => {
    const ga = a.gradeLevels[0] ?? 0;
    const gb = b.gradeLevels[0] ?? 0;
    if (ga !== gb) return ga - gb;
    if (a.component !== b.component) return a.component.localeCompare(b.component);
    const sa = a.sector ?? "";
    const sb = b.sector ?? "";
    if (sa !== sb) return sa.localeCompare(sb);
    const ta = TERM_ORDER[a.term] ?? 99;
    const tb = TERM_ORDER[b.term] ?? 99;
    if (ta !== tb) return ta - tb;
    if (a.sourceDocument !== b.sourceDocument) {
      return a.sourceDocument.localeCompare(b.sourceDocument);
    }
    return 0;
  });

  const groupCounters = new Map<string, number>();
  const standaloneItems: CurriculumCompetency[] = sortedStandalone.map((row) => {
    const gradeSlug = `g${row.gradeLevels.join("-")}`;
    const compSlug = slugify(row.component);
    const sectorSlug = row.sector ? slugify(row.sector) : "general";
    const termSlug = slugify(row.term);
    const groupKey = `${gradeSlug}-${compSlug}-${sectorSlug}-${termSlug}`;
    const seq = (groupCounters.get(groupKey) ?? 0) + 1;
    groupCounters.set(groupKey, seq);

    const id = `bow-${groupKey}-${String(seq).padStart(2, "0")}`;
    return {
      id,
      source: "built-in",
      gradeLevels: [...row.gradeLevels],
      quarters: [],
      quarterLabel: row.term,
      component: row.component,
      sector: row.sector,
      sectorDescription: row.sectorDescription,
      contentTopic: row.contentTopic || row.sector || row.term,
      contentSubTopics: [],
      contentStandard: row.contentStandard,
      performanceStandard: row.performanceStandard,
      competencyNumber: seq,
      learningCompetency: row.learningCompetency,
      budgetOfWork: buildBudgetOfWorkInfo(row),
    };
  });

  const catalog = [...cgItems, ...standaloneItems, ...customItems];

  return {
    catalog,
    stats: {
      matchedCgCount: matchedCgIds.size,
      standaloneAddedCount: standaloneItems.length,
      totalCatalogCount: catalog.length,
    },
  };
}

export interface CatalogHealthDocumentCount {
  document: string;
  count: number;
}

export interface CatalogHealthBucket {
  count: number;
  documents: CatalogHealthDocumentCount[];
}

export interface CatalogHealthReport {
  totalBuiltIn: number;
  missingContentStandard: CatalogHealthBucket;
  missingPerformanceStandard: CatalogHealthBucket;
  emptySuggestedActivities: CatalogHealthBucket;
  emptySuggestedPerformanceTasks: CatalogHealthBucket;
  unmatchedBowRows: CatalogHealthBucket;
}

function toSortedHealthBucket(
  countsByDoc: Map<string, number>,
): CatalogHealthBucket {
  const documents = [...countsByDoc.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([document, count]) => ({ document, count }));
  const count = documents.reduce((sum, entry) => sum + entry.count, 0);
  return { count, documents };
}

function recordHealthHit(countsByDoc: Map<string, number>, document: string): void {
  countsByDoc.set(document, (countsByDoc.get(document) ?? 0) + 1);
}

/**
 * Computes a deterministic catalog health report over built-in competencies
 * flagging missing standards, empty BoW activity/task columns, and unmatched
 * Grade 7-10 standalone BoW rows.
 */
export function computeCatalogHealthReport(
  catalog: readonly CurriculumCompetency[],
): CatalogHealthReport {
  const missingCs = new Map<string, number>();
  const missingPs = new Map<string, number>();
  const emptyAct = new Map<string, number>();
  const emptyPt = new Map<string, number>();
  const unmatchedBow = new Map<string, number>();

  let totalBuiltIn = 0;

  for (const item of catalog) {
    if (item.source !== "built-in") continue;
    totalBuiltIn += 1;

    const docLabel =
      item.budgetOfWork?.sourceDocument?.trim() || "(Curriculum Guide)";

    if (!item.contentStandard.trim()) {
      recordHealthHit(missingCs, docLabel);
    }
    if (!item.performanceStandard.trim()) {
      recordHealthHit(missingPs, docLabel);
    }

    if (item.budgetOfWork) {
      const bowDocLabel =
        item.budgetOfWork.sourceDocument?.trim() || "(Unknown BoW)";
      if (!item.budgetOfWork.suggestedActivities.trim()) {
        recordHealthHit(emptyAct, bowDocLabel);
      }
      if (!item.budgetOfWork.suggestedPerformanceTasks.trim()) {
        recordHealthHit(emptyPt, bowDocLabel);
      }
    }

    if (item.id.startsWith("bow-") && item.gradeLevels.every((g) => g <= 10)) {
      recordHealthHit(unmatchedBow, docLabel);
    }
  }

  return {
    totalBuiltIn,
    missingContentStandard: toSortedHealthBucket(missingCs),
    missingPerformanceStandard: toSortedHealthBucket(missingPs),
    emptySuggestedActivities: toSortedHealthBucket(emptyAct),
    emptySuggestedPerformanceTasks: toSortedHealthBucket(emptyPt),
    unmatchedBowRows: toSortedHealthBucket(unmatchedBow),
  };
}

function formatHealthBucket(label: string, bucket: CatalogHealthBucket): string[] {
  if (bucket.count === 0) {
    return [`  ${label}: 0`];
  }
  const noun = bucket.documents.length === 1 ? "document" : "documents";
  const lines = [
    `  ${label}: ${bucket.count} across ${bucket.documents.length} ${noun}`,
  ];
  for (const doc of bucket.documents) {
    lines.push(`    - ${doc.document} (${doc.count})`);
  }
  return lines;
}

/**
 * Formats a CatalogHealthReport into a deterministic human-readable CLI report.
 */
export function formatCatalogHealthReport(report: CatalogHealthReport): string {
  const lines = [
    `Catalog Health Report (${report.totalBuiltIn} built-in competencies):`,
    ...formatHealthBucket(
      "Missing Content Standard",
      report.missingContentStandard,
    ),
    ...formatHealthBucket(
      "Missing Performance Standard",
      report.missingPerformanceStandard,
    ),
    ...formatHealthBucket(
      "Empty Suggested Activities",
      report.emptySuggestedActivities,
    ),
    ...formatHealthBucket(
      "Empty Suggested Performance Tasks",
      report.emptySuggestedPerformanceTasks,
    ),
    ...formatHealthBucket(
      "Unmatched Grade 7-10 BoW Rows",
      report.unmatchedBowRows,
    ),
  ];
  return lines.join("\n");
}
