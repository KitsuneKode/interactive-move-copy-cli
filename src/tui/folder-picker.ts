import { dirname, resolve } from "node:path";
import { ANSI, COLORS } from "../core/constants.ts";
import type { FileEntry, OperationMode } from "../core/types.ts";
import { invalidateCache, listDirectory } from "../fs/file-info.ts";
import { getViewportHeight, render } from "./renderer.ts";
import { getTerminalSize, readKey } from "./terminal.ts";

interface PickerResult {
  destination: string | null;
  cancelled: boolean;
}

export async function folderPicker(
  startDir: string,
  fileCount: number,
  mode: OperationMode,
): Promise<PickerResult> {
  const initialDir = resolve(startDir);
  let currentDir = initialDir;
  let cursor = 0;
  let scrollOffset = 0;

  while (true) {
    const allEntries = await listDirectory(currentDir);
    const dirs = allEntries.filter((e) => e.isDirectory && e.readable);

    const maxCursor = dirs.length; // 0 = "..", then dirs
    if (cursor > maxCursor) cursor = maxCursor;
    if (cursor < 0) cursor = 0;

    const viewportHeight = getViewportHeight();
    if (cursor < scrollOffset) scrollOffset = cursor;
    if (cursor >= scrollOffset + viewportHeight) scrollOffset = cursor - viewportHeight + 1;

    renderPicker(currentDir, dirs, cursor, scrollOffset, fileCount, mode);

    const key = await readKey();

    switch (key.name) {
      case "ctrl+c":
      case "escape":
        return { destination: null, cancelled: true };

      case "up":
        if (cursor > 0) cursor--;
        break;

      case "down":
        if (cursor < maxCursor) cursor++;
        break;

      case "left": {
        const parent = dirname(currentDir);
        if (parent !== currentDir) {
          currentDir = parent;
          cursor = 0;
          scrollOffset = 0;
          invalidateCache();
        }
        break;
      }

      case "right": {
        if (cursor > 0) {
          const dir = dirs[cursor - 1];
          if (dir) {
            currentDir = dir.path;
            cursor = 0;
            scrollOffset = 0;
            invalidateCache();
          }
        }
        break;
      }

      case "enter": {
        return { destination: currentDir, cancelled: false };
      }

      case "backspace": {
        const parent = dirname(currentDir);
        if (parent !== currentDir) {
          currentDir = parent;
          cursor = 0;
          scrollOffset = 0;
          invalidateCache();
        }
        break;
      }

      case "char":
        if (key.char === "c" || key.char === "C") {
          return { destination: currentDir, cancelled: false };
        }
        break;

      case "ctrl+r":
        currentDir = initialDir;
        cursor = 0;
        scrollOffset = 0;
        invalidateCache();
        break;
    }
  }
}

function renderPicker(
  currentDir: string,
  dirs: FileEntry[],
  cursor: number,
  scrollOffset: number,
  fileCount: number,
  mode: OperationMode,
): void {
  const { cols } = getTerminalSize();
  const viewportHeight = getViewportHeight();
  const modeLabel = mode === "move" ? "MOVE" : "COPY";
  const dirDisplay = currentDir.replace(process.env.HOME || "", "~");

  const lines: string[] = [];

  // Header
  lines.push(
    `${COLORS.header} ${modeLabel}: Select destination ${ANSI.reset}${COLORS.dim} ${dirDisplay} ${ANSI.reset}`,
  );

  // Info
  lines.push(
    ` ${COLORS.status}${fileCount} file${fileCount !== 1 ? "s" : ""} to ${mode}${ANSI.reset}`,
  );

  // Column header
  lines.push(` ${COLORS.dim}Directories${ANSI.reset}`);

  // Separator
  lines.push(` ${COLORS.dim}${"─".repeat(Math.min(cols - 2, 80))}${ANSI.reset}`);

  // Build rows
  const allRows: string[] = [];

  // ".." entry
  const dotdotPrefix = cursor === 0 ? COLORS.cursor : "";
  const dotdotSuffix = cursor === 0 ? ANSI.reset : "";
  allRows.push(` ${dotdotPrefix}  \uf07c ..${dotdotSuffix}`);

  for (const [i, dir] of dirs.entries()) {
    const isCursor = cursor === i + 1;
    const prefix = isCursor ? COLORS.cursor : "";
    const suffix = isCursor ? ANSI.reset : "";
    allRows.push(` ${prefix}  ${COLORS.directory}${dir.icon} ${dir.name}/${ANSI.reset}${suffix}`);
  }

  const visibleRows = allRows.slice(scrollOffset, scrollOffset + viewportHeight);
  for (const row of visibleRows) {
    lines.push(row);
  }

  for (let i = visibleRows.length; i < viewportHeight; i++) {
    lines.push("");
  }

  // Status
  lines.push(` ${dirs.length} director${dirs.length !== 1 ? "ies" : "y"}`);

  // Hints
  lines.push(
    ` ${COLORS.hint}Left:parent Right:open Enter:confirm Ctrl+R:reset Esc:cancel${ANSI.reset}`,
  );

  render(lines);
}
