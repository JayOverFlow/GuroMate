import { renderInlineTokens } from "./LessonRichText";

export interface IntentionsListColumnProps {
  title: string;
  items: readonly string[];
}

export function IntentionsListColumn({
  title,
  items,
}: IntentionsListColumnProps) {
  const cleaned = items.map((item) => item.trim()).filter(Boolean);
  return (
    <div className="flex flex-col gap-gutter-xs rounded bg-surface-container-low/60 border border-outline-variant/70 p-gutter-md min-w-0">
      <h3 className="font-label text-label-md uppercase tracking-wide text-primary">
        {title}
      </h3>
      {cleaned.length === 0 ? (
        <p className="font-body text-body-sm italic text-on-surface-variant">
          —
        </p>
      ) : cleaned.length === 1 ? (
        <p className="font-body text-body-sm text-on-surface leading-relaxed">
          {renderInlineTokens(cleaned[0]!)}
        </p>
      ) : (
        <ul className="list-disc pl-4 flex flex-col gap-1 font-body text-body-sm text-on-surface marker:text-primary">
          {cleaned.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInlineTokens(item)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
