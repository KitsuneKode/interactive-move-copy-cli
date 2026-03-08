import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RECOVERY_JOURNAL_DIR, recoverPendingTransactions } from "../src/ops/safe-fs.ts";

let testRoot: string;

beforeEach(async () => {
  testRoot = await mkdtemp(join(tmpdir(), "mvi-recovery-test-"));
  await rm(RECOVERY_JOURNAL_DIR, { recursive: true, force: true }).catch(() => {});
});

afterEach(async () => {
  await rm(testRoot, { recursive: true, force: true }).catch(() => {});
  await rm(RECOVERY_JOURNAL_DIR, { recursive: true, force: true }).catch(() => {});
});

describe("recoverPendingTransactions", () => {
  test("restores backup when final path is missing", async () => {
    const destDir = join(testRoot, "dest");
    await mkdir(destDir, { recursive: true });

    const finalPath = join(destDir, "file.txt");
    const backupPath = join(destDir, ".mvi.backup.test.file.txt");
    await writeFile(backupPath, "backup");

    await mkdir(RECOVERY_JOURNAL_DIR, { recursive: true });
    await writeFile(
      join(RECOVERY_JOURNAL_DIR, "txn.json"),
      JSON.stringify({
        id: "txn",
        finalPath,
        backupPath,
      }),
      "utf8",
    );

    const status = await recoverPendingTransactions();

    expect(status.canProceed).toBe(true);
    expect(status.recovered.length).toBe(1);
    expect(await Bun.file(finalPath).text()).toBe("backup");
  });

  test("stops when both final and backup exist", async () => {
    const destDir = join(testRoot, "dest2");
    await mkdir(destDir, { recursive: true });

    const finalPath = join(destDir, "file.txt");
    const backupPath = join(destDir, ".mvi.backup.test.file.txt");
    await writeFile(finalPath, "final");
    await writeFile(backupPath, "backup");

    await mkdir(RECOVERY_JOURNAL_DIR, { recursive: true });
    await writeFile(
      join(RECOVERY_JOURNAL_DIR, "txn.json"),
      JSON.stringify({
        id: "txn",
        finalPath,
        backupPath,
      }),
      "utf8",
    );

    const status = await recoverPendingTransactions();

    expect(status.canProceed).toBe(false);
    expect(status.errors[0]).toContain("manual attention");
    expect(await Bun.file(finalPath).text()).toBe("final");
    expect(await Bun.file(backupPath).text()).toBe("backup");
  });
});
