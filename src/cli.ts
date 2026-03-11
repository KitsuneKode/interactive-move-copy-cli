import { stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { loadConfig } from "./config.ts";
import { ANSI, COLORS } from "./core/constants.ts";
import type { OperationMode, RemovalMode } from "./core/types.ts";
import {
  executeOperation,
  executeRemovalOperation,
  printSummary,
  recoverPendingOperations,
} from "./ops/executor.ts";
import { validateOperation, validateRemovalOperation } from "./ops/validator.ts";
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

interface ParsedArgs {
  showHelp: boolean;
  showVersion: boolean;
  startDir: string;
  removalModeOverride?: RemovalMode;
}

function getCommandName(mode: OperationMode): string {
  if (mode === "move") return "mvi";
  if (mode === "copy") return "cpi";
  return "rmi";
}

function getActionLabel(mode: OperationMode): string {
  if (mode === "move") return "move";
  if (mode === "copy") return "copy";
  return "remove";
}

function parseArgs(mode: OperationMode, args: string[]): ParsedArgs {
  let showHelp = false;
  let showVersion = false;
  let removalModeOverride: RemovalMode | undefined;
  const positionals: string[] = [];

  for (const arg of args) {
    if (arg === "-h" || arg === "--help") {
      showHelp = true;
      continue;
    }

    if (arg === "-v" || arg === "--version") {
      showVersion = true;
      continue;
    }

    if (mode === "remove" && arg === "--trash") {
      removalModeOverride = "trash";
      continue;
    }

    if (mode === "remove" && arg === "--hard-delete") {
      removalModeOverride = "hard-delete";
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    positionals.push(arg);
  }

  if (positionals.length > 1) {
    throw new Error(`Usage: ${getCommandName(mode)} [directory]`);
  }

  return {
    showHelp,
    showVersion,
    startDir: positionals[0] ? resolve(positionals[0]) : process.cwd(),
    removalModeOverride,
  };
}

function printHelp(mode: OperationMode): void {
  const cmd = getCommandName(mode);
  const action = getActionLabel(mode);
  const destinationSection =
    mode === "remove"
      ? ""
      : `
Keybindings (destination):
  Up/Down     Navigate directories
  Left        Go to parent
  Right       Open directory
  Enter       Confirm current directory
  c           Confirm current directory
  Backspace   Go to parent
  Ctrl+R      Reset to the starting directory
  Esc         Cancel
`;

  console.log(`
${cmd} v${VERSION} - Interactive file ${action} tool

Usage: ${cmd} [directory]

Options:
  -h, --help      Show this help
  -v, --version   Show version${mode === "remove" ? "\n  --trash          Move items to trash (default)\n  --hard-delete    Permanently delete items" : ""}
Keybindings (source selection):
  Up/Down     Navigate files
  Left        Go to parent / delete search char
  Right       Open directory
  Space       Toggle selection
  Enter       Confirm selection
  Backspace   Go to parent / delete search char
  Ctrl+A      Select all visible
  Ctrl+D      Deselect all
  Ctrl+R      Reset to the starting directory/state
  Tab         Show selected files
  Esc         Clear search / quit
  Type        Fuzzy search${destinationSection}
`);
}

async function confirmSelection(prompt: string): Promise<boolean> {
  enterRawMode();
  process.stdout.write(prompt);
  const confirmKey = await readKey();
  exitRawMode();

  return confirmKey.char !== "n" && confirmKey.char !== "N";
}

export async function run(mode: OperationMode): Promise<void> {
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

  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(mode, process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }

  if (parsed.showHelp) {
    printHelp(mode);
    return;
  }

  if (parsed.showVersion) {
    console.log(VERSION);
    return;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error(`${getCommandName(mode)} requires an interactive TTY.`);
    process.exitCode = 1;
    return;
  }

  try {
    const startDirStat = await stat(parsed.startDir);
    if (!startDirStat.isDirectory()) {
      console.error(`Start path "${parsed.startDir}" is not a directory.`);
      process.exitCode = 1;
      return;
    }
  } catch {
    console.error(`Start directory "${parsed.startDir}" does not exist.`);
    process.exitCode = 1;
    return;
  }

  const config = await loadConfig();
  const removalMode = parsed.removalModeOverride ?? config.rmi.mode;

  enterRawMode();
  enterAltScreen();
  clearPreviousFrame();

  const browserResult = await fileBrowser(parsed.startDir, mode);

  if (browserResult.cancelled || browserResult.selected.length === 0) {
    cleanup();
    console.log("No files selected. Aborted.");
    return;
  }

  if (mode === "remove") {
    const validation = await validateRemovalOperation(browserResult.selected, removalMode);

    if (!validation.valid) {
      cleanup();
      console.log(`${COLORS.error}Validation errors:${ANSI.reset}`);
      for (const err of validation.errors) {
        console.log(`  ${COLORS.fail}✗${ANSI.reset} ${err}`);
      }
      return;
    }

    exitAltScreen();
    exitRawMode();

    const verb = removalMode === "trash" ? "Move to trash" : "Permanently delete";
    console.log(
      `\n${verb} ${browserResult.selected.length} item${browserResult.selected.length !== 1 ? "s" : ""}?`,
    );
    for (const selected of browserResult.selected) {
      console.log(`  ${basename(selected)}`);
    }

    const confirmed = await confirmSelection("\n[Y/n] ");
    if (!confirmed) {
      console.log("\nAborted.");
      return;
    }

    console.log("");
    const results = await executeRemovalOperation(browserResult.selected, removalMode);
    printSummary(results, mode);
    return;
  }

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

  let overwrite = false;
  if (validation.conflicts.length > 0) {
    exitAltScreen();
    exitRawMode();

    console.log(`\n${COLORS.search}Name conflicts at destination:${ANSI.reset}`);
    for (const name of validation.conflicts) {
      console.log(`  - ${name}`);
    }

    enterRawMode();
    process.stdout.write("\nOverwrite? [y/N/s(kip conflicts)] ");
    const key = await readKey();
    exitRawMode();

    if (key.char === "y" || key.char === "Y") {
      overwrite = true;
    } else if (key.char === "s" || key.char === "S") {
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

  exitAltScreen();
  exitRawMode();

  const verb = mode === "move" ? "Move" : "Copy";
  const destDisplay = pickerResult.destination.replace(process.env.HOME || "", "~");
  console.log(
    `\n${verb} ${browserResult.selected.length} file${browserResult.selected.length !== 1 ? "s" : ""} to ${COLORS.header}${destDisplay}${ANSI.reset}?`,
  );
  for (const selected of browserResult.selected) {
    console.log(`  ${basename(selected)}`);
  }

  const confirmed = await confirmSelection("\n[Y/n] ");
  if (!confirmed) {
    console.log("\nAborted.");
    return;
  }

  console.log("");
  const results = await executeOperation(
    browserResult.selected,
    pickerResult.destination,
    mode,
    overwrite,
  );

  printSummary(results, mode);
}
