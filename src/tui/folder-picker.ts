import { dirname, resolve } from "node:path";
import { ANSI, COLORS } from "../core/constants.ts";
import type { FileEntry, OperationMode } from "../core/types.ts";
import { listDirectory } from "../fs/file-info.ts";
import type { DestinationSearchContext } from "./destination-search.ts";
import { promptForDestinationPath, searchDestinationWithFzf } from "./destination-search.ts";
import { fuzzyMatch, highlightMatch } from "./fuzzy.ts";
import { clearPreviousFrame, getViewportHeight, render } from "./renderer.ts";
import {
  enterAltScreen,
  enterRawMode,
  exitAltScreen,
  exitRawMode,
  getTerminalSize,
  readKey,
  settleInputAfterExternalPicker,
} from "./terminal.ts";

interface PickerResult {
  destination: string | null;
  cancelled: boolean;
}

export async function folderPicker(
  startDir: string,
  fileCount: number,
  mode: OperationMode,
  searchContext: DestinationSearchContext,
): Promise<PickerResult> {
  const initialDir = resolve(startDir);
  let currentDir = initialDir;
  let cursor = 0;
  let scrollOffset = 0;
  let notice = "";
  let searchQuery = "";

  let lastFilteredSource: FileEntry[] | null = null;
  let lastFilteredQuery = "";
  let lastFilteredDirs: FileEntry[] = [];

  while (true) {
    const allEntries = await listDirectory(currentDir);
    const allDirs = allEntries.filter((e) => e.isDirectory && e.readable);

    const filteredDirs =
      allDirs === lastFilteredSource && searchQuery === lastFilteredQuery
        ? lastFilteredDirs
        : filterDirectories(allDirs, searchQuery);
    lastFilteredSource = allDirs;
    lastFilteredQuery = searchQuery;
    lastFilteredDirs = filteredDirs;

    const maxCursor = filteredDirs.length;
    if (cursor > maxCursor) cursor = maxCursor;
    if (cursor < 0) cursor = 0;

    const viewportHeight = getViewportHeight();
    if (cursor < scrollOffset) scrollOffset = cursor;
    if (cursor >= scrollOffset + viewportHeight) scrollOffset = cursor - viewportHeight + 1;

    renderPicker(
      currentDir,
      filteredDirs,
      cursor,
      scrollOffset,
      fileCount,
      mode,
      notice,
      searchQuery,
    );
    notice = "";

    const key = await readKey();

    switch (key.name) {
      case "ctrl+c":
      case "escape":
        if (searchQuery) {
          searchQuery = "";
          cursor = 0;
          scrollOffset = 0;
        } else {
          return { destination: null, cancelled: true };
        }
        break;

      case "up":
        if (cursor > 0) cursor--;
        break;

      case "down":
        if (cursor < maxCursor) cursor++;
        break;

      case "left": {
        if (searchQuery) {
          searchQuery = searchQuery.slice(0, -1);
          cursor = 0;
          scrollOffset = 0;
        } else {
          const parent = dirname(currentDir);
          if (parent !== currentDir) {
            currentDir = parent;
            cursor = 0;
            scrollOffset = 0;
          }
        }
        break;
      }

      case "right": {
        if (searchQuery) {
          if (cursor > 0) {
            const dir = filteredDirs[cursor - 1];
            if (dir) {
              currentDir = dir.path;
              searchQuery = "";
              cursor = 0;
              scrollOffset = 0;
            }
          }
        } else {
          if (cursor > 0) {
            const dir = allDirs[cursor - 1];
            if (dir) {
              currentDir = dir.path;
              cursor = 0;
              scrollOffset = 0;
            }
          }
        }
        break;
      }

      case "enter": {
        if (searchQuery && cursor > 0) {
          const dir = filteredDirs[cursor - 1];
          if (dir) {
            currentDir = dir.path;
            searchQuery = "";
            cursor = 0;
            scrollOffset = 0;
          }
        } else {
          return { destination: currentDir, cancelled: false };
        }
        break;
      }

      case "backspace": {
        if (searchQuery) {
          searchQuery = searchQuery.slice(0, -1);
          cursor = 0;
          scrollOffset = 0;
        } else {
          const parent = dirname(currentDir);
          if (parent !== currentDir) {
            currentDir = parent;
            cursor = 0;
            scrollOffset = 0;
          }
        }
        break;
      }

      case "char":
        if (key.char === "c" || key.char === "C") {
          return { destination: currentDir, cancelled: false };
        }
        if (key.char === "g" || key.char === "G") {
          const result = await runExternalPickerAction(() =>
            promptForDestinationPath(currentDir, searchContext),
          );
          if (result.path) {
            currentDir = result.path;
            searchQuery = "";
            cursor = 0;
            scrollOffset = 0;
            notice = `Jumped to ${currentDir.replace(process.env.HOME || "", "~")}. Press Enter to confirm.`;
          } else if (result.message) {
            notice = result.message;
          }
        } else {
          searchQuery += key.char;
          cursor = 0;
          scrollOffset = 0;
        }
        break;

      case "paste":
        searchQuery += key.text;
        cursor = 0;
        scrollOffset = 0;
        break;

      case "ctrl+f": {
        const result = await runExternalPickerAction(() =>
          searchDestinationWithFzf(currentDir, searchContext),
        );
        if (result.path) {
          currentDir = result.path;
          searchQuery = "";
          cursor = 0;
          scrollOffset = 0;
          notice = `Jumped to ${currentDir.replace(process.env.HOME || "", "~")}. Press Enter to confirm.`;
        } else if (result.cancelled) {
          notice = "Search cancelled.";
        } else if (result.message) {
          notice = result.message;
        }
        break;
      }

      case "ctrl+r":
        currentDir = initialDir;
        searchQuery = "";
        cursor = 0;
        scrollOffset = 0;
        break;
    }
  }
}

function filterDirectories(entries: FileEntry[], query: string): FileEntry[] {
  if (!query) return entries;

  const results: { entry: FileEntry; score: number }[] = [];
  for (const entry of entries) {
    const result = fuzzyMatch(query, entry.name);
    if (result.matches) {
      results.push({ entry, score: result.score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.map((r) => r.entry);
}

function renderPicker(
  currentDir: string,
  dirs: FileEntry[],
  cursor: number,
  scrollOffset: number,
  fileCount: number,
  mode: OperationMode,
  notice: string,
  searchQuery: string,
): void {
  const { cols } = getTerminalSize();
  const viewportHeight = getViewportHeight();
  const modeLabel = mode === "move" ? "MOVE" : "COPY";
  const dirDisplay = currentDir.replace(process.env.HOME || "", "~");

  const lines: string[] = [];

  lines.push(
    `${COLORS.header} ${modeLabel}: Select destination ${ANSI.reset}${COLORS.dim} ${dirDisplay} ${ANSI.reset}`,
  );

  lines.push(
    ` ${COLORS.status}${fileCount} file${fileCount !== 1 ? "s" : ""} to ${mode}${ANSI.reset}`,
  );

  if (searchQuery) {
    const searchDisplay = `${COLORS.search}Filter: ${searchQuery}${ANSI.reset}${COLORS.dim}_${ANSI.reset}`;
    lines.push(` ${searchDisplay}`);
  } else {
    lines.push(` ${COLORS.dim}Directories${ANSI.reset}`);
  }

  lines.push(` ${COLORS.dim}${"─".repeat(Math.min(cols - 2, 80))}${ANSI.reset}`);

  const allRows: string[] = [];

  const dotdotPrefix = cursor === 0 ? COLORS.cursor : "";
  const dotdotSuffix = cursor === 0 ? ANSI.reset : "";
  allRows.push(` ${dotdotPrefix}  \uf07c ..${dotdotSuffix}`);

  for (const [i, dir] of dirs.entries()) {
    const isCursor = cursor === i + 1;
    const prefix = isCursor ? COLORS.cursor : "";
    const suffix = isCursor ? ANSI.reset : "";

    let nameDisplay = dir.name;
    if (searchQuery) {
      const result = fuzzyMatch(searchQuery, dir.name);
      if (result.matches) {
        nameDisplay = highlightMatch(dir.name, result.positions, COLORS.matchHighlight, ANSI.reset);
      }
    }

    allRows.push(
      ` ${prefix}  ${COLORS.directory}${dir.icon} ${nameDisplay}/${ANSI.reset}${suffix}`,
    );
  }

  const visibleRows = allRows.slice(scrollOffset, scrollOffset + viewportHeight);
  for (const row of visibleRows) {
    lines.push(row);
  }

  for (let i = visibleRows.length; i < viewportHeight; i++) {
    lines.push("");
  }

  const totalDirs = dirs.length;
  lines.push(
    ` ${searchQuery ? `${totalDirs} matching | ` : ""}${totalDirs} director${totalDirs !== 1 ? "ies" : "y"}`,
  );

  if (notice) {
    lines.push(` ${COLORS.search}${notice}${ANSI.reset}`);
  } else {
    const hints = searchQuery
      ? `${COLORS.hint}Type:filter Left:del Up/Down:nav Right/Enter:open Esc:clear Esc:cancel${ANSI.reset}`
      : `${COLORS.hint}Left:parent Right:open Type:search g:path/bookmark Ctrl+F:fzf Enter:confirm Ctrl+R:reset Esc:cancel${ANSI.reset}`;
    lines.push(hints);
  }

  render(lines);
}

async function runExternalPickerAction<T>(action: () => Promise<T>): Promise<T> {
  exitAltScreen();
  exitRawMode();
  clearPreviousFrame();

  try {
    return await action();
  } finally {
    enterRawMode();
    await settleInputAfterExternalPicker();
    enterAltScreen();
    clearPreviousFrame();
  }
}
