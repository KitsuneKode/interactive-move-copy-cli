import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  readlink,
  rename,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { ExecutionResult, OperationMode, RemovalMode } from "../core/types.ts";

interface ManifestEntry {
  relativePath: string;
  kind: "file" | "dir" | "symlink";
  mode: number;
  size: number;
  hash?: string;
  linkTarget?: string;
}

interface Manifest {
  entries: ManifestEntry[];
  bytesVerified: number;
}

interface RecoveryJournal {
  id: string;
  finalPath: string;
  backupPath: string;
  stagedPath?: string;
}

interface RecoveryStatus {
  canProceed: boolean;
  recovered: string[];
  errors: string[];
}

interface JournalContext {
  journalPath: string;
  entry: RecoveryJournal;
}

const HIDDEN_PREFIX = ".mvi";
export const RECOVERY_JOURNAL_DIR = join(tmpdir(), "mvi-recovery");

function getTrashBaseDir(): string {
  if (process.platform === "darwin") {
    return join(homedir(), ".Trash");
  }

  const dataHome = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  return join(dataHome, "Trash");
}

function uniqueSuffix(): string {
  return `${process.pid}.${Date.now()}.${randomUUID().slice(0, 8)}`;
}

function createHiddenSiblingPath(parentDir: string, kind: "tmp" | "backup", name: string): string {
  return join(parentDir, `${HIDDEN_PREFIX}.${kind}.${uniqueSuffix()}.${name}`);
}

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function pathExists(path: string): Promise<boolean> {
  return lstat(path)
    .then(() => true)
    .catch(() => false);
}

async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

async function syncPath(path: string): Promise<void> {
  try {
    const handle = await open(path, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // Best-effort sync. Some filesystems do not support directory fsync cleanly.
  }
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(path);

  for await (const chunk of stream) {
    hash.update(chunk);
  }

  return hash.digest("hex");
}

async function buildManifest(rootPath: string): Promise<Manifest> {
  const entries: ManifestEntry[] = [];
  let bytesVerified = 0;

  async function walk(currentPath: string, relativePath: string): Promise<void> {
    const info = await lstat(currentPath);

    if (info.isDirectory()) {
      entries.push({
        relativePath,
        kind: "dir",
        mode: info.mode & 0o7777,
        size: 0,
      });

      const children = await readdir(currentPath);
      children.sort((a, b) => a.localeCompare(b));
      for (const child of children) {
        await walk(
          join(currentPath, child),
          relativePath === "." ? child : join(relativePath, child),
        );
      }
      return;
    }

    if (info.isSymbolicLink()) {
      entries.push({
        relativePath,
        kind: "symlink",
        mode: info.mode & 0o7777,
        size: 0,
        linkTarget: await readlink(currentPath),
      });
      return;
    }

    if (info.isFile()) {
      entries.push({
        relativePath,
        kind: "file",
        mode: info.mode & 0o7777,
        size: info.size,
        hash: await hashFile(currentPath),
      });
      bytesVerified += info.size;
      return;
    }

    throw new Error(`Unsupported file type: ${currentPath}`);
  }

  await walk(rootPath, ".");
  entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return { entries, bytesVerified };
}

function manifestsMatch(source: Manifest, destination: Manifest): boolean {
  if (source.bytesVerified !== destination.bytesVerified) return false;
  if (source.entries.length !== destination.entries.length) return false;

  for (let i = 0; i < source.entries.length; i++) {
    const src = source.entries[i];
    const dest = destination.entries[i];
    if (src === undefined || dest === undefined) {
      return false;
    }

    if (src.relativePath !== dest.relativePath) return false;
    if (src.kind !== dest.kind) return false;
    if (src.mode !== dest.mode) return false;
    if (src.size !== dest.size) return false;
    if (src.hash !== dest.hash) return false;
    if (src.linkTarget !== dest.linkTarget) return false;
  }

  return true;
}

async function copyRegularFile(source: string, destination: string, mode: number): Promise<void> {
  await copyFile(source, destination);
  await chmod(destination, mode & 0o7777);
  await syncPath(destination);
}

async function copyDirectory(source: string, destination: string, mode: number): Promise<void> {
  await mkdir(destination, { mode: mode & 0o7777 });
  await chmod(destination, mode & 0o7777);

  const children = await readdir(source);
  children.sort((a, b) => a.localeCompare(b));

  for (const child of children) {
    await copySourceToStage(join(source, child), join(destination, child));
  }

  await syncPath(destination);
}

async function copySymlink(source: string, destination: string): Promise<void> {
  await symlink(await readlink(source), destination);
}

async function copySourceToStage(source: string, stagedPath: string): Promise<void> {
  const info = await lstat(source);

  if (info.isDirectory()) {
    await copyDirectory(source, stagedPath, info.mode);
    return;
  }

  if (info.isSymbolicLink()) {
    await copySymlink(source, stagedPath);
    return;
  }

  if (info.isFile()) {
    await copyRegularFile(source, stagedPath, info.mode);
    return;
  }

  throw new Error(`Unsupported file type: ${source}`);
}

async function removePath(path: string): Promise<void> {
  const info = await lstat(path).catch(() => null);
  if (!info) return;

  if (info.isDirectory() && !info.isSymbolicLink()) {
    await rm(path, { recursive: true, force: false });
    return;
  }

  await unlink(path);
}

async function writeJournal(entry: RecoveryJournal): Promise<JournalContext> {
  await mkdir(RECOVERY_JOURNAL_DIR, { recursive: true });
  const journalPath = join(RECOVERY_JOURNAL_DIR, `${entry.id}.json`);
  await writeFile(journalPath, JSON.stringify(entry, null, 2), "utf8");
  await syncPath(RECOVERY_JOURNAL_DIR);
  return { journalPath, entry };
}

async function copyVerifiedPath(
  source: string,
  destination: string,
): Promise<{ bytesVerified: number }> {
  await copySourceToStage(source, destination);
  const [sourceManifest, destinationManifest] = await Promise.all([
    buildManifest(source),
    buildManifest(destination),
  ]);

  if (!manifestsMatch(sourceManifest, destinationManifest)) {
    throw new Error("verification failed after staging");
  }

  return { bytesVerified: sourceManifest.bytesVerified };
}

async function removeJournal(journalPath: string): Promise<void> {
  await rm(journalPath, { force: true });
  await syncPath(RECOVERY_JOURNAL_DIR);
}

async function createReplacementJournal(
  finalPath: string,
  stagedPath?: string,
): Promise<JournalContext> {
  const entry: RecoveryJournal = {
    id: uniqueSuffix(),
    finalPath,
    backupPath: createHiddenSiblingPath(dirname(finalPath), "backup", basename(finalPath)),
    stagedPath,
  };

  return writeJournal(entry);
}

async function restoreBackup(journal: JournalContext): Promise<boolean> {
  const { finalPath, backupPath } = journal.entry;
  const finalExists = await pathExists(finalPath);
  const backupExists = await pathExists(backupPath);

  if (finalExists || !backupExists) {
    return false;
  }

  await rename(backupPath, finalPath);
  await syncPath(dirname(finalPath));
  await removeJournal(journal.journalPath);
  return true;
}

async function finalizeReplacement(
  journal: JournalContext,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await removePath(journal.entry.backupPath);
    await removeJournal(journal.journalPath);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: `operation completed but cleanup of backup failed: ${formatError(err)}`,
    };
  }
}

async function rollbackReplacement(
  journal: JournalContext,
  stagedPath?: string,
): Promise<{ recovered: boolean; recoveryPath?: string }> {
  const recovered = await restoreBackup(journal).catch(() => false);

  if (recovered) {
    if (stagedPath) {
      await removePath(stagedPath).catch(() => {});
    }
    return { recovered: true };
  }

  return { recovered: false, recoveryPath: journal.journalPath };
}

async function isSameDevice(source: string, destinationDir: string): Promise<boolean> {
  const [sourceInfo, destinationInfo] = await Promise.all([lstat(source), stat(destinationDir)]);
  return sourceInfo.dev === destinationInfo.dev;
}

async function cleanupStage(stagedPath: string): Promise<void> {
  await removePath(stagedPath).catch(() => {});
}

function escapeTrashInfoPath(source: string): string {
  return source
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function formatTrashDeletionDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

async function getUniqueTrashName(
  filesDir: string,
  infoDir: string,
  name: string,
): Promise<string> {
  let candidate = name;
  let counter = 1;

  while (
    (await pathExists(join(filesDir, candidate))) ||
    (await pathExists(join(infoDir, `${candidate}.trashinfo`)))
  ) {
    candidate = `${name}.${counter}`;
    counter++;
  }

  return candidate;
}

async function writeTrashInfo(infoPath: string, source: string): Promise<void> {
  const contents = [
    "[Trash Info]",
    `Path=${escapeTrashInfoPath(source)}`,
    `DeletionDate=${formatTrashDeletionDate(new Date())}`,
    "",
  ].join("\n");

  await writeFile(infoPath, contents, "utf8");
  await syncPath(infoPath);
}

async function moveToTrash(source: string): Promise<ExecutionResult> {
  const sourceInfo = await lstat(source).catch(() => null);
  const dest = source;

  if (!sourceInfo) {
    return {
      source,
      dest,
      success: false,
      error: "file no longer exists",
      strategy: "trash_verified",
      verified: false,
      bytesVerified: 0,
    };
  }

  const trashBase = getTrashBaseDir();
  const filesDir = process.platform === "darwin" ? trashBase : join(trashBase, "files");
  const infoDir = process.platform === "darwin" ? trashBase : join(trashBase, "info");

  await ensureDirectory(filesDir);
  await ensureDirectory(infoDir);

  const trashName = await getUniqueTrashName(filesDir, infoDir, basename(source));
  const trashPath = join(filesDir, trashName);
  const trashInfoPath = join(infoDir, `${trashName}.trashinfo`);

  await writeTrashInfo(trashInfoPath, source);

  try {
    if (await isSameDevice(source, filesDir)) {
      await rename(source, trashPath);
      await syncPath(filesDir);
      await syncPath(dirname(source));
      return {
        source,
        dest: trashPath,
        success: true,
        strategy: "trash_rename",
        verified: true,
        bytesVerified: 0,
      };
    }

    const stagedPath = createHiddenSiblingPath(filesDir, "tmp", trashName);

    try {
      const { bytesVerified } = await copyVerifiedPath(source, stagedPath);
      await rename(stagedPath, trashPath);
      await syncPath(filesDir);
      await removePath(source);
      await syncPath(dirname(source));

      return {
        source,
        dest: trashPath,
        success: true,
        strategy: "trash_verified",
        verified: true,
        bytesVerified,
      };
    } catch (err) {
      await cleanupStage(stagedPath);
      throw err;
    }
  } catch (err) {
    await rm(trashInfoPath, { force: true }).catch(() => {});
    return {
      source,
      dest: trashPath,
      success: false,
      error: formatError(err),
      strategy: "trash_verified",
      verified: false,
      bytesVerified: 0,
    };
  }
}

async function hardDeletePath(source: string): Promise<ExecutionResult> {
  try {
    await lstat(source);
  } catch {
    return {
      source,
      dest: source,
      success: false,
      error: "file no longer exists",
      strategy: "hard_delete",
      verified: false,
      bytesVerified: 0,
    };
  }

  try {
    await removePath(source);
    await syncPath(dirname(source));
    return {
      source,
      dest: source,
      success: true,
      strategy: "hard_delete",
      verified: false,
      bytesVerified: 0,
    };
  } catch (err) {
    return {
      source,
      dest: source,
      success: false,
      error: formatError(err),
      strategy: "hard_delete",
      verified: false,
      bytesVerified: 0,
    };
  }
}

async function executeRenameMove(
  source: string,
  finalPath: string,
  overwrite: boolean,
): Promise<ExecutionResult> {
  const sourceParent = dirname(source);
  const destParent = dirname(finalPath);
  const finalExists = await pathExists(finalPath);

  if (!overwrite && finalExists) {
    return {
      source,
      dest: finalPath,
      success: false,
      error: "already exists at destination",
      strategy: "rename",
      verified: false,
      bytesVerified: 0,
    };
  }

  let journal: JournalContext | null = null;

  try {
    if (overwrite && finalExists) {
      journal = await createReplacementJournal(finalPath);
      await rename(finalPath, journal.entry.backupPath);
      await syncPath(destParent);
    }

    await rename(source, finalPath);
    await syncPath(destParent);
    if (sourceParent !== destParent) {
      await syncPath(sourceParent);
    }

    if (journal) {
      const finalized = await finalizeReplacement(journal);
      if (!finalized.ok) {
        return {
          source,
          dest: finalPath,
          success: false,
          error: finalized.error,
          strategy: "rename",
          verified: true,
          bytesVerified: 0,
          recoveryPath: journal.journalPath,
        };
      }
    }

    return {
      source,
      dest: finalPath,
      success: true,
      strategy: "rename",
      verified: true,
      bytesVerified: 0,
    };
  } catch (err) {
    const rolledBack = journal
      ? await rollbackReplacement(journal)
      : { recovered: true as const, recoveryPath: undefined };

    return {
      source,
      dest: finalPath,
      success: false,
      error: formatError(err),
      strategy: "rename",
      verified: false,
      bytesVerified: 0,
      recoveryPath: rolledBack.recoveryPath,
    };
  }
}

async function promoteVerifiedStage(
  source: string,
  finalPath: string,
  stagedPath: string,
  mode: OperationMode,
  overwrite: boolean,
  bytesVerified: number,
): Promise<ExecutionResult> {
  const finalExists = await pathExists(finalPath);
  if (!overwrite && finalExists) {
    await cleanupStage(stagedPath);
    return {
      source,
      dest: finalPath,
      success: false,
      error: "already exists at destination",
      strategy: mode === "copy" ? "verified_copy" : "verified_copy_delete",
      verified: false,
      bytesVerified: 0,
    };
  }

  let journal: JournalContext | null = null;

  try {
    if (overwrite && finalExists) {
      journal = await createReplacementJournal(finalPath, stagedPath);
      await rename(finalPath, journal.entry.backupPath);
      await syncPath(dirname(finalPath));
    }

    await rename(stagedPath, finalPath);
    await syncPath(dirname(finalPath));

    if (mode === "move") {
      try {
        await removePath(source);
        await syncPath(dirname(source));
      } catch (err) {
        return {
          source,
          dest: finalPath,
          success: false,
          error: `destination verified but source cleanup failed: ${formatError(err)}`,
          strategy: "verified_copy_delete",
          verified: true,
          bytesVerified,
          recoveryPath: journal?.journalPath,
        };
      }
    }

    if (journal) {
      const finalized = await finalizeReplacement(journal);
      if (!finalized.ok) {
        return {
          source,
          dest: finalPath,
          success: false,
          error: finalized.error,
          strategy: mode === "copy" ? "verified_copy" : "verified_copy_delete",
          verified: true,
          bytesVerified,
          recoveryPath: journal.journalPath,
        };
      }
    }

    return {
      source,
      dest: finalPath,
      success: true,
      strategy: mode === "copy" ? "verified_copy" : "verified_copy_delete",
      verified: true,
      bytesVerified,
    };
  } catch (err) {
    const rolledBack = journal
      ? await rollbackReplacement(journal, stagedPath)
      : { recovered: true as const, recoveryPath: undefined };

    if (!journal) {
      await cleanupStage(stagedPath);
    }

    return {
      source,
      dest: finalPath,
      success: false,
      error: formatError(err),
      strategy: mode === "copy" ? "verified_copy" : "verified_copy_delete",
      verified: false,
      bytesVerified: 0,
      recoveryPath: rolledBack.recoveryPath,
    };
  }
}

export async function executeSafeOperation(
  source: string,
  destinationDir: string,
  mode: OperationMode,
  overwrite: boolean,
): Promise<ExecutionResult> {
  const finalPath = join(destinationDir, basename(source));

  try {
    await lstat(source);
  } catch {
    return {
      source,
      dest: finalPath,
      success: false,
      error: "file no longer exists",
      strategy: mode === "copy" ? "verified_copy" : "verified_copy_delete",
      verified: false,
      bytesVerified: 0,
    };
  }

  if (mode === "move" && (await isSameDevice(source, destinationDir))) {
    return executeRenameMove(source, finalPath, overwrite);
  }

  if (!overwrite && (await pathExists(finalPath))) {
    return {
      source,
      dest: finalPath,
      success: false,
      error: "already exists at destination",
      strategy: mode === "copy" ? "verified_copy" : "verified_copy_delete",
      verified: false,
      bytesVerified: 0,
    };
  }

  const stagedPath = createHiddenSiblingPath(destinationDir, "tmp", basename(source));

  try {
    const { bytesVerified } = await copyVerifiedPath(source, stagedPath);

    return promoteVerifiedStage(source, finalPath, stagedPath, mode, overwrite, bytesVerified);
  } catch (err) {
    await cleanupStage(stagedPath);
    return {
      source,
      dest: finalPath,
      success: false,
      error: formatError(err),
      strategy: mode === "copy" ? "verified_copy" : "verified_copy_delete",
      verified: false,
      bytesVerified: 0,
    };
  }
}

export async function executeSafeRemoval(
  source: string,
  removalMode: RemovalMode,
): Promise<ExecutionResult> {
  if (removalMode === "hard-delete") {
    return hardDeletePath(source);
  }

  return moveToTrash(source);
}

export async function recoverPendingTransactions(): Promise<RecoveryStatus> {
  const status: RecoveryStatus = {
    canProceed: true,
    recovered: [],
    errors: [],
  };

  const exists = await pathExists(RECOVERY_JOURNAL_DIR);
  if (!exists) {
    return status;
  }

  const journals = (await readdir(RECOVERY_JOURNAL_DIR))
    .filter((entry) => entry.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));

  for (const journalFile of journals) {
    const journalPath = join(RECOVERY_JOURNAL_DIR, journalFile);
    let journal: RecoveryJournal;

    try {
      journal = JSON.parse(await readFile(journalPath, "utf8")) as RecoveryJournal;
    } catch {
      status.canProceed = false;
      status.errors.push(`Unreadable recovery journal: ${journalPath}`);
      continue;
    }

    const finalExists = await pathExists(journal.finalPath);
    const backupExists = await pathExists(journal.backupPath);
    const stagedExists = journal.stagedPath ? await pathExists(journal.stagedPath) : false;

    if (!finalExists && backupExists) {
      try {
        await rename(journal.backupPath, journal.finalPath);
        await syncPath(dirname(journal.finalPath));
        if (journal.stagedPath && stagedExists) {
          await cleanupStage(journal.stagedPath);
        }
        await removeJournal(journalPath);
        status.recovered.push(`Recovered interrupted overwrite for ${journal.finalPath}`);
      } catch (err) {
        status.canProceed = false;
        status.errors.push(
          `Failed to restore ${journal.finalPath} from ${journal.backupPath}: ${formatError(err)}`,
        );
      }
      continue;
    }

    if (finalExists && !backupExists) {
      if (journal.stagedPath && stagedExists) {
        await cleanupStage(journal.stagedPath);
      }
      await removeJournal(journalPath).catch(() => {});
      continue;
    }

    status.canProceed = false;
    status.errors.push(
      `Recovery requires manual attention: final=${journal.finalPath} backup=${journal.backupPath} journal=${journalPath}`,
    );
  }

  return status;
}
