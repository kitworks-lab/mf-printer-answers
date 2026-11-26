import * as fs from "node:fs";
import * as path from "node:path";
import { auditComeback, emitComeback, formatAuditLine, PRINTER_COMEBACK } from "./src/printer-comeback.ts";

export function resolveMainExecution(argvPath: string | undefined = process.argv[1], moduleFile: string = import.meta.filename): boolean {
  if (!argvPath) return false;
  const real = (file: string): string => {
    try {
      return fs.realpathSync(file);
    } catch {
      return path.resolve(file);
    }
  };
  return path.resolve(argvPath) === path.resolve(moduleFile) || real(argvPath) === real(moduleFile);
}

if (resolveMainExecution()) {
  const checkOnly = process.argv.includes("--check-only");
  const audit = checkOnly ? auditComeback(PRINTER_COMEBACK) : emitComeback();
  console.log(formatAuditLine(audit));
}
