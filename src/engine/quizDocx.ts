import { escapeXml } from "./dllDocx";
import { formatChoiceLabel, ROMAN_PARTS } from "./quiz";
import type { Quiz } from "./types";
import { createZip } from "./zip";

interface TextRunOptions {
  bold?: boolean;
  italic?: boolean;
  sizeHalfPt?: number;
}

function paragraph(
  text: string,
  opts: TextRunOptions & {
    spaceAfter?: number;
    spaceBefore?: number;
    indentLeft?: number;
    align?: "left" | "center";
  } = {},
): string {
  const pPrParts: string[] = [];
  if (opts.spaceBefore !== undefined || opts.spaceAfter !== undefined) {
    pPrParts.push(
      `<w:spacing${opts.spaceBefore !== undefined ? ` w:before="${opts.spaceBefore}"` : ""}${opts.spaceAfter !== undefined ? ` w:after="${opts.spaceAfter}"` : ""}/>`,
    );
  }
  if (opts.indentLeft !== undefined) {
    pPrParts.push(`<w:ind w:left="${opts.indentLeft}"/>`);
  }
  if (opts.align) {
    pPrParts.push(`<w:jc w:val="${opts.align}"/>`);
  }
  const pPr = pPrParts.length > 0 ? `<w:pPr>${pPrParts.join("")}</w:pPr>` : "";

  const rPrParts = ['<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>'];
  if (opts.bold) rPrParts.push("<w:b/>");
  if (opts.italic) rPrParts.push("<w:i/>");
  if (opts.sizeHalfPt !== undefined) {
    rPrParts.push(`<w:sz w:val="${opts.sizeHalfPt}"/>`);
  }
  const rPr = `<w:rPr>${rPrParts.join("")}</w:rPr>`;

  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function headerCell(text: string): string {
  return (
    `<w:tc><w:tcPr><w:tcW w:w="4680" w:type="dxa"/>` +
    `<w:tcMar><w:top w:w="60" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tcMar>` +
    `</w:tcPr>${paragraph(text, { sizeHalfPt: 22, spaceAfter: 0 })}</w:tc>`
  );
}

function buildStudentHeaderTable(gradeAndSection: string): string {
  const borders =
    '<w:tblBorders>' +
    '<w:top w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>' +
    '<w:left w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>' +
    '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>' +
    '<w:right w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>' +
    '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>' +
    '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>' +
    "</w:tblBorders>";

  return (
    `<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/>${borders}</w:tblPr>` +
    `<w:tblGrid><w:gridCol w:w="4680"/><w:gridCol w:w="4680"/></w:tblGrid>` +
    `<w:tr>${headerCell("Name: __________________________________")}${headerCell(`Grade & Section: ${gradeAndSection}`)}</w:tr>` +
    `<w:tr>${headerCell("Date: __________________")}${headerCell("Score: __________")}</w:tr>` +
    "</w:tbl>"
  );
}

/** Builds OOXML `word/document.xml` for a printable Quiz with page-separated Answer Key. */
export function buildQuizDocumentXml(quiz: Quiz): string {
  const bodyParts: string[] = [
    paragraph(quiz.title || "Formative Quiz", {
      bold: true,
      sizeHalfPt: 28,
      align: "center",
      spaceAfter: 60,
    }),
    paragraph(`Learning Area/s: ${quiz.learningAreas}`, {
      italic: true,
      sizeHalfPt: 21,
      align: "center",
      spaceAfter: 140,
    }),
    buildStudentHeaderTable(quiz.gradeAndSection),
    paragraph("", { spaceAfter: 80 }),
  ];

  quiz.sections.forEach((section, sIdx) => {
    const roman = ROMAN_PARTS[sIdx] ?? String(sIdx + 1);
    bodyParts.push(
      paragraph(`Part ${roman}. ${section.title}`, {
        bold: true,
        sizeHalfPt: 23,
        spaceBefore: 140,
        spaceAfter: 40,
      }),
    );
    if (section.directions) {
      bodyParts.push(
        paragraph(`Directions: ${section.directions}`, {
          italic: true,
          sizeHalfPt: 21,
          spaceAfter: 80,
        }),
      );
    }

    section.items.forEach((item, iIdx) => {
      bodyParts.push(
        paragraph(`${iIdx + 1}. ${item.prompt}`, {
          sizeHalfPt: 22,
          spaceAfter: 40,
        }),
      );
      if (section.type === "multipleChoice" && item.choices) {
        item.choices.forEach((choice, cIdx) => {
          bodyParts.push(
            paragraph(formatChoiceLabel(choice, cIdx), {
              sizeHalfPt: 21,
              indentLeft: 420,
              spaceAfter: 25,
            }),
          );
        });
      } else if (section.type === "essayRubric") {
        if (item.rubric) {
          bodyParts.push(
            paragraph(`Rubric: ${item.rubric}`, {
              italic: true,
              sizeHalfPt: 20,
              indentLeft: 420,
              spaceAfter: 40,
            }),
          );
        }
        bodyParts.push(
          paragraph("________________________________________________________________________", {
            sizeHalfPt: 21,
            indentLeft: 420,
            spaceAfter: 40,
          }),
        );
      }
    });
  });

  // Hard page break separating student worksheet from Answer Key
  bodyParts.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');

  bodyParts.push(
    paragraph(`Answer Key — ${quiz.title || "Formative Quiz"}`, {
      bold: true,
      sizeHalfPt: 26,
      spaceAfter: 120,
    }),
  );

  quiz.sections.forEach((section, sIdx) => {
    const roman = ROMAN_PARTS[sIdx] ?? String(sIdx + 1);
    bodyParts.push(
      paragraph(`Part ${roman}. ${section.title}`, {
        bold: true,
        sizeHalfPt: 22,
        spaceBefore: 100,
        spaceAfter: 40,
      }),
    );
    section.items.forEach((item, iIdx) => {
      const rubricSuffix =
        section.type === "essayRubric" && item.rubric
          ? ` (Rubric: ${item.rubric})`
          : "";
      bodyParts.push(
        paragraph(`${iIdx + 1}. ${item.answer || "—"}${rubricSuffix}`, {
          sizeHalfPt: 21,
          indentLeft: 320,
          spaceAfter: 30,
        }),
      );
    });
  });

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    "<w:body>" +
    bodyParts.join("") +
    '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>' +
    "</w:body></w:document>"
  );
}

const CONTENT_TYPES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  "</Types>";

const PACKAGE_RELS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  "</Relationships>";

/** Packages a printable Quiz into a valid in-memory `.docx` ZIP archive. */
export function buildQuizDocxBuffer(quiz: Quiz): Buffer {
  const documentXml = buildQuizDocumentXml(quiz);
  return createZip([
    { name: "[Content_Types].xml", data: Buffer.from(CONTENT_TYPES_XML, "utf8") },
    { name: "_rels/.rels", data: Buffer.from(PACKAGE_RELS_XML, "utf8") },
    { name: "word/document.xml", data: Buffer.from(documentXml, "utf8") },
  ]);
}
