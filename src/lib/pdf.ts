import "pdf-parse/worker";
import { PDFParse } from "pdf-parse";

import { cleanText } from "@/lib/text";

function toPdfData(input: ArrayBuffer | Uint8Array | Buffer) {
  if (input instanceof Uint8Array) {
    return input;
  }

  return new Uint8Array(input);
}

export async function extractPdfText(input: ArrayBuffer | Uint8Array | Buffer) {
  const parser = new PDFParse({ data: toPdfData(input) });

  try {
    const result = await parser.getText();
    return cleanText(result.text ?? "");
  } finally {
    await parser.destroy();
  }
}
