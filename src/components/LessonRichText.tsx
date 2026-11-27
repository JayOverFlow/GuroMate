import type { ReactNode } from "react";
import {
  parseInlineRichText,
  parseRichTextBlocks,
} from "../utils/lessonRichText";

export function renderInlineTokens(text: string): ReactNode[] {
  return parseInlineRichText(text).map((token, idx) => {
    if (token.type === "bold-italic") {
      return (
        <strong key={idx} className="font-semibold text-on-surface">
          <em className="italic">{token.text}</em>
        </strong>
      );
    }
    if (token.type === "bold") {
      return (
        <strong key={idx} className="font-semibold text-on-surface">
          {token.text}
        </strong>
      );
    }
    if (token.type === "italic") {
      return (
        <em key={idx} className="italic">
          {token.text}
        </em>
      );
    }
    return token.text;
  });
}

export interface LessonRichTextProps {
  text: string;
  emptyPlaceholder?: string;
  className?: string;
}

export function LessonRichText({
  text,
  emptyPlaceholder = "—",
  className = "",
}: LessonRichTextProps) {
  const blocks = parseRichTextBlocks(text);

  if (blocks.length === 0) {
    return (
      <p
        className={`font-body text-body-md italic text-on-surface-variant ${className}`.trim()}
      >
        {emptyPlaceholder}
      </p>
    );
  }

  return (
    <div className={`flex flex-col gap-gutter-sm ${className}`.trim()}>
      {blocks.map((block, idx) => {
        if (block.type === "bullet-list") {
          return (
            <ul
              key={idx}
              className="list-disc pl-5 flex flex-col gap-1 font-body text-body-md text-on-surface marker:text-primary"
            >
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx}>{renderInlineTokens(item)}</li>
              ))}
            </ul>
          );
        }

        if (block.type === "ordered-list") {
          return (
            <ol
              key={idx}
              className="flex flex-col gap-1.5 font-body text-body-md text-on-surface"
            >
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx} className="flex items-start gap-gutter-sm">
                  <span className="font-mono text-mono-md font-semibold text-primary tabular-nums shrink-0">
                    {item.number}.
                  </span>
                  <span className="min-w-0">{renderInlineTokens(item.text)}</span>
                </li>
              ))}
            </ol>
          );
        }

        if (block.type === "quiz-list") {
          return (
            <ol key={idx} className="flex flex-col gap-gutter-sm">
              {block.items.map((item, itemIdx) => (
                <li
                  key={itemIdx}
                  className="rounded bg-surface-container-low/70 border border-outline-variant/80 p-gutter-sm flex flex-col gap-gutter-xs"
                >
                  <div className="flex items-start gap-gutter-sm font-body text-body-md text-on-surface">
                    <span className="font-mono text-mono-md font-semibold text-primary tabular-nums shrink-0">
                      {item.number}.
                    </span>
                    <span className="min-w-0 font-medium">
                      {renderInlineTokens(item.prompt)}
                    </span>
                  </div>

                  {item.choices.length > 0 && (
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-gutter-md gap-y-1 pl-6 font-body text-body-sm text-on-surface">
                      {item.choices.map((choice, cIdx) => (
                        <li
                          key={cIdx}
                          className="flex items-start gap-1.5 min-w-0"
                        >
                          <span className="font-mono text-label-md font-semibold text-on-surface-variant shrink-0">
                            {choice.label})
                          </span>
                          <span className="min-w-0">
                            {renderInlineTokens(choice.text)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {item.notes.length > 0 && (
                    <div className="flex flex-col gap-0.5 pl-6 font-body text-body-sm text-on-surface-variant">
                      {item.notes.map((note, nIdx) => (
                        <p key={nIdx}>{renderInlineTokens(note)}</p>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          );
        }

        return (
          <p
            key={idx}
            className="font-body text-body-md text-on-surface leading-relaxed"
          >
            {renderInlineTokens(block.text)}
          </p>
        );
      })}
    </div>
  );
}
