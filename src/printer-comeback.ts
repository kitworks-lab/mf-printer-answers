import * as fs from "node:fs";
import * as path from "node:path";

export const PRINTER_COMEBACK = "The error code translates to you, and thumping me has never changed the translation.";

export type GateAudit = {
  text: string;
  codePoints: number;
  utf8Bytes: number;
  isSingleSentence: boolean;
  hasControlChars: boolean;
};

export function auditComeback(raw: string): GateAudit {
  if (typeof raw !== "string") {
    throw new TypeError("comeback must be a string");
  }
  const codePoints = [...raw].length;
  const hasControlChars = /[\u0000-\u001f\u007f]/.test(raw);
  if (/[\r\n]/.test(raw)) {
    throw new Error("comeback must not contain CR or LF");
  }
  if (hasControlChars) {
    throw new Error("comeback must not contain control characters");
  }
  if (raw.trim().length === 0) {
    throw new Error("comeback must not be blank");
  }
  if (raw.trim() !== raw) {
    throw new Error("comeback must not have leading or trailing whitespace");
  }
  if (codePoints < 1 || codePoints > 240) {
    throw new Error(`comeback must be 1..240 code points, got ${codePoints}`);
  }
  const encoded = Buffer.from(raw, "utf8");
  if (encoded.toString("utf8") !== raw) {
    throw new Error("comeback must round-trip as valid UTF-8");
  }
  const isSingleSentence = !/[.!?]+["')\]]*\s+\S/.test(raw);
  if (!isSingleSentence) {
    throw new Error("comeback must be a single sentence");
  }
  return { text: raw, codePoints, utf8Bytes: encoded.length, isSingleSentence, hasControlChars };
}

export function verifyDeterministicBytes(expected: Buffer, actual: Buffer): void {
  if (!expected.equals(actual)) {
    throw new Error(`bytes differ: expected ${expected.length} bytes, got ${actual.length} bytes`);
  }
}

export function formatAuditLine(audit: GateAudit): string {
  return `comeback ok: ${audit.codePoints} code points, ${audit.utf8Bytes} bytes, single sentence: ${audit.isSingleSentence}, control chars: ${audit.hasControlChars}`;
}

export function emitComeback(destination?: string): GateAudit {
  const audit = auditComeback(PRINTER_COMEBACK);
  const target = destination ?? process.env.OUTPUT_PATH ?? "/output/entry.txt";
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, Buffer.from(audit.text, "utf8"));
  return audit;
}
