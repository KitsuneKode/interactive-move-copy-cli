import { ANSI, KEYS } from "../core/constants.ts";
import type { KeyEvent } from "../core/types.ts";

let rawModeEnabled = false;
let altScreenEnabled = false;

const PASTE_START = "\x1b[200~";
const PASTE_END = "\x1b[201~";

function isPasteStart(data: string): boolean {
  return data === PASTE_START;
}

function isPasteEnd(data: string): boolean {
  return data === PASTE_END;
}

export function enterRawMode(): void {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    rawModeEnabled = true;
  }
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
}

export function exitRawMode(): void {
  if (process.stdin.isTTY && rawModeEnabled) {
    process.stdin.setRawMode(false);
    rawModeEnabled = false;
  }
  process.stdin.pause();
}

export function enterAltScreen(): void {
  if (process.stdout.isTTY) {
    process.stdout.write(ANSI.altScreenOn + ANSI.cursorHide);
    altScreenEnabled = true;
  }
}

export function exitAltScreen(): void {
  if (altScreenEnabled) {
    process.stdout.write(ANSI.cursorShow + ANSI.altScreenOff);
    altScreenEnabled = false;
  }
}

export function cleanup(): void {
  exitAltScreen();
  exitRawMode();
}

export function getTerminalSize(): { rows: number; cols: number } {
  return {
    rows: process.stdout.rows || 24,
    cols: process.stdout.columns || 80,
  };
}

export function parseKeyEvent(data: string): KeyEvent {
  const raw = Buffer.from(data);

  // Ctrl combinations
  if (data === KEYS.CTRL_C) return { name: "ctrl+c", raw, ctrl: true, shift: false, char: "c" };
  if (data === KEYS.CTRL_A) return { name: "ctrl+a", raw, ctrl: true, shift: false, char: "a" };
  if (data === KEYS.CTRL_D) return { name: "ctrl+d", raw, ctrl: true, shift: false, char: "d" };
  if (data === KEYS.CTRL_F) return { name: "ctrl+f", raw, ctrl: true, shift: false, char: "f" };
  if (data === KEYS.CTRL_R) return { name: "ctrl+r", raw, ctrl: true, shift: false, char: "r" };

  // Special keys
  if (data === KEYS.UP) return { name: "up", raw, ctrl: false, shift: false, char: "" };
  if (data === KEYS.DOWN) return { name: "down", raw, ctrl: false, shift: false, char: "" };
  if (data === KEYS.LEFT) return { name: "left", raw, ctrl: false, shift: false, char: "" };
  if (data === KEYS.RIGHT) return { name: "right", raw, ctrl: false, shift: false, char: "" };
  if (data === KEYS.ENTER) return { name: "enter", raw, ctrl: false, shift: false, char: "" };
  if (data === KEYS.SPACE) return { name: "space", raw, ctrl: false, shift: false, char: " " };
  if (data === KEYS.BACKSPACE)
    return { name: "backspace", raw, ctrl: false, shift: false, char: "" };
  if (data === KEYS.TAB) return { name: "tab", raw, ctrl: false, shift: false, char: "" };
  if (data === KEYS.ESCAPE) return { name: "escape", raw, ctrl: false, shift: false, char: "" };

  // Printable character
  if (data.length === 1 && data.charCodeAt(0) >= 32 && data.charCodeAt(0) <= 126) {
    return { name: "char", raw, ctrl: false, shift: false, char: data };
  }

  return { name: "unknown", raw, ctrl: false, shift: false, char: data };
}

export function readKey(): Promise<KeyEvent> {
  return new Promise((resolve) => {
    let pasteBuffer = "";
    let inPaste = false;

    const handler = (data: string) => {
      if (isPasteStart(data)) {
        inPaste = true;
        pasteBuffer = "";
        return;
      }

      if (isPasteEnd(data)) {
        process.stdin.removeListener("data", handler);
        const raw = Buffer.from(pasteBuffer);
        resolve({
          name: "paste",
          raw,
          ctrl: false,
          shift: false,
          char: "",
          text: pasteBuffer,
        });
        return;
      }

      if (inPaste) {
        pasteBuffer += data;
        return;
      }

      process.stdin.removeListener("data", handler);
      resolve(parseKeyEvent(data));
    };

    process.stdin.on("data", handler);
  });
}

export function discardBufferedInput(): void {
  if (!process.stdin.readable) {
    return;
  }

  while (process.stdin.read() !== null) {
    // Drain buffered bytes so external pickers do not leak enter/escape back into the TUI.
  }
}

export async function settleInputAfterExternalPicker(durationMs = 40): Promise<void> {
  discardBufferedInput();

  if (!process.stdin.readable) {
    return;
  }

  await new Promise<void>((resolve) => {
    const drain = () => {
      discardBufferedInput();
    };

    process.stdin.on("data", drain);

    setTimeout(() => {
      process.stdin.off("data", drain);
      discardBufferedInput();
      resolve();
    }, durationMs);
  });
}

export function onResize(callback: () => void): void {
  process.stdout.on("resize", callback);
}

// Install cleanup handlers
process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(143);
});
