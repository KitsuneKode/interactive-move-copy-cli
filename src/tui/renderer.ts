import { ANSI, COLORS } from "../core/constants.ts";
import { getTerminalSize } from "./terminal.ts";

let previousLines: string[] = [];

export function getViewportHeight(): number {
  const { rows } = getTerminalSize();
  return Math.max(rows - 6, 1); // header + search + colheaders + separator + status + hints
}

export function render(lines: string[]): void {
  const { rows, cols } = getTerminalSize();

  if (cols < 40 || rows < 10) {
    const msg = "Terminal too small. Resize to at least 40x10.";
    process.stdout.write(
      ANSI.clearScreen +
      ANSI.moveTo(Math.floor(rows / 2), Math.max(1, Math.floor((cols - msg.length) / 2))) +
      COLORS.error + msg + ANSI.reset
    );
    previousLines = [];
    return;
  }

  let output = "";

  for (let i = 0; i < rows; i++) {
    const line = lines[i] ?? "";
    const prev = previousLines[i];
    if (line !== prev) {
      // Truncate to terminal width (approximate - ANSI codes complicate this)
      output += ANSI.moveTo(i + 1, 1) + ANSI.clearLine + line;
    }
  }

  if (output) {
    process.stdout.write(output);
  }

  previousLines = [...lines];
}

export function clearPreviousFrame(): void {
  previousLines = [];
}

export function truncate(str: string, maxLen: number): string {
  // Strip ANSI codes for length calculation
  const stripped = stripAnsi(str);
  if (stripped.length <= maxLen) return str;

  // Walk through string tracking visible length
  let visible = 0;
  let i = 0;
  let result = "";
  while (i < str.length && visible < maxLen - 1) {
    if (str[i] === "\x1b") {
      const end = str.indexOf("m", i);
      if (end !== -1) {
        result += str.slice(i, end + 1);
        i = end + 1;
        continue;
      }
    }
    result += str[i];
    visible++;
    i++;
  }
  return result + ANSI.reset + "\u2026";
}

export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

export function padRight(str: string, width: number): string {
  const visible = stripAnsi(str).length;
  if (visible >= width) return str;
  return str + " ".repeat(width - visible);
}
