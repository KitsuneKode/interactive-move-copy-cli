import { $ } from "bun";
import { basename, join } from "node:path";
import { stat } from "node:fs/promises";
import type { OperationMode, ExecutionResult } from "../core/types.ts";
import { ANSI, COLORS } from "../core/constants.ts";

export async function executeOperation(
  sources: string[],
  destination: string,
  mode: OperationMode,
  overwrite: boolean = false,
): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = [];
  const total = sources.length;

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i]!;
    const name = basename(source);
    const dest = join(destination, name);

    process.stdout.write(
      `  [${i + 1}/${total}] ${name} ... `
    );

    // Verify source still exists (TOCTOU guard)
    try {
      await stat(source);
    } catch {
      process.stdout.write(`${COLORS.fail}✗${ANSI.reset} file no longer exists\n`);
      results.push({ source, dest, success: false, error: "file no longer exists" });
      continue;
    }

    // No-clobber check: skip if destination exists and overwrite is false
    if (!overwrite) {
      const destExists = await stat(dest).then(() => true).catch(() => false);
      if (destExists) {
        process.stdout.write(`${COLORS.fail}✗${ANSI.reset} already exists at destination (skipped)\n`);
        results.push({ source, dest, success: false, error: "already exists at destination" });
        continue;
      }
    }

    try {
      let result;
      if (mode === "move") {
        result = await $`mv ${source} ${dest}`.nothrow().quiet();
      } else {
        result = await $`cp -r ${source} ${dest}`.nothrow().quiet();
      }

      if (result.exitCode === 0) {
        process.stdout.write(`${COLORS.success}✓${ANSI.reset}\n`);
        results.push({ source, dest, success: true });
      } else {
        const errMsg = result.stderr.toString().trim();
        process.stdout.write(`${COLORS.fail}✗${ANSI.reset} ${errMsg}\n`);
        results.push({ source, dest, success: false, error: errMsg });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      process.stdout.write(`${COLORS.fail}✗${ANSI.reset} ${errMsg}\n`);
      results.push({ source, dest, success: false, error: errMsg });
    }
  }

  return results;
}

export function printSummary(results: ExecutionResult[], mode: OperationMode): void {
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const verb = mode === "move" ? "moved" : "copied";

  console.log("");
  if (failed === 0) {
    console.log(`${COLORS.success}✓ ${succeeded} file${succeeded !== 1 ? "s" : ""} ${verb} successfully${ANSI.reset}`);
  } else {
    console.log(`${COLORS.success}✓ ${succeeded} ${verb}${ANSI.reset}, ${COLORS.fail}✗ ${failed} failed${ANSI.reset}`);
  }
}
