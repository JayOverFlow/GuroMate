import type { ReactNode } from "react";
import { renderInlineTokens } from "../components/LessonRichText";

export async function readErrorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string; message?: string };
    return data.error || data.message || `Request failed (HTTP ${res.status}).`;
  } catch {
    return `Request failed (HTTP ${res.status}).`;
  }
}

export function renderMarkdownBlocks(markdown: string): ReactNode[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = (keyPrefix: number) => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul
        key={`ul-${keyPrefix}`}
        className="list-disc list-inside flex flex-col gap-gutter-xs font-body text-body-md text-on-surface-variant pl-2"
      >
        {listItems.map((item, i) => (
          <li key={i}>{renderInlineTokens(item)}</li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  lines.forEach((line, idx) => {
    if (line.startsWith("- ") || line.startsWith("• ")) {
      listItems.push(line.slice(2));
      return;
    }
    flushList(idx);
    if (!line.trim()) return;
    if (line.startsWith("# ")) {
      blocks.push(
        <h2
          key={idx}
          className="font-headline text-headline-md text-on-surface mt-2"
        >
          {renderInlineTokens(line.slice(2))}
        </h2>,
      );
    } else if (line.startsWith("## ")) {
      blocks.push(
        <h3
          key={idx}
          className="font-title text-title-lg text-primary mt-3 pt-2 border-t border-outline-variant"
        >
          {renderInlineTokens(line.slice(3))}
        </h3>,
      );
    } else if (line.startsWith("### ")) {
      blocks.push(
        <h4
          key={idx}
          className="font-title text-title-md text-on-surface mt-2"
        >
          {renderInlineTokens(line.slice(4))}
        </h4>,
      );
    } else {
      blocks.push(
        <p key={idx} className="font-body text-body-md text-on-surface">
          {renderInlineTokens(line)}
        </p>,
      );
    }
  });
  flushList(lines.length);
  return blocks;
}
