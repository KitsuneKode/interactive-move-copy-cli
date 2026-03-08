import { join, dirname, resolve, basename } from "node:path";
import type { FileEntry, SelectionState, NavigationEntry, OperationMode } from "../core/types.ts";
import { ANSI, COLORS } from "../core/constants.ts";
import { readKey, getTerminalSize } from "./terminal.ts";
import { render, getViewportHeight, stripAnsi } from "./renderer.ts";
import { listDirectory, invalidateCache } from "../fs/file-info.ts";
import { fuzzyMatch, highlightMatch } from "./fuzzy.ts";
import { padColumn } from "../fs/format.ts";

interface BrowserResult {
  selected: string[];
  currentDir: string;
  cancelled: boolean;
}

export async function fileBrowser(startDir: string, mode: OperationMode): Promise<BrowserResult> {
  const state: SelectionState = {
    selected: new Set(),
    cursor: 0,
    scrollOffset: 0,
    searchQuery: "",
    currentDir: resolve(startDir),
  };

  const navStack: NavigationEntry[] = [];
  let showSelectedSummary = false;

  while (true) {
    const allEntries = await listDirectory(state.currentDir);
    const filtered = filterEntries(allEntries, state.searchQuery);
    const displayEntries = filtered;

    // Clamp cursor
    const maxCursor = displayEntries.length; // +1 for ".." at index 0
    if (state.cursor > maxCursor) state.cursor = maxCursor;
    if (state.cursor < 0) state.cursor = 0;

    // Adjust scroll
    const viewportHeight = getViewportHeight();
    if (state.cursor < state.scrollOffset) {
      state.scrollOffset = state.cursor;
    }
    if (state.cursor >= state.scrollOffset + viewportHeight) {
      state.scrollOffset = state.cursor - viewportHeight + 1;
    }

    renderBrowser(state, displayEntries, allEntries.length, mode, showSelectedSummary);
    showSelectedSummary = false;

    const key = await readKey();

    switch (key.name) {
      case "ctrl+c":
      case "escape":
        if (state.searchQuery) {
          state.searchQuery = "";
          state.cursor = 0;
          state.scrollOffset = 0;
        } else {
          return { selected: [], currentDir: state.currentDir, cancelled: true };
        }
        break;

      case "up":
        if (state.cursor > 0) state.cursor--;
        break;

      case "down":
        if (state.cursor < maxCursor) state.cursor++;
        break;

      case "left": {
        if (state.searchQuery) {
          state.searchQuery = state.searchQuery.slice(0, -1);
          state.cursor = 0;
          state.scrollOffset = 0;
        } else {
          goToParent(state, navStack);
        }
        break;
      }

      case "right": {
        openCurrentEntry(state, displayEntries, navStack);
        break;
      }

      case "space": {
        if (state.cursor === 0) break; // ".." row
        const entry = displayEntries[state.cursor - 1];
        if (entry && entry.readable) {
          if (state.selected.has(entry.path)) {
            state.selected.delete(entry.path);
          } else {
            state.selected.add(entry.path);
          }
        }
        if (state.cursor < maxCursor) state.cursor++;
        break;
      }

      case "enter": {
        const opened = openCurrentEntry(state, displayEntries, navStack);
        if (!opened && state.selected.size > 0) {
          return {
            selected: [...state.selected],
            currentDir: state.currentDir,
            cancelled: false,
          };
        }
        break;
      }

      case "backspace":
        if (state.searchQuery) {
          state.searchQuery = state.searchQuery.slice(0, -1);
          state.cursor = 0;
          state.scrollOffset = 0;
        } else {
          goToParent(state, navStack);
        }
        break;

      case "ctrl+a": {
        // Select all visible
        for (const entry of displayEntries) {
          if (entry.readable) state.selected.add(entry.path);
        }
        break;
      }

      case "ctrl+d": {
        // Deselect all
        state.selected.clear();
        break;
      }

      case "tab":
        showSelectedSummary = true;
        break;

      case "char":
        state.searchQuery += key.char;
        state.cursor = 0;
        state.scrollOffset = 0;
        break;
    }
  }
}

function goToParent(state: SelectionState, navStack: NavigationEntry[]): void {
  const parent = dirname(state.currentDir);
  if (parent !== state.currentDir) {
    navStack.push({ dir: state.currentDir, cursor: state.cursor, scrollOffset: state.scrollOffset });
    state.currentDir = parent;
    state.cursor = 0;
    state.scrollOffset = 0;
    state.searchQuery = "";
    invalidateCache();
  }
}

function openCurrentEntry(
  state: SelectionState,
  entries: FileEntry[],
  navStack: NavigationEntry[],
): boolean {
  if (state.cursor === 0) {
    goToParent(state, navStack);
    return true;
  }

  const entry = entries[state.cursor - 1];
  if (entry?.isDirectory && entry.readable) {
    navStack.push({ dir: state.currentDir, cursor: state.cursor, scrollOffset: state.scrollOffset });
    state.currentDir = entry.path;
    state.cursor = 0;
    state.scrollOffset = 0;
    state.searchQuery = "";
    invalidateCache();
    return true;
  }

  return false;
}

function filterEntries(entries: FileEntry[], query: string): FileEntry[] {
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

function renderBrowser(
  state: SelectionState,
  entries: FileEntry[],
  totalCount: number,
  mode: OperationMode,
  showSummary: boolean,
): void {
  const { cols, rows } = getTerminalSize();
  const viewportHeight = getViewportHeight();
  const modeLabel = mode === "move" ? "MOVE" : "COPY";
  const dirDisplay = state.currentDir.replace(process.env.HOME || "", "~");

  const lines: string[] = [];

  // Header
  lines.push(
    `${COLORS.header} ${modeLabel}: Select source files ${ANSI.reset}${COLORS.dim} ${dirDisplay} ${ANSI.reset}`
  );

  // Search bar
  const searchDisplay = state.searchQuery
    ? `${COLORS.search}Search: ${state.searchQuery}${ANSI.reset}${COLORS.dim}_${ANSI.reset}`
    : `${COLORS.dim}Type to search...${ANSI.reset}`;
  lines.push(` ${searchDisplay}`);

  // Column headers
  const nameWidth = Math.max(cols - 30, 20);
  lines.push(
    ` ${COLORS.dim}${padColumn("Name", nameWidth)}${"Size".padStart(10)}  ${"Modified".padStart(14)}${ANSI.reset}`
  );

  // Separator
  lines.push(` ${COLORS.dim}${"─".repeat(Math.min(cols - 2, 80))}${ANSI.reset}`);

  // File list with ".." at top
  const allRows: string[] = [];

  // ".." entry
  const dotdotLine = formatDotDotRow(state.cursor === 0, nameWidth);
  allRows.push(dotdotLine);

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const isCursor = state.cursor === i + 1;
    const isSelected = state.selected.has(entry.path);
    allRows.push(formatEntryRow(entry, isCursor, isSelected, state.searchQuery, nameWidth));
  }

  // Apply viewport scrolling
  const visibleRows = allRows.slice(state.scrollOffset, state.scrollOffset + viewportHeight);
  for (const row of visibleRows) {
    lines.push(row);
  }

  // Pad remaining viewport space
  for (let i = visibleRows.length; i < viewportHeight; i++) {
    lines.push("");
  }

  // Status bar
  const selectedCount = state.selected.size;
  const matchCount = entries.length;
  lines.push(
    ` ${COLORS.status}${selectedCount} selected${ANSI.reset} | ` +
    `${matchCount} matching | ${totalCount} total`
  );

  // Keybind hints or summary
  if (showSummary && state.selected.size > 0) {
    const names = [...state.selected].map((p) => basename(p)).join(", ");
    lines.push(` ${COLORS.dim}Selected: ${names}${ANSI.reset}`);
  } else {
    lines.push(
      ` ${COLORS.hint}Left:parent Right:open Space:toggle Enter:confirm Esc:quit${ANSI.reset}`
    );
  }

  render(lines);
}

function formatDotDotRow(isCursor: boolean, nameWidth: number): string {
  const prefix = isCursor ? `${COLORS.cursor}` : "";
  const suffix = isCursor ? ANSI.reset : "";
  return ` ${prefix}     ${padColumn("\uf07c ..", nameWidth)}${suffix}`;
}

function formatEntryRow(
  entry: FileEntry,
  isCursor: boolean,
  isSelected: boolean,
  query: string,
  nameWidth: number,
): string {
  const checkbox = isSelected
    ? `${COLORS.checkbox}[x]${ANSI.reset}`
    : `${COLORS.dim}[ ]${ANSI.reset}`;

  let nameDisplay = entry.name;
  if (query) {
    const result = fuzzyMatch(query, entry.name);
    if (result.matches) {
      nameDisplay = highlightMatch(entry.name, result.positions, COLORS.matchHighlight, ANSI.reset);
    }
  }

  let coloredName: string;
  if (!entry.readable) {
    coloredName = `${COLORS.dim}${entry.icon} ${nameDisplay}${ANSI.reset}`;
  } else if (entry.isDirectory) {
    coloredName = `${COLORS.directory}${entry.icon} ${nameDisplay}/${ANSI.reset}`;
  } else if (entry.isSymlink) {
    coloredName = `${COLORS.symlink}${entry.icon} ${nameDisplay}${ANSI.reset}`;
  } else {
    coloredName = `${entry.icon} ${nameDisplay}`;
  }

  const sizePart = entry.formattedSize.padStart(10);
  const datePart = entry.formattedDate.padStart(14);

  // Pad the name column (approximate with stripped ANSI)
  const strippedName = stripAnsi(coloredName);
  const namePad = Math.max(0, nameWidth - strippedName.length);

  const line = ` ${checkbox} ${coloredName}${" ".repeat(namePad)}${sizePart}  ${datePart}`;

  if (isCursor) {
    return `${COLORS.cursor}${line}${ANSI.reset}`;
  }
  return line;
}
