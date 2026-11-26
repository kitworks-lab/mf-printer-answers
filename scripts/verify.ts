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

type MainModule = { writeEntry: (outputPath: string) => void; isMainModule: (argv1?: string, self?: string) => boolean };

async function runMain(main: MainModule, outputPath: string): Promise<Buffer> {
  main.writeEntry(outputPath);
  return fs.readFileSync(outputPath);
}

if (networkPattern.test(fs.readFileSync(mainPath, "utf8"))) {
  fail("main.ts references a network module");
}

const main = (await import(pathToFileURL(mainPath).href)) as MainModule;
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "printer-verify-"));
try {
  const first = await runMain(main, path.join(workDir, "first", "entry.txt"));
  const second = await runMain(main, path.join(workDir, "second", "entry.txt"));

  if (!first.equals(second)) {
    fail("two runs produced different bytes");
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
  if (!main.isMainModule(path.relative(process.cwd(), mainPath), mainPath)) {
    fail("isMainModule rejects a relative path");
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
