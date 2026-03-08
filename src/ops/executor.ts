import { basename } from "node:path";
import type { OperationMode, ExecutionResult } from "../core/types.ts";
import { ANSI, COLORS } from "../core/constants.ts";
import { executeSafeOperation, recoverPendingTransactions } from "./safe-fs.ts";
import { formatSize } from "../fs/format.ts";

export async function recoverPendingOperations(): Promise<{
  canProceed: boolean;
  messages: string[];
}> {
  const status = await recoverPendingTransactions();
  return {
    canProceed: status.canProceed,
    messages: [...status.recovered, ...status.errors],
  };
}

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

    process.stdout.write(`  [${i + 1}/${total}] ${name} ... `);

    const result = await executeSafeOperation(source, destination, mode, overwrite);

    if (result.success) {
      process.stdout.write(`${COLORS.success}✓${ANSI.reset}\n`);
    } else {
      const recovery = result.recoveryPath
        ? ` (recovery journal: ${result.recoveryPath})`
        : "";
      process.stdout.write(`${COLORS.fail}✗${ANSI.reset} ${result.error}${recovery}\n`);
    }

    results.push(result);
  }

  return results;
}

export function printSummary(results: ExecutionResult[], mode: OperationMode): void {
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const bytesVerified = results.reduce((sum, result) => sum + result.bytesVerified, 0);
  const verb = mode === "move" ? "moved" : "copied";
  const verifiedPart = bytesVerified > 0
    ? `${COLORS.dim} (${formatSize(bytesVerified)} verified)${ANSI.reset}`
    : "";

  console.log("");
  if (failed === 0) {
    console.log(
      `${COLORS.success}✓ ${succeeded} file${succeeded !== 1 ? "s" : ""} ${verb} successfully${ANSI.reset}${verifiedPart}`
    );
  } else {
    console.log(
      `${COLORS.success}✓ ${succeeded} ${verb}${ANSI.reset}, ${COLORS.fail}✗ ${failed} failed${ANSI.reset}${verifiedPart}`
    );
  }
}
