import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { enforceProbeGradePolicy } from "@/ai/contracts/tasks";
import { governedAiTasks } from "@/ai/prompts/governed";
import { parseUploadedDocument, verifyQuotedEvidence } from "@/modules/corpus";
import {
  classifyImpact,
  classifyReviewState,
  traverseReviewedGraph,
} from "@/modules/graph";
import JSZip from "jszip";
import { PDFDocument, StandardFonts } from "pdf-lib";

describe("governed AI contracts and deterministic guards", () => {
  it("keeps every governed prompt schema-parseable", () => {
    expect(
      governedAiTasks.claimExtraction.outputSchema.parse({
        claims: [
          {
            text: "Use anticoagulation below the old threshold.",
            exactQuote: "Use anticoagulation below the old threshold.",
            evidence: {
              documentVersionId: "doc-v1",
              quote: "Use anticoagulation below the old threshold.",
              startOffset: null,
              endOffset: null,
              page: null,
              section: null,
              checksum: "sha256:test",
            },
            candidateSourceReferences: [],
            confidence: 0.8,
            ambiguity: null,
            reviewRequired: false,
          },
        ],
      }).claims[0]?.reviewRequired,
    ).toBe(false);

    expect(
      governedAiTasks.probeGrade.outputSchema.parse({
        answeredWith: "other",
        confidence: 0.4,
        matchedApprovedCaseRationale:
          "The answer does not map cleanly to either rule.",
        exactQuote: null,
        ambiguityReason: "Mentions both rules.",
        reviewRequired: true,
      }).answeredWith,
    ).toBe("other");

    expect(
      enforceProbeGradePolicy(
        {
          answeredWith: "old",
          confidence: 0.79,
          matchedApprovedCaseRationale: "Matches the old approved answer.",
          exactQuote: "Use 52",
          ambiguityReason: null,
          reviewRequired: false,
        },
        "Matches the old approved answer.",
      ),
    ).toMatchObject({ answeredWith: "other", reviewRequired: true });

    expect(
      enforceProbeGradePolicy(
        {
          answeredWith: "new",
          confidence: 0.92,
          matchedApprovedCaseRationale: "A different rationale.",
          exactQuote: "Use 68",
          ambiguityReason: null,
          reviewRequired: false,
        },
        "The approved new-rule rationale.",
      ),
    ).toMatchObject({ answeredWith: "other", reviewRequired: true });

    expect(
      enforceProbeGradePolicy(
        {
          answeredWith: "old",
          confidence: 0.8,
          matchedApprovedCaseRationale: "Matches the approved rationale.",
          exactQuote: "Use 52",
          ambiguityReason: null,
          reviewRequired: false,
        },
        "Matches the approved rationale.",
        "I would Use 52 for this case.",
      ),
    ).toMatchObject({
      answeredWith: "old",
      exactQuote: "Use 52",
      reviewRequired: false,
    });
  });

  it("verifies exact quotes and parses native text/html inputs", async () => {
    const text = "Protocol P-114: hold therapy when the threshold is 42.";
    expect(verifyQuotedEvidence(text, "threshold is 42")).toEqual({
      verified: true,
      startOffset: 38,
      endOffset: 53,
    });
    expect(verifyQuotedEvidence(text, "threshold is 43")).toEqual({
      verified: false,
    });

    const parsed = await parseUploadedDocument({
      filename: "protocol.html",
      mimeType: "text/html",
      bytes: new TextEncoder().encode("<h1>Protocol</h1><p>A &amp; B</p>"),
    });
    expect(parsed.extractedText).toBe("Protocol A & B");
    expect(parsed.sha256).toMatch(/^sha256:/);
  });

  it("parses DOCX and XLSX with ZIP signature checks", async () => {
    const docx = await makeDocx("DOCX threshold 42");
    await expect(
      parseUploadedDocument({
        filename: "bad.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        bytes: new Uint8Array([1, 2, 3]),
      }),
    ).rejects.toThrow("ZIP signature");

    const parsedDocx = await parseUploadedDocument({
      filename: "protocol.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes: docx,
    });
    expect(parsedDocx.extractedText).toContain("DOCX threshold 42");

    const parsedXlsx = await parseUploadedDocument({
      filename: "claims.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes: await makeXlsx("XLSX threshold 42"),
    });
    expect(parsedXlsx.extractedText).toContain("Claim\tXLSX threshold 42");
  });

  it("parses text PDFs and rejects image-only/textless PDFs", async () => {
    const pdfBytes = await makePdf("PDF threshold 42");
    const expectedByteSize = pdfBytes.byteLength;
    const expectedSha256 = `sha256:${createHash("sha256").update(pdfBytes).digest("hex")}`;
    const parsedPdf = await parseUploadedDocument({
      filename: "source.pdf",
      mimeType: "application/pdf",
      bytes: pdfBytes,
    });
    expect(parsedPdf.extractedText).toContain("PDF threshold 42");
    expect(parsedPdf.byteSize).toBe(expectedByteSize);
    expect(parsedPdf.sha256).toBe(expectedSha256);

    await expect(
      parseUploadedDocument({
        filename: "bad.pdf",
        mimeType: "application/pdf",
        bytes: new TextEncoder().encode("not a pdf"),
      }),
    ).rejects.toThrow("signature");

    await expect(
      parseUploadedDocument({
        filename: "scan.pdf",
        mimeType: "application/pdf",
        bytes: await makePdf(),
      }),
    ).rejects.toThrow("OCR");
  });

  it("applies review, rewrite, hop, and cycle policy deterministically", () => {
    expect(classifyReviewState(0.79)).toBe("needs_review");
    expect(classifyReviewState(0.8)).toBe("suggested");
    expect(
      classifyImpact({ confidence: 0.66, reviewed: false }).fallback?.label,
    ).toBe("deterministic_fallback");
    expect(
      classifyImpact({
        confidence: 0.2,
        loadBearingScore: 0.65,
        reviewed: true,
      }).class,
    ).toBe("rewrite_required");

    const traversal = traverseReviewedGraph("source", [
      {
        id: "e1",
        fromId: "source",
        toId: "claim",
        confidence: 0.9,
        loadBearingScore: 0.7,
        reviewed: true,
      },
      {
        id: "e2",
        fromId: "claim",
        toId: "source",
        confidence: 0.9,
        reviewed: true,
      },
      {
        id: "ignored",
        fromId: "source",
        toId: "draft",
        confidence: 1,
        reviewed: false,
      },
    ]);

    expect(traversal.paths).toHaveLength(1);
    expect(traversal.paths[0]?.rewriteRequired).toBe(true);
    expect(traversal.cycles).toHaveLength(1);
  });
});

async function makeDocx(text: string) {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p></w:body>
</w:document>`,
  );
  return new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
}

async function makeXlsx(value: string) {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`,
  );
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Claims" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
  );
  zip.file(
    "xl/sharedStrings.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="2" uniqueCount="2">
  <si><t>Claim</t></si><si><t>${escapeXml(value)}</t></si>
</sst>`,
  );
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row></sheetData>
</worksheet>`,
  );
  return new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
}

async function makePdf(text?: string) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([240, 120]);
  if (text) {
    page.drawText(text, {
      x: 24,
      y: 72,
      size: 12,
      font: await pdf.embedFont(StandardFonts.Helvetica),
    });
  }
  return new Uint8Array(await pdf.save());
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
