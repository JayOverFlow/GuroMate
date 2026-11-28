import { spawn } from "node:child_process";
import path from "node:path";
import { MAX_REFERENCE_MATERIAL_CHARS } from "./lessonHelpers";
import type {
  ReferenceMaterialExtractInput,
  ReferenceMaterialExtractResult,
} from "./types";
import { readZipEntry } from "./zip";

export class ReferenceMaterialError extends Error {}

export const MAX_REFERENCE_FILE_BYTES = 10 * 1024 * 1024;
export const SUPPORTED_REFERENCE_EXTENSIONS = [".txt", ".docx", ".pdf"] as const;
const PDF_EXTRACT_TIMEOUT_MS = 15_000;

function unescapeXmlEntities(value: string): string {
  return value.replace(
    /&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g,
    (match, entity: string) => {
      switch (entity) {
        case "amp":
          return "&";
        case "lt":
          return "<";
        case "gt":
          return ">";
        case "quot":
          return '"';
        case "apos":
          return "'";
        default: {
          if (entity.startsWith("#x") || entity.startsWith("#X")) {
            const code = Number.parseInt(entity.slice(2), 16);
            return Number.isFinite(code) ? String.fromCodePoint(code) : match;
          }
          if (entity.startsWith("#")) {
            const code = Number.parseInt(entity.slice(1), 10);
            return Number.isFinite(code) ? String.fromCodePoint(code) : match;
          }
          return match;
        }
      }
    },
  );
}

function normalizeExtractedText(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\f/g, "\n\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractTxtText(buffer: Buffer): string {
  if (buffer.includes(0)) {
    throw new ReferenceMaterialError(
      "Could not read .txt file because it appears to contain binary data. Upload a plain UTF-8 .txt file or paste excerpts directly.",
    );
  }
  return buffer.toString("utf8");
}

function extractDocxParagraphText(paragraphXml: string): string {
  const tokens: string[] = [];
  const tokenRe =
    /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab(?:\s[^>]*)?\/>|<w:(?:br|cr)(?:\s[^>]*)?\/>/g;
  for (const match of paragraphXml.matchAll(tokenRe)) {
    if (match[1] !== undefined) {
      tokens.push(unescapeXmlEntities(match[1]));
    } else if (match[0].startsWith("<w:tab")) {
      tokens.push("\t");
    } else {
      tokens.push("\n");
    }
  }
  return tokens.join("");
}

function extractDocxText(buffer: Buffer): string {
  let xml: string;
  try {
    xml = readZipEntry(buffer, "word/document.xml").toString("utf8");
  } catch {
    throw new ReferenceMaterialError(
      "Could not read .docx file. Ensure it is a valid, unencrypted Word (.docx) document.",
    );
  }

  const paragraphs: string[] = [];
  const pRe = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g;
  for (const match of xml.matchAll(pRe)) {
    const text = extractDocxParagraphText(match[1] ?? "");
    if (text.trim()) {
      paragraphs.push(text.trim());
    }
  }
  return paragraphs.join("\n");
}

function extractPdfText(buffer: Buffer): Promise<string> {
  const header = buffer.subarray(0, 1024).toString("latin1");
  if (!header.includes("%PDF-")) {
    return Promise.reject(
      new ReferenceMaterialError(
        "Could not read .pdf file. Ensure it is a valid, unencrypted PDF document.",
      ),
    );
  }

  return new Promise<string>((resolve, reject) => {
    const child = spawn("pdftotext", ["-enc", "UTF-8", "-", "-"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(
        new ReferenceMaterialError(
          "Timed out while extracting text from this PDF. Try pasting key excerpts directly.",
        ),
      );
    }, PDF_EXTRACT_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });
    child.on("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        new ReferenceMaterialError(
          "PDF text extraction is unavailable on this machine (pdftotext not found). Please paste key excerpts directly.",
        ),
      );
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
        const hint = /password|encrypt/i.test(stderr)
          ? "Password-protected PDFs are not supported."
          : "Ensure the PDF is valid and unencrypted, or paste key excerpts directly.";
        reject(new ReferenceMaterialError(`Could not extract text from PDF. ${hint}`));
        return;
      }
      resolve(Buffer.concat(stdoutChunks).toString("utf8"));
    });

    child.stdin.on("error", () => {
      // Ignore EPIPE if pdftotext exits early on malformed input; close handler reports error.
    });
    child.stdin.end(buffer);
  });
}

/** Extracts bounded plain text from a local .txt, .docx, or .pdf Reference Material buffer. */
export async function extractReferenceMaterialFromBuffer(
  filename: string,
  buffer: Buffer,
): Promise<ReferenceMaterialExtractResult> {
  const sourceLabel = path.basename(filename.trim());
  if (!sourceLabel) {
    throw new ReferenceMaterialError("A file name is required for Reference Material extraction.");
  }

  const ext = path.extname(sourceLabel).toLowerCase();
  if (
    !SUPPORTED_REFERENCE_EXTENSIONS.includes(
      ext as (typeof SUPPORTED_REFERENCE_EXTENSIONS)[number],
    )
  ) {
    throw new ReferenceMaterialError(
      `Unsupported file type "${ext || "unknown"}". Upload a .txt, .docx, or .pdf file, or paste excerpts directly.`,
    );
  }

  if (buffer.length === 0) {
    throw new ReferenceMaterialError("The uploaded file is empty.");
  }
  if (buffer.length > MAX_REFERENCE_FILE_BYTES) {
    throw new ReferenceMaterialError(
      `Reference file exceeds the ${Math.round(MAX_REFERENCE_FILE_BYTES / (1024 * 1024))} MB limit.`,
    );
  }

  let rawText: string;
  if (ext === ".txt") {
    rawText = extractTxtText(buffer);
  } else if (ext === ".docx") {
    rawText = extractDocxText(buffer);
  } else {
    rawText = await extractPdfText(buffer);
  }

  const normalized = normalizeExtractedText(rawText);
  if (!normalized) {
    if (ext === ".pdf") {
      throw new ReferenceMaterialError(
        "No readable text was found in this PDF. Scanned image-only PDFs are not supported—please paste key excerpts manually.",
      );
    }
    throw new ReferenceMaterialError("The uploaded file contains no readable text.");
  }

  const originalLength = normalized.length;
  const truncated = originalLength > MAX_REFERENCE_MATERIAL_CHARS;
  const text = truncated
    ? normalized.slice(0, MAX_REFERENCE_MATERIAL_CHARS).trimEnd()
    : normalized;

  return {
    sourceLabel,
    text,
    truncated,
    originalLength,
    maxLength: MAX_REFERENCE_MATERIAL_CHARS,
  };
}

/** Decodes base64 upload input and extracts plain text from a local Reference Material file. */
export async function extractReferenceMaterialFromInput(
  input: ReferenceMaterialExtractInput,
): Promise<ReferenceMaterialExtractResult> {
  const filename = typeof input.filename === "string" ? input.filename.trim() : "";
  const dataBase64 =
    typeof input.dataBase64 === "string" ? input.dataBase64.trim() : "";
  if (!filename) {
    throw new ReferenceMaterialError("filename is required.");
  }
  if (!dataBase64) {
    throw new ReferenceMaterialError("File content is empty.");
  }
  const buffer = Buffer.from(dataBase64, "base64");
  return extractReferenceMaterialFromBuffer(filename, buffer);
}
