import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const mainPath = path.join(repoRoot, "main.ts");
const networkPattern = /from\s+["'](node:)?(net|http|https|dns|tls|dgram|http2)["']|require\(["'](node:)?(net|http|https|dns|tls|dgram|http2)["']\)|\bfetch\s*\(/;

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

type MainModule = { resolveMainExecution: (argvPath?: string, moduleFile?: string) => boolean };
type ComebackModule = typeof import("../src/printer-comeback.ts");

const comebackPath = path.join(repoRoot, "src", "printer-comeback.ts");
const expectedLine = "The error code translates to you, and thumping me has never changed the translation.";

function runEmit(comeback: ComebackModule, outputPath: string): Buffer {
  comeback.emitComeback(outputPath);
  return fs.readFileSync(outputPath);
}

for (const file of [mainPath, comebackPath]) {
  if (networkPattern.test(fs.readFileSync(file, "utf8"))) {
    fail(`${path.basename(file)} references a network module`);
  }
}

const main = (await import(pathToFileURL(mainPath).href)) as MainModule;
const comeback = (await import(pathToFileURL(comebackPath).href)) as ComebackModule;

function expectThrows(label: string, input: string): void {
  try {
    comeback.auditComeback(input);
  } catch {
    return;
  }
  fail(`auditComeback accepted ${label}`);
}

if (comeback.PRINTER_COMEBACK !== expectedLine) fail("PRINTER_COMEBACK changed");
const goodAudit = comeback.auditComeback(expectedLine);
if (goodAudit.utf8Bytes !== 84 || goodAudit.codePoints !== 84 || !goodAudit.isSingleSentence || goodAudit.hasControlChars) {
  fail(`unexpected audit: ${JSON.stringify(goodAudit)}`);
}
expectThrows("blank input", "   ");
expectThrows("empty input", "");
expectThrows("newline input", "a\nb");
expectThrows("CR input", "a\rb");
expectThrows("control chars", "a\u0001b");
expectThrows("padded input", " padded ");
expectThrows("too-long input", "x".repeat(241));
expectThrows("two sentences", "One. Two.");
if (comeback.auditComeback("x".repeat(240)).codePoints !== 240) fail("240 code points should pass");

comeback.verifyDeterministicBytes(Buffer.from(expectedLine), Buffer.from(expectedLine));
for (const [expected, actual] of [[Buffer.from("a"), Buffer.from("b")], [Buffer.from("a"), Buffer.from("ab")]]) {
  let threw = false;
  try {
    comeback.verifyDeterministicBytes(expected, actual);
  } catch {
    threw = true;
  }
  if (!threw) fail("verifyDeterministicBytes accepted differing bytes");
}
const auditLine = comeback.formatAuditLine(goodAudit);
if (!auditLine.includes("84 code points") || !auditLine.includes("84 bytes") || auditLine.includes("\n")) {
  fail(`unexpected audit line: ${auditLine}`);
}

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "printer-verify-"));
try {
  const first = runEmit(comeback, path.join(workDir, "first", "entry.txt"));
  const second = runEmit(comeback, path.join(workDir, "second", "entry.txt"));

  if (!first.equals(second)) {
    fail("two runs produced different bytes");
  }
  if (first.toString("utf8") !== expectedLine || first.length !== 84) {
    fail("emitted bytes differ from the 84-byte comeback");
  }

  const text = first.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(first)) {
    fail("output is not valid UTF-8");
  }
  if (text.includes("\n") || text.includes("\r")) {
    fail("output contains an embedded newline");
  }
  if (text.trim() !== text || text.trim().length === 0) {
    fail("output has leading/trailing whitespace or is blank");
  }
  if (/[.!?]\s+\S/.test(text)) {
    fail("output looks like more than one sentence");
  }
  if (!main.resolveMainExecution(path.relative(process.cwd(), mainPath), mainPath)) {
    fail("resolveMainExecution rejects a relative path");
  }
  if (!main.resolveMainExecution("./main.ts", mainPath) && process.cwd() === repoRoot) {
    fail("resolveMainExecution rejects ./main.ts");
  }
  if (main.resolveMainExecution(path.join(repoRoot, "other.ts"), mainPath) || main.resolveMainExecution(undefined, mainPath)) {
    fail("resolveMainExecution accepted a foreign path");
  }
  const cliOut = path.join(workDir, "cli", "entry.txt");
  const cli = spawnSync(process.execPath, [mainPath], { env: { ...process.env, OUTPUT_PATH: cliOut }, encoding: "utf8" });
  if (cli.error) {
    console.log(`note: spawn unavailable (${cli.error.message}); relying on isMainModule check`);
  } else if (cli.status !== 0 || !fs.existsSync(cliOut) || !fs.readFileSync(cliOut).equals(first)) {
    fail(`direct CLI execution did not write the expected output: ${cli.stderr}`);
  }
  const characters = [...text].length;
  if (characters < 1 || characters > 240) {
    fail(`output has ${characters} characters, expected 1..240`);
  }

  console.log(text);
  console.log(`characters: ${characters}`);
  console.log(`bytes: ${first.length}`);
  console.log("OK: deterministic, valid UTF-8, single line, no network modules");
} finally {
  fs.rmSync(workDir, { recursive: true, force: true });
}
