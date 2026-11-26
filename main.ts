import * as fs from "node:fs";
import * as path from "node:path";

export const ENTRY_LINE = "The error code translates to you, and thumping me has never changed the translation.";

export function validateEntry(line: string): string {
  if (typeof line !== "string") {
    throw new TypeError("entry must be a string");
  }
  if (/[\r\n]/.test(line)) {
    throw new Error("entry must be a single line");
  }
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    throw new Error("entry must not be blank");
  }
  if (trimmed !== line) {
    throw new Error("entry must not have leading or trailing whitespace");
  }
  const characters = [...line].length;
  if (characters < 1 || characters > 240) {
    throw new Error(`entry must be 1..240 characters, got ${characters}`);
  }
  if (Buffer.from(line, "utf8").toString("utf8") !== line) {
    throw new Error("entry must be valid UTF-8");
  }
  return line;
}

export function formatStickerReport(line: string): string {
  const characters = [...line].length;
  const bytes = Buffer.byteLength(line, "utf8");
  return `${line}\n${characters} characters, ${bytes} bytes`;
}

export function writeEntry(outputPath: string = process.env.OUTPUT_PATH || "/output/entry.txt"): void {
  const line = validateEntry(ENTRY_LINE);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, line, { encoding: "utf8" });
}

export function isMainModule(argv1: string | undefined = process.argv[1], self: string = import.meta.filename): boolean {
  if (!argv1) return false;
  const real = (file: string): string => {
    try {
      return fs.realpathSync(file);
    } catch {
      return path.resolve(file);
    }
  };
  return path.resolve(argv1) === path.resolve(self) || real(argv1) === real(self);
}

if (isMainModule()) {
  writeEntry();
  console.log(formatStickerReport(ENTRY_LINE));
}
