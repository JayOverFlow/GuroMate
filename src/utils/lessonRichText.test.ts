import { describe, expect, it } from "vitest";
import { parseInlineRichText, parseRichTextBlocks } from "./lessonRichText";

describe("parseInlineRichText", () => {
  it("parses plain text and **bold** spans", () => {
    expect(parseInlineRichText("")).toEqual([]);
    expect(parseInlineRichText("Plain lesson text.")).toEqual([
      { type: "text", text: "Plain lesson text." },
    ]);
    expect(
      parseInlineRichText("Apply **safety rules** before using **tools**."),
    ).toEqual([
      { type: "text", text: "Apply " },
      { type: "bold", text: "safety rules" },
      { type: "text", text: " before using " },
      { type: "bold", text: "tools" },
      { type: "text", text: "." },
    ]);
  });

  it("parses *italic* and _italic_ spans without corrupting identifiers, blanks, or math", () => {
    expect(
      parseInlineRichText(
        "Reflects Filipino *malasakit* and hospitality (*pagtitipon*) during meals.",
      ),
    ).toEqual([
      { type: "text", text: "Reflects Filipino " },
      { type: "italic", text: "malasakit" },
      { type: "text", text: " and hospitality (" },
      { type: "italic", text: "pagtitipon" },
      { type: "text", text: ") during meals." },
    ]);

    expect(
      parseInlineRichText("_(Left blank for manual completion)_"),
    ).toEqual([
      { type: "italic", text: "(Left blank for manual completion)" },
    ]);

    expect(
      parseInlineRichText(
        "Export SHS_CORE to DLL_ILAW_template.docx with Name: ________ and 2 * 3 * 4.",
      ),
    ).toEqual([
      {
        type: "text",
        text: "Export SHS_CORE to DLL_ILAW_template.docx with Name: ________ and 2 * 3 * 4.",
      },
    ]);

    expect(
      parseInlineRichText(
        "Compute 2*3*4 and a*b*c without italicizing middle terms.",
      ),
    ).toEqual([
      {
        type: "text",
        text: "Compute 2*3*4 and a*b*c without italicizing middle terms.",
      },
    ]);
  });

  it("handles mixed **bold**, *italic*, _italic_, and unclosed delimiters cleanly", () => {
    expect(
      parseInlineRichText("**Pre-lesson:** Use _guided_ demo and *peer* review (5* rating)."),
    ).toEqual([
      { type: "bold", text: "Pre-lesson:" },
      { type: "text", text: " Use " },
      { type: "italic", text: "guided" },
      { type: "text", text: " demo and " },
      { type: "italic", text: "peer" },
      { type: "text", text: " review (5* rating)." },
    ]);
  });

  it("parses nested bold and italic spans without leaving stray delimiters", () => {
    expect(parseInlineRichText("**bold *italic***")).toEqual([
      { type: "bold", text: "bold " },
      { type: "bold-italic", text: "italic" },
    ]);

    expect(parseInlineRichText("**bold _italic_** and more")).toEqual([
      { type: "bold", text: "bold " },
      { type: "bold-italic", text: "italic" },
      { type: "text", text: " and more" },
    ]);

    expect(parseInlineRichText("***bold italic***")).toEqual([
      { type: "bold-italic", text: "bold italic" },
    ]);

    expect(parseInlineRichText("*italic **bold** end*")).toEqual([
      { type: "italic", text: "italic " },
      { type: "bold-italic", text: "bold" },
      { type: "italic", text: " end" },
    ]);

    expect(parseInlineRichText("**keep 2*3*4 math**")).toEqual([
      { type: "bold", text: "keep 2*3*4 math" },
    ]);
  });
});

describe("parseRichTextBlocks", () => {
  it("returns empty list for blank text and groups paragraphs and • / - bullet lists", () => {
    expect(parseRichTextBlocks("")).toEqual([]);
    expect(parseRichTextBlocks("   \n\n  ")).toEqual([]);

    const sample = [
      "At the end of the session, learners should be able to:",
      "• Calculate step-by-step binary to decimal conversion",
      "• Perform individual conversion drills",
      "• Value the importance of *accuracy* in digital work",
      "",
      "- Printed conversion worksheet",
      "- Whiteboard and markers",
    ].join("\n");

    expect(parseRichTextBlocks(sample)).toEqual([
      {
        type: "paragraph",
        text: "At the end of the session, learners should be able to:",
      },
      {
        type: "bullet-list",
        items: [
          "Calculate step-by-step binary to decimal conversion",
          "Perform individual conversion drills",
          "Value the importance of *accuracy* in digital work",
        ],
      },
      {
        type: "bullet-list",
        items: ["Printed conversion worksheet", "Whiteboard and markers"],
      },
    ]);
  });

  it("groups numbered formative assessment items with A)–D) and indented A.–D. choices into quiz-list blocks", () => {
    const aiQuiz = [
      "Formative Assessment: Number Systems Quiz",
      "1. What is the decimal equivalent of binary 1010?",
      "A) 8",
      "B) 10",
      "C) 12",
      "D) 14",
      "",
      "2. Which number system uses base-16?",
      "A) Binary",
      "B) Octal",
      "C) Decimal",
      "D) Hexadecimal",
    ].join("\n");

    expect(parseRichTextBlocks(aiQuiz)).toEqual([
      {
        type: "paragraph",
        text: "Formative Assessment: Number Systems Quiz",
      },
      {
        type: "quiz-list",
        items: [
          {
            number: "1",
            prompt: "What is the decimal equivalent of binary 1010?",
            choices: [
              { label: "A", text: "8" },
              { label: "B", text: "10" },
              { label: "C", text: "12" },
              { label: "D", text: "14" },
            ],
            notes: [],
          },
          {
            number: "2",
            prompt: "Which number system uses base-16?",
            choices: [
              { label: "A", text: "Binary" },
              { label: "B", text: "Octal" },
              { label: "C", text: "Decimal" },
              { label: "D", text: "Hexadecimal" },
            ],
            notes: [],
          },
        ],
      },
    ]);

    const syncedQuiz = [
      "Formative Quiz: Kitchen Safety",
      "Part I. Multiple Choice",
      "Directions: Choose the best answer.",
      "1. Which tool measures dry ingredients accurately?",
      "   A. Liquid measuring cup",
      "   B. Dry measuring cup",
      "   C. Mixing bowl",
      "   D. Peeler",
      "2. Explain why knife edges must stay sharp.",
      "   Rubric: 2 pts accurate reason; 1 pt partial.",
    ].join("\n");

    expect(parseRichTextBlocks(syncedQuiz)).toEqual([
      { type: "paragraph", text: "Formative Quiz: Kitchen Safety" },
      { type: "paragraph", text: "Part I. Multiple Choice" },
      { type: "paragraph", text: "Directions: Choose the best answer." },
      {
        type: "quiz-list",
        items: [
          {
            number: "1",
            prompt: "Which tool measures dry ingredients accurately?",
            choices: [
              { label: "A", text: "Liquid measuring cup" },
              { label: "B", text: "Dry measuring cup" },
              { label: "C", text: "Mixing bowl" },
              { label: "D", text: "Peeler" },
            ],
            notes: [],
          },
          {
            number: "2",
            prompt: "Explain why knife edges must stay sharp.",
            choices: [],
            notes: ["Rubric: 2 pts accurate reason; 1 pt partial."],
          },
        ],
      },
    ]);
  });

  it("groups numbered steps without choices as an ordered-list block", () => {
    const flow = [
      "1. Introduce ICT sectors using local job cards.",
      "2. Demonstrate sector grouping on the board.",
      "3. Facilitate pair discussion and quick debrief.",
    ].join("\n");

    expect(parseRichTextBlocks(flow)).toEqual([
      {
        type: "ordered-list",
        items: [
          { number: "1", text: "Introduce ICT sectors using local job cards." },
          { number: "2", text: "Demonstrate sector grouping on the board." },
          { number: "3", text: "Facilitate pair discussion and quick debrief." },
        ],
      },
    ]);
  });

  it("handles CRLF, blank line before choices, trailing feedback after a quiz, and preserves non-bullet hyphens", () => {
    const text = [
      "-5 degrees is below freezing.",
      "A. Overview of tool safety.",
      "1. Which PPE protects the eyes?",
      "",
      "A) Safety goggles",
      "B) Apron",
      "C) Hairnet",
      "D) Slippers",
      "Feedback: Review answers aloud with the class.",
    ].join("\r\n");

    expect(parseRichTextBlocks(text)).toEqual([
      { type: "paragraph", text: "-5 degrees is below freezing." },
      { type: "paragraph", text: "A. Overview of tool safety." },
      {
        type: "quiz-list",
        items: [
          {
            number: "1",
            prompt: "Which PPE protects the eyes?",
            choices: [
              { label: "A", text: "Safety goggles" },
              { label: "B", text: "Apron" },
              { label: "C", text: "Hairnet" },
              { label: "D", text: "Slippers" },
            ],
            notes: [],
          },
        ],
      },
      {
        type: "paragraph",
        text: "Feedback: Review answers aloud with the class.",
      },
    ]);
  });
});
