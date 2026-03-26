import { lstat, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import type { PathKind, PathStats } from "../core/types.ts";

export interface PathPreviewEntry {
  relativePath: string;
  kind: PathKind;
}

export interface PathInspection {
  path: string;
  name: string;
  kind: PathKind;
  stats: PathStats;
  previewEntries: PathPreviewEntry[];
  previewOverflow: number;
}

export const EMPTY_PATH_STATS: PathStats = {
  items: 0,
  files: 0,
  directories: 0,
  symlinks: 0,
};

function createEmptyPathStats(): PathStats {
  return { ...EMPTY_PATH_STATS };
}

function pluralize(count: number, singular: string, plural: string = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function mergePathStats(parts: PathStats[]): PathStats {
  return parts.reduce(
    (total, part) => ({
      items: total.items + part.items,
      files: total.files + part.files,
      directories: total.directories + part.directories,
      symlinks: total.symlinks + part.symlinks,
    }),
    createEmptyPathStats(),
  );
}

export function formatPathLabel(name: string, kind: PathKind): string {
  return kind === "directory" ? `${name}/` : name;
}

export function describePathStats(stats: PathStats): string {
  const parts: string[] = [];

  if (stats.directories > 0) {
    parts.push(pluralize(stats.directories, "folder"));
  }
  if (stats.files > 0) {
    parts.push(pluralize(stats.files, "file"));
  }
  if (stats.symlinks > 0) {
    parts.push(pluralize(stats.symlinks, "symlink"));
  }

  return parts.length > 0 ? parts.join(", ") : pluralize(stats.items, "item");
}

function getPathKindFromStat(info: Awaited<ReturnType<typeof lstat>>): PathKind {
  if (info.isDirectory()) {
    return "directory";
  }
  if (info.isSymbolicLink()) {
    return "symlink";
  }
  return "file";
}

function recordPathStats(stats: PathStats, kind: PathKind): void {
  stats.items += 1;
  if (kind === "directory") {
    stats.directories += 1;
    return;
  }
  if (kind === "symlink") {
    stats.symlinks += 1;
    return;
  }
  stats.files += 1;
}

export async function inspectPath(
  path: string,
  options: { previewLimit?: number } = {},
): Promise<PathInspection> {
  const previewLimit = options.previewLimit ?? 0;
  const previewEntries: PathPreviewEntry[] = [];
  let previewOverflow = 0;
  const stats = createEmptyPathStats();

  async function walk(currentPath: string, relativePath: string): Promise<void> {
    const info = await lstat(currentPath);
    const kind = getPathKindFromStat(info);

    recordPathStats(stats, kind);

    if (relativePath !== ".") {
      if (previewEntries.length < previewLimit) {
        previewEntries.push({ relativePath, kind });
      } else {
        previewOverflow += 1;
      }
    }

    if (kind !== "directory") {
      return;
    }

    const children = await readdir(currentPath);
    children.sort((a, b) => a.localeCompare(b));

    for (const child of children) {
      const childRelativePath = relativePath === "." ? child : join(relativePath, child);
      await walk(join(currentPath, child), childRelativePath);
    }
  }

  await walk(path, ".");

  return {
    path,
    name: basename(path),
    kind: stats.directories > 0 ? "directory" : stats.symlinks > 0 ? "symlink" : "file",
    stats,
    previewEntries,
    previewOverflow,
  };
}
