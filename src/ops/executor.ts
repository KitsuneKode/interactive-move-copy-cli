import { basename } from "node:path";
import { ANSI, COLORS } from "../core/constants.ts";
import type { ExecutionResult, OperationMode, RemovalMode } from "../core/types.ts";
import { formatSize } from "../fs/format.ts";
import { executeSafeOperation, executeSafeRemoval, recoverPendingTransactions } from "./safe-fs.ts";

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

  for (const [i, source] of sources.entries()) {
    const name = basename(source);

    process.stdout.write(`  [${i + 1}/${total}] ${name} ... `);

    const result = await executeSafeOperation(source, destination, mode, overwrite);

    if (result.success) {
      process.stdout.write(`${COLORS.success}✓${ANSI.reset}\n`);
    } else {
      const recovery = result.recoveryPath ? ` (recovery journal: ${result.recoveryPath})` : "";
      process.stdout.write(`${COLORS.fail}✗${ANSI.reset} ${result.error}${recovery}\n`);
    }

    results.push(result);
  }

  return results;
}

export async function executeRemovalOperation(
  sources: string[],
  removalMode: RemovalMode,
): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = [];
  const total = sources.length;

  for (const [i, source] of sources.entries()) {
    const name = basename(source);

    process.stdout.write(`  [${i + 1}/${total}] ${name} ... `);

    const result = await executeSafeRemoval(source, removalMode);

    if (result.success) {
      process.stdout.write(`${COLORS.success}✓${ANSI.reset}\n`);
    } else {
      process.stdout.write(`${COLORS.fail}✗${ANSI.reset} ${result.error}\n`);
    }

    results.push(result);
  }

  return results;
}

export function printSummary(results: ExecutionResult[], mode: OperationMode): void {
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const bytesVerified = results.reduce((sum, result) => sum + result.bytesVerified, 0);
  const verb = mode === "move" ? "moved" : mode === "copy" ? "copied" : "removed";
  const verifiedPart =
    bytesVerified > 0 ? `${COLORS.dim} (${formatSize(bytesVerified)} verified)${ANSI.reset}` : "";

  console.log("");
  if (failed === 0) {
    console.log(
      `${COLORS.success}✓ ${succeeded} file${succeeded !== 1 ? "s" : ""} ${verb} successfully${ANSI.reset}${verifiedPart}`,
    );
  } else {
    console.log(
      `${COLORS.success}✓ ${succeeded} ${verb}${ANSI.reset}, ${COLORS.fail}✗ ${failed} failed${ANSI.reset}${verifiedPart}`,
    );
  }
}
