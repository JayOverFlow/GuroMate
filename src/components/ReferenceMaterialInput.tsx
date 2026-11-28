import { useRef, useState, type ChangeEvent } from "react";
import {
  MAX_REFERENCE_FILE_BYTES,
  MAX_REFERENCE_MATERIAL_CHARS,
} from "../engine/lessonHelpers";
import type { ReferenceMaterialExtractResult } from "../engine/types";
import { readErrorMessage } from "../workspaces/lessonViewHelpers";

const INPUT_CLASS =
  "w-full px-gutter-sm py-gutter-xs rounded bg-surface-container-lowest border border-outline-variant text-body-md text-on-surface placeholder:text-on-surface-variant focus-visible:outline-2 focus-visible:outline-primary focus:border-primary";


function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error(`Could not read "${file.name}" from your computer.`));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

export interface ReferenceMaterialInputProps {
  baseId: string;
  sourceLabel: string;
  text: string;
  inheritedNote?: string;
  onChangeSourceLabel: (value: string) => void;
  onChangeText: (value: string) => void;
  onClear: () => void;
}

export function ReferenceMaterialInput({
  baseId,
  sourceLabel,
  text,
  inheritedNote,
  onChangeSourceLabel,
  onChangeText,
  onClear,
}: ReferenceMaterialInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractInfo, setExtractInfo] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);

  const labelId = `${baseId}-ref-source-label`;
  const textId = `${baseId}-ref-text`;
  const fileId = `${baseId}-ref-file`;
  const overLimit = text.length > MAX_REFERENCE_MATERIAL_CHARS;

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setExtractError(null);
    setExtractInfo(null);

    if (file.size > MAX_REFERENCE_FILE_BYTES) {
      setExtractError(
        `"${file.name}" exceeds the 10 MB file limit. Try a smaller file or paste key excerpts directly.`,
      );
      return;
    }

    setExtracting(true);
    try {
      const dataBase64 = await readFileAsBase64(file);
      const res = await fetch("/api/reference-material/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          dataBase64,
        }),
      });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res));
      }
      const extracted = (await res.json()) as ReferenceMaterialExtractResult;
      onChangeSourceLabel(extracted.sourceLabel);
      onChangeText(extracted.text);
      setExtractInfo(
        extracted.truncated
          ? `Extracted ${extracted.text.length.toLocaleString()} of ${extracted.originalLength.toLocaleString()} characters from "${extracted.sourceLabel}" (capped for prompt safety). Review or trim below before generating.`
          : `Extracted ${extracted.text.length.toLocaleString()} characters from "${extracted.sourceLabel}". Review or edit below before generating.`,
      );
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : String(err));
    } finally {
      setExtracting(false);
    }
  }

  function handleClear() {
    setExtractError(null);
    setExtractInfo(null);
    onClear();
  }

  return (
    <div className="p-gutter-md rounded bg-surface-container-low border border-outline-variant flex flex-col gap-gutter-sm">
      <div className="flex flex-wrap items-center justify-between gap-gutter-xs">
        <div className="flex flex-col">
          <span className="font-title text-title-md text-on-surface">
            Optional Reference Material
          </span>
          <span className="font-body text-body-sm text-on-surface-variant">
            {inheritedNote ||
              "Paste excerpts or extract plain text from a local .txt, .docx, or .pdf (Lesson Exemplar, LAS, Learner's Material, or TESDA TR) — never written into Learner Context."}
          </span>
        </div>

        <div className="flex items-center gap-gutter-xs">
          <input
            ref={fileInputRef}
            id={fileId}
            type="file"
            accept=".txt,.docx,.pdf"
            onChange={(e) => void handleFileChange(e)}
            className="sr-only"
          />
          <button
            type="button"
            disabled={extracting}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-gutter-xs px-gutter-sm py-gutter-xs rounded bg-surface-container-lowest border border-outline-variant font-label text-label-md text-primary hover:bg-surface-container disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
          >
            <span
              className="material-symbols-outlined text-title-md"
              aria-hidden="true"
            >
              upload_file
            </span>
            <span>
              {extracting ? "Extracting..." : "Attach .txt / .docx / .pdf"}
            </span>
          </button>
          {(sourceLabel.trim() || text.trim()) && (
            <button
              type="button"
              onClick={handleClear}
              className="px-gutter-sm py-gutter-xs rounded bg-surface-container-lowest border border-outline-variant font-label text-label-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-primary"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {extractError && (
        <div
          role="alert"
          className="px-gutter-sm py-gutter-xs rounded border border-error bg-error-container text-on-error-container font-body text-body-sm flex items-start gap-gutter-xs"
        >
          <span
            className="material-symbols-outlined text-body-md mt-[2px] shrink-0"
            aria-hidden="true"
          >
            error
          </span>
          <span>{extractError}</span>
        </div>
      )}

      {extractInfo && (
        <div
          role="status"
          className="px-gutter-sm py-gutter-xs rounded border border-outline-variant bg-surface-container-lowest text-on-surface font-body text-body-sm flex items-start gap-gutter-xs"
        >
          <span
            className="material-symbols-outlined text-body-md text-primary mt-[2px] shrink-0"
            aria-hidden="true"
          >
            description
          </span>
          <span>{extractInfo}</span>
        </div>
      )}

      <div className="flex flex-col gap-gutter-xs">
        <label
          htmlFor={labelId}
          className="font-label text-label-sm text-on-surface-variant"
        >
          Source Label (optional)
        </label>
        <input
          id={labelId}
          type="text"
          value={sourceLabel}
          onChange={(e) => onChangeSourceLabel(e.target.value)}
          placeholder="e.g. DepEd Grade 8 ICT Lesson Exemplar Q1, TESDA EIM NC II TR..."
          className={INPUT_CLASS}
        />
      </div>

      <div className="flex flex-col gap-gutter-xs">
        <div className="flex items-center justify-between gap-gutter-xs">
          <label
            htmlFor={textId}
            className="font-label text-label-sm text-on-surface-variant"
          >
            Reference Excerpt Preview (editable)
          </label>
          <span
            className={`font-mono text-label-sm tabular-nums ${
              overLimit ? "text-error" : "text-on-surface-variant"
            }`}
          >
            {text.length.toLocaleString()} /{" "}
            {MAX_REFERENCE_MATERIAL_CHARS.toLocaleString()} chars
            {overLimit ? " (will be capped on generate)" : ""}
          </span>
        </div>
        <textarea
          id={textId}
          rows={3}
          value={text}
          onChange={(e) => {
            onChangeText(e.target.value);
            if (extractInfo) setExtractInfo(null);
          }}
          placeholder="Paste key technical facts, procedures, tools, OHS/PPE steps, or worked examples—or attach a local file above to extract plain text."
          className={INPUT_CLASS}
        />
      </div>
    </div>
  );
}
