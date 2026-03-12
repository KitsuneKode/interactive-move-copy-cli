import type { Dirent, Stats } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { FileEntry } from "../core/types.ts";
import { formatDate, formatSize } from "./format.ts";
import { getIcon } from "./icons.ts";

const cache = new Map<string, { entries: FileEntry[]; timestamp: number }>();
const CACHE_TTL = 2000; // 2 seconds
const STAT_CONCURRENCY = 32;

async function mapWithConcurrency<T, TResult>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<TResult>,
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      const item = items[currentIndex];
      if (item === undefined) {
        continue;
      }

      results[currentIndex] = await mapper(item);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));

  return results;
}

export async function listDirectory(dirPath: string): Promise<FileEntry[]> {
  const cached = cache.get(dirPath);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.entries;
  }

  let dirents: Dirent[];
  try {
    dirents = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const entries = await mapWithConcurrency(dirents, STAT_CONCURRENCY, async (dirent) => {
    const fullPath = join(dirPath, dirent.name);
    let stat: Stats | null;
    let readable = true;
    try {
      stat = await lstat(fullPath);
    } catch {
      readable = false;
      stat = null;
    }

    const isDirectory = dirent.isDirectory();
    const isSymlink = dirent.isSymbolicLink();
    const size = stat?.size ?? 0;
    const modifiedAt = stat?.mtime ?? new Date(0);
    const icon = getIcon(dirent.name, isDirectory, isSymlink, readable);

    return {
      name: dirent.name,
      path: fullPath,
      isDirectory,
      isSymlink,
      size,
      modifiedAt,
      icon,
      formattedSize: isDirectory ? "" : formatSize(size),
      formattedDate: formatDate(modifiedAt),
      readable,
    };
  });

  // Sort: dirs first, then alphabetical
  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  cache.set(dirPath, { entries, timestamp: Date.now() });
  return entries;
}

export function invalidateCache(dirPath?: string): void {
  if (dirPath) {
    cache.delete(dirPath);
  } else {
    cache.clear();
  }
}
