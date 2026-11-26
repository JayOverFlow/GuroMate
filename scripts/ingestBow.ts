import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  mergeBowIntoCatalog,
  parseBowDocument,
  type ParsedBowRow,
} from "../src/engine/bowIngestion.ts";
import type { CurriculumCompetency } from "../src/engine/types.ts";

function parseArgs(argv: string[]): { sourceDir: string; catalogPath: string } {
  let sourceDir = path.resolve(process.cwd(), "Budget of Works");
  let catalogPath = path.resolve(
    process.cwd(),
    "src/engine/curriculumCatalog.json",
  );

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--source" && argv[i + 1]) {
      sourceDir = path.resolve(process.cwd(), argv[i + 1]!);
      i += 1;
    } else if (arg === "--catalog" && argv[i + 1]) {
      catalogPath = path.resolve(process.cwd(), argv[i + 1]!);
      i += 1;
    }
  }

  return { sourceDir, catalogPath };
}

function listPdfFiles(rootDir: string): string[] {
  const results: string[] = [];

  function walk(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) {
        results.push(fullPath);
      }
    }
  }

  walk(rootDir);
  return results;
}

function extractPdfLayoutText(pdfPath: string): string {
  return execFileSync("pdftotext", ["-layout", pdfPath, "-"], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

function main(): void {
  const { sourceDir, catalogPath } = parseArgs(process.argv.slice(2));
  const pdfFiles = listPdfFiles(sourceDir);

  if (pdfFiles.length === 0) {
    throw new Error(`No PDF files found under ${sourceDir}`);
  }

  const allParsedRows: ParsedBowRow[] = [];
  const emptyFiles: string[] = [];

  for (const pdfPath of pdfFiles) {
    const relativePath = path.relative(sourceDir, pdfPath).replace(/\\/g, "/");
    const text = extractPdfLayoutText(pdfPath);
    const rows = parseBowDocument({ relativePath, text });
    if (rows.length === 0) {
      emptyFiles.push(relativePath);
    }
    allParsedRows.push(...rows);
  }

  const existingCatalog = JSON.parse(
    readFileSync(catalogPath, "utf8"),
  ) as CurriculumCompetency[];

  const merged = mergeBowIntoCatalog(existingCatalog, allParsedRows);
  writeFileSync(
    catalogPath,
    `${JSON.stringify(merged.catalog, null, 2)}\n`,
    "utf8",
  );

  // Print concise deterministic summary
  const byGrade = new Map<number, { total: number; bow: number }>();
  const byComp = new Map<string, { total: number; bow: number }>();
  for (const item of merged.catalog) {
    const hasBow = Boolean(item.budgetOfWork);
    const compStats = byComp.get(item.component) ?? { total: 0, bow: 0 };
    compStats.total += 1;
    if (hasBow) compStats.bow += 1;
    byComp.set(item.component, compStats);

    for (const g of item.gradeLevels) {
      const gStats = byGrade.get(g) ?? { total: 0, bow: 0 };
      gStats.total += 1;
      if (hasBow) gStats.bow += 1;
      byGrade.set(g, gStats);
    }
  }

  console.log(`Ingested ${pdfFiles.length} PDFs (${allParsedRows.length} BoW rows parsed).`);
  console.log(
    `Catalog updated: ${merged.stats.totalCatalogCount} total (${merged.stats.matchedCgCount} CG matched, ${merged.stats.standaloneAddedCount} standalone BoW added).`,
  );
  if (emptyFiles.length > 0) {
    console.warn(`WARNING: ${emptyFiles.length} PDFs parsed 0 rows:\n  - ${emptyFiles.join("\n  - ")}`);
  }
  console.log("By Grade:");
  for (const g of [7, 8, 9, 10, 11, 12]) {
    const s = byGrade.get(g) ?? { total: 0, bow: 0 };
    console.log(`  Grade ${g}: ${s.total} total (${s.bow} with BoW)`);
  }
  console.log("By Component:");
  for (const c of ["ICT", "AFA", "FCS", "IA", "SHS_CORE"]) {
    const s = byComp.get(c) ?? { total: 0, bow: 0 };
    console.log(`  ${c}: ${s.total} total (${s.bow} with BoW)`);
  }
}

main();
