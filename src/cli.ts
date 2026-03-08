import { stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { ANSI, COLORS } from "./core/constants.ts";
import type { OperationMode } from "./core/types.ts";
import { executeOperation, printSummary, recoverPendingOperations } from "./ops/executor.ts";
import { validateOperation } from "./ops/validator.ts";
import { fileBrowser } from "./tui/file-browser.ts";
import { folderPicker } from "./tui/folder-picker.ts";
import { clearPreviousFrame } from "./tui/renderer.ts";
import {
  cleanup,
  enterAltScreen,
  enterRawMode,
  exitAltScreen,
  exitRawMode,
  readKey,
} from "./tui/terminal.ts";

const VERSION = "1.0.0";

function printHelp(mode: OperationMode): void {
  const cmd = mode === "move" ? "mvi" : "cpi";
  const action = mode === "move" ? "move" : "copy";
  console.log(`
${cmd} v${VERSION} - Interactive file ${action} tool

Usage: ${cmd} [directory]

Options:
  -h, --help      Show this help
  -v, --version   Show version

Keybindings (source selection):
  Up/Down     Navigate files
  Left        Go to parent / delete search char
  Right       Open directory
  Space       Toggle selection
  Enter       Open directory / confirm selection
  Backspace   Go to parent / delete search char
  Ctrl+A      Select all visible
  Ctrl+D      Deselect all
  Tab         Show selected files
  Esc         Clear search / quit
  Type        Fuzzy search

Keybindings (destination):
  Up/Down     Navigate directories
  Left        Go to parent
  Right       Open directory
  Enter       Open directory
  c           Confirm current directory
  Backspace   Go to parent
  Esc         Cancel
`);
}

export async function run(mode: OperationMode): Promise<void> {
  const args = process.argv.slice(2);
  const recovery = await recoverPendingOperations();

  if (!recovery.canProceed) {
    for (const message of recovery.messages) {
      console.error(message);
    }
    process.exitCode = 1;
    return;
  }

  for (const message of recovery.messages) {
    console.log(message);
  }

  for (const arg of args) {
    if (arg === "-h" || arg === "--help") {
      printHelp(mode);
      return;
    }
    if (arg === "-v" || arg === "--version") {
      console.log(VERSION);
      return;
    }
  }

  const startDir = args[0] ? resolve(args[0]) : process.cwd();

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error(`${mode === "move" ? "mvi" : "cpi"} requires an interactive TTY.`);
    process.exitCode = 1;
    return;
  }

  try {
    const startDirStat = await stat(startDir);
    if (!startDirStat.isDirectory()) {
      console.error(`Start path "${startDir}" is not a directory.`);
      process.exitCode = 1;
      return;
    }
  } catch {
    console.error(`Start directory "${startDir}" does not exist.`);
    process.exitCode = 1;
    return;
  }

  // Phase 1: Select source files
  enterRawMode();
  enterAltScreen();
  clearPreviousFrame();

  const browserResult = await fileBrowser(startDir, mode);

  if (browserResult.cancelled || browserResult.selected.length === 0) {
    cleanup();
    console.log("No files selected. Aborted.");
    return;
  }

  // Phase 2: Select destination
  clearPreviousFrame();
  const pickerResult = await folderPicker(
    browserResult.currentDir,
    browserResult.selected.length,
    mode,
  );

  if (pickerResult.cancelled || !pickerResult.destination) {
    cleanup();
    console.log("No destination selected. Aborted.");
    return;
  }

  // Phase 3: Validate
  const validation = await validateOperation(
    browserResult.selected,
    pickerResult.destination,
    mode,
  );

  if (!validation.valid) {
    cleanup();
    console.log(`${COLORS.error}Validation errors:${ANSI.reset}`);
    for (const err of validation.errors) {
      console.log(`  ${COLORS.fail}✗${ANSI.reset} ${err}`);
    }
    return;
  }

  // Handle conflicts
  let overwrite = false;
  if (validation.conflicts.length > 0) {
    exitAltScreen();
    exitRawMode();

    // const verb = mode === "move" ? "Move" : "Copy";
    console.log(`\n${COLORS.search}Name conflicts at destination:${ANSI.reset}`);
    for (const name of validation.conflicts) {
      console.log(`  - ${name}`);
    }

    enterRawMode();
    process.stdout.write(`\nOverwrite? [y/N/s(kip conflicts)] `);
    const key = await readKey();
    exitRawMode();

    if (key.char === "y" || key.char === "Y") {
      overwrite = true;
    } else if (key.char === "s" || key.char === "S") {
      // Remove conflicting files from selection
      const conflictSet = new Set(validation.conflicts);
      const filtered = browserResult.selected.filter((s) => !conflictSet.has(basename(s)));
      if (filtered.length === 0) {
        console.log("\nAll files conflict. Aborted.");
        return;
      }
      browserResult.selected.length = 0;
      browserResult.selected.push(...filtered);
    } else {
      console.log("\nAborted.");
      return;
    }
  }

  // Phase 4: Confirmation
  exitAltScreen();
  exitRawMode();

  const verb = mode === "move" ? "Move" : "Copy";
  const destDisplay = pickerResult.destination.replace(process.env.HOME || "", "~");
  console.log(
    `\n${verb} ${browserResult.selected.length} file${browserResult.selected.length !== 1 ? "s" : ""} to ${COLORS.header}${destDisplay}${ANSI.reset}?`,
  );
  for (const s of browserResult.selected) {
    console.log(`  ${basename(s)}`);
  }

  enterRawMode();
  process.stdout.write(`\n[Y/n] `);
  const confirmKey = await readKey();
  exitRawMode();

  if (confirmKey.char === "n" || confirmKey.char === "N") {
    console.log("\nAborted.");
    return;
  }

  console.log("");

  // Phase 5: Execute
  const results = await executeOperation(
    browserResult.selected,
    pickerResult.destination,
    mode,
    overwrite,
  );

  printSummary(results, mode);
}
