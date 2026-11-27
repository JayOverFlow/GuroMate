export type InlineToken =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "italic"; text: string };

export interface QuizChoice {
  label: string;
  text: string;
}

export interface QuizQuestionItem {
  number: string;
  prompt: string;
  choices: QuizChoice[];
  notes: string[];
}

export interface OrderedListItem {
  number: string;
  text: string;
}

export type RichTextBlock =
  | { type: "paragraph"; text: string }
  | { type: "bullet-list"; items: string[] }
  | { type: "ordered-list"; items: OrderedListItem[] }
  | { type: "quiz-list"; items: QuizQuestionItem[] };

const WORD_OR_UNDERSCORE = /[A-Za-z0-9_]/;

function pushText(tokens: InlineToken[], text: string): void {
  if (!text) return;
  const last = tokens[tokens.length - 1];
  if (last && last.type === "text") {
    last.text += text;
  } else {
    tokens.push({ type: "text", text });
  }
}

function findClosingBold(text: string, startAfterOpen: number): number {
  if (startAfterOpen >= text.length || /\s/.test(text[startAfterOpen]!)) {
    return -1;
  }
  let idx = text.indexOf("**", startAfterOpen);
  while (idx !== -1) {
    if (idx > startAfterOpen && !/\s/.test(text[idx - 1]!)) {
      return idx;
    }
    idx = text.indexOf("**", idx + 2);
  }
  return -1;
}

function findClosingAsteriskItalic(text: string, startAfterOpen: number): number {
  if (
    startAfterOpen >= text.length ||
    /\s/.test(text[startAfterOpen]!) ||
    text[startAfterOpen] === "*"
  ) {
    return -1;
  }
  for (let j = startAfterOpen; j < text.length; j += 1) {
    if (text[j] !== "*") continue;
    // Skip double-asterisk delimiters when searching for single-asterisk close
    if (text[j + 1] === "*") {
      j += 1;
      continue;
    }
    if (j > startAfterOpen && !/\s/.test(text[j - 1]!)) {
      return j;
    }
  }
  return -1;
}

function findClosingUnderscoreItalic(
  text: string,
  openIdx: number,
): number {
  const prevChar = openIdx > 0 ? text[openIdx - 1]! : "";
  if (prevChar && WORD_OR_UNDERSCORE.test(prevChar)) {
    return -1;
  }
  const startAfterOpen = openIdx + 1;
  if (
    startAfterOpen >= text.length ||
    /\s/.test(text[startAfterOpen]!) ||
    text[startAfterOpen] === "_"
  ) {
    return -1;
  }
  for (let j = startAfterOpen; j < text.length; j += 1) {
    if (text[j] !== "_") continue;
    const nextChar = j + 1 < text.length ? text[j + 1]! : "";
    if (
      j > startAfterOpen &&
      !/\s/.test(text[j - 1]!) &&
      text[j - 1] !== "_" &&
      (!nextChar || !WORD_OR_UNDERSCORE.test(nextChar))
    ) {
      return j;
    }
  }
  return -1;
}

export function parseInlineRichText(text: string): InlineToken[] {
  if (!text) return [];
  const tokens: InlineToken[] = [];
  let i = 0;

  while (i < text.length) {
    if (text.startsWith("**", i)) {
      const closeIdx = findClosingBold(text, i + 2);
      if (closeIdx !== -1) {
        tokens.push({ type: "bold", text: text.slice(i + 2, closeIdx) });
        i = closeIdx + 2;
        continue;
      }
    }

    if (text[i] === "*" && text[i + 1] !== "*") {
      const closeIdx = findClosingAsteriskItalic(text, i + 1);
      if (closeIdx !== -1) {
        tokens.push({ type: "italic", text: text.slice(i + 1, closeIdx) });
        i = closeIdx + 1;
        continue;
      }
    }

    if (text[i] === "_") {
      const closeIdx = findClosingUnderscoreItalic(text, i);
      if (closeIdx !== -1) {
        tokens.push({ type: "italic", text: text.slice(i + 1, closeIdx) });
        i = closeIdx + 1;
        continue;
      }
    }

    pushText(tokens, text[i]!);
    i += 1;
  }

  return tokens;
}

const BULLET_LINE_RE = /^\s*(?:•\s*|\-\s+)(.+)$/;
const NUMBERED_LINE_RE = /^\s*(\d+)[.)]\s+(.+)$/;
const CHOICE_LINE_RE = /^\s*([A-Fa-f])[.)]\s+(.+)$/;
const INDENTED_LINE_RE = /^(?:\s{2,}|\t)(.+)$/;

function findNextNonBlankLine(lines: readonly string[], startIndex: number): string | null {
  for (let i = startIndex; i < lines.length; i += 1) {
    if (lines[i]!.trim()) return lines[i]!;
  }
  return null;
}

export function parseRichTextBlocks(text: string): RichTextBlock[] {
  if (!text.trim()) return [];
  const lines = text.split(/\r?\n/);
  const blocks: RichTextBlock[] = [];
  let bulletItems: string[] = [];
  let numberedItems: QuizQuestionItem[] = [];

  const flushBullets = () => {
    if (bulletItems.length > 0) {
      blocks.push({ type: "bullet-list", items: bulletItems });
      bulletItems = [];
    }
  };

  const flushNumbered = () => {
    if (numberedItems.length === 0) return;
    const hasQuizStructure = numberedItems.some(
      (item) => item.choices.length > 0 || item.notes.length > 0,
    );
    if (hasQuizStructure) {
      blocks.push({ type: "quiz-list", items: numberedItems });
    } else {
      blocks.push({
        type: "ordered-list",
        items: numberedItems.map((item) => ({
          number: item.number,
          text: item.prompt,
        })),
      });
    }
    numberedItems = [];
  };

  for (let idx = 0; idx < lines.length; idx += 1) {
    const rawLine = lines[idx]!;
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushBullets();
      if (numberedItems.length > 0) {
        const nextLine = findNextNonBlankLine(lines, idx + 1);
        if (
          nextLine &&
          (NUMBERED_LINE_RE.test(nextLine) || CHOICE_LINE_RE.test(nextLine))
        ) {
          continue;
        }
        flushNumbered();
      }
      continue;
    }

    if (numberedItems.length > 0) {
      const choiceMatch = rawLine.match(CHOICE_LINE_RE);
      if (choiceMatch) {
        numberedItems[numberedItems.length - 1]!.choices.push({
          label: choiceMatch[1]!.toUpperCase(),
          text: choiceMatch[2]!.trim(),
        });
        continue;
      }
    }

    const numberedMatch = rawLine.match(NUMBERED_LINE_RE);
    if (numberedMatch) {
      flushBullets();
      numberedItems.push({
        number: numberedMatch[1]!,
        prompt: numberedMatch[2]!.trim(),
        choices: [],
        notes: [],
      });
      continue;
    }

    const bulletMatch = rawLine.match(BULLET_LINE_RE);
    if (bulletMatch) {
      flushNumbered();
      bulletItems.push(bulletMatch[1]!.trim());
      continue;
    }

    if (numberedItems.length > 0) {
      const indentedMatch = rawLine.match(INDENTED_LINE_RE);
      if (indentedMatch) {
        numberedItems[numberedItems.length - 1]!.notes.push(
          indentedMatch[1]!.trim(),
        );
        continue;
      }
      flushNumbered();
    }

    flushBullets();
    blocks.push({ type: "paragraph", text: trimmed });
  }

  flushBullets();
  flushNumbered();
  return blocks;
}
