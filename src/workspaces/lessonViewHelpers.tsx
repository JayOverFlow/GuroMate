import type { ReactNode } from "react";

export async function readErrorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string; message?: string };
    return data.error || data.message || `Request failed (HTTP ${res.status}).`;
  } catch {
    return `Request failed (HTTP ${res.status}).`;
  }
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={idx} className="font-semibold text-on-surface">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("_") && part.endsWith("_")) {
      return (
        <em key={idx} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    return part;
  });
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
          <li key={i}>{renderInlineMarkdown(item)}</li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  lines.forEach((line, idx) => {
    if (line.startsWith("- ")) {
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
          {renderInlineMarkdown(line.slice(2))}
        </h2>,
      );
    } else if (line.startsWith("## ")) {
      blocks.push(
        <h3
          key={idx}
          className="font-title text-title-lg text-primary mt-3 pt-2 border-t border-outline-variant"
        >
          {renderInlineMarkdown(line.slice(3))}
        </h3>,
      );
    } else if (line.startsWith("### ")) {
      blocks.push(
        <h4
          key={idx}
          className="font-title text-title-md text-on-surface mt-2"
        >
          {renderInlineMarkdown(line.slice(4))}
        </h4>,
      );
    } else {
      blocks.push(
        <p key={idx} className="font-body text-body-md text-on-surface">
          {renderInlineMarkdown(line)}
        </p>,
      );
    }
  });
  flushList(lines.length);
  return blocks;
}
