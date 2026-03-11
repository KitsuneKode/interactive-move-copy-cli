import { spawn } from "node:child_process";
import { ensureConfigFile } from "../config.ts";

function escapeShellArg(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function getEditorCommand(): string {
  return process.env.VISUAL || process.env.EDITOR || "nano";
}

const result = await ensureConfigFile();
const editor = getEditorCommand();
const command = `${editor} ${escapeShellArg(result.path)}`;

const child = spawn(command, {
  shell: true,
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

child.on("error", (err) => {
  console.error(`Failed to open editor "${editor}": ${err.message}`);
  process.exit(1);
});
