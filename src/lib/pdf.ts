import { PDFParse } from "pdf-parse";

import { cleanText } from "@/lib/text";

export async function extractPdfText(buffer: Buffer) {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();
  return cleanText(result.text ?? "");
}
