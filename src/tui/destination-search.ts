import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import type { DestinationSearchConfig } from "../config.ts";

export interface DestinationSearchContext {
  config: DestinationSearchConfig;
  recentDirectories: string[];
}

export interface DestinationSearchResult {
  path: string | null;
  message?: string;
}

const executableCache = new Map<string, boolean>();

export function expandUserPath(input: string, homeDir: string = homedir()): string {
  if (input === "~") {
    return homeDir;
  }

  if (input.startsWith("~/")) {
    return join(homeDir, input.slice(2));
  }

  return input;
}

export function resolveDirectoryInput(
  input: string,
  currentDir: string,
  homeDir: string = homedir(),
): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return currentDir;
  }

  const expanded = expandUserPath(trimmed, homeDir);
  return isAbsolute(expanded) ? resolve(expanded) : resolve(currentDir, expanded);
}

function hasExecutable(command: string): boolean {
  const cached = executableCache.get(command);
  if (cached !== undefined) {
    return cached;
  }

  const result = Bun.spawnSync({
    cmd: ["sh", "-lc", `command -v ${command} >/dev/null 2>&1`],
    stdout: "ignore",
    stderr: "ignore",
  });

  const available = result.exitCode === 0;
  executableCache.set(command, available);
  return available;
}

function getDirectoryScanner(): { command: string; args: string[] } | null {
  if (hasExecutable("fd")) {
    return {
      command: "fd",
      args: ["--type", "d", "--hidden", "--follow", "--exclude", ".git", "--absolute-path", "."],
    };
  }

  if (hasExecutable("fdfind")) {
    return {
      command: "fdfind",
      args: ["--type", "d", "--hidden", "--follow", "--exclude", ".git", "--absolute-path", "."],
    };
  }

  if (hasExecutable("find")) {
    return {
      command: "find",
      args: ["-type", "d"],
    };
  }

  return null;
}

export function getDirectoryScannerArgsForTest(): { command: string; args: string[] } | null {
  return getDirectoryScanner();
}

function getDefaultContext(): DestinationSearchContext {
  return {
    config: {
      roots: ["~"],
      bookmarks: {},
      rememberRecent: true,
      recentLimit: 8,
    },
    recentDirectories: [],
  };
}

function resolveConfiguredRoots(context: DestinationSearchContext, currentDir: string): string[] {
  const configuredRoots = context.config.roots.length > 0 ? context.config.roots : ["~"];
  const resolvedRoots = configuredRoots
    .map((entry) => resolveDirectoryInput(entry, currentDir))
    .filter((entry, index, arr) => entry.length > 0 && arr.indexOf(entry) === index)
    .filter((entry) => {
      try {
        return statSync(entry).isDirectory();
      } catch {
        return false;
      }
    });

  return resolvedRoots.length > 0 ? resolvedRoots : [homedir() || currentDir];
}

function resolveBookmarks(
  context: DestinationSearchContext,
  currentDir: string,
): Record<string, string> {
  const resolved: Record<string, string> = {};

  for (const [name, path] of Object.entries(context.config.bookmarks)) {
    const destination = resolveDirectoryInput(path, currentDir);
    try {
      if (statSync(destination).isDirectory()) {
        resolved[name] = destination;
      }
    } catch {
      // Ignore invalid bookmarks until the user fixes them.
    }
  }

  return resolved;
}

function buildInitialCandidates(context: DestinationSearchContext, currentDir: string): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();

  for (const [, path] of Object.entries(resolveBookmarks(context, currentDir))) {
    if (seen.has(path)) {
      continue;
    }
    seen.add(path);
    candidates.push(path);
  }

  for (const path of context.recentDirectories) {
    const resolvedPath = resolveDirectoryInput(path, currentDir);
    if (seen.has(resolvedPath) || !existsSync(resolvedPath)) {
      continue;
    }

    try {
      if (!statSync(resolvedPath).isDirectory()) {
        continue;
      }
    } catch {
      continue;
    }

    seen.add(resolvedPath);
    candidates.push(resolvedPath);
  }

  return candidates;
}

async function promptForLine(prompt: string): Promise<string | null> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question(prompt);
    return answer.trim() || null;
  } finally {
    rl.close();
  }
}

function collectStdout(stream: NodeJS.ReadableStream | null): Promise<string> {
  if (!stream) {
    return Promise.resolve("");
  }

  return new Promise((resolve, reject) => {
    let output = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      output += chunk;
    });
    stream.on("end", () => resolve(output));
    stream.on("error", reject);
  });
}

async function waitForClose(child: ReturnType<typeof spawn>): Promise<number | null> {
  return new Promise((resolve, reject) => {
    child.on("close", resolve);
    child.on("error", reject);
  });
}

function parseSelectedCandidate(output: string): string | null {
  const trimmed = output.trim();
  if (!trimmed) {
    return null;
  }

  return resolve(trimmed);
}

function resolveBookmarkAlias(
  input: string,
  context: DestinationSearchContext,
  currentDir: string,
): string | null {
  const alias = input.trim();
  if (!alias) {
    return null;
  }

  const bookmarks = resolveBookmarks(context, currentDir);
  return bookmarks[alias] ?? null;
}

async function runFzfDirectorySearch(
  currentDir: string,
  context: DestinationSearchContext,
  initialQuery = "",
): Promise<DestinationSearchResult> {
  const scanner = getDirectoryScanner();
  if (!scanner) {
    return {
      path: null,
      message: "No directory scanner found. Install `fd`, `fdfind`, or `find` support.",
    };
  }

  const roots = resolveConfiguredRoots(context, currentDir);
  const initialCandidates = buildInitialCandidates(context, currentDir);

  const producerScript = `
    {
      ${initialCandidates.map((candidate) => `printf '%s\\n' ${JSON.stringify(candidate)};`).join("\n      ")}
      ${roots
        .map((root) => {
          if (scanner.command === "find") {
            return `${scanner.command} ${JSON.stringify(root)} ${scanner.args.map((arg) => JSON.stringify(arg)).join(" ")}`;
          }

          return `${scanner.command} ${scanner.args.map((arg) => JSON.stringify(arg)).join(" ")} ${JSON.stringify(root)}`;
        })
        .join("\n      ")}
    } | awk '!seen[$0]++'`;

  const producer = spawn("sh", ["-lc", producerScript], {
    stdio: ["ignore", "pipe", "ignore"],
  });

  const fzfArgs = [
    "--prompt",
    "target> ",
    "--select-1",
    "--exit-0",
    "--bind",
    "enter:accept",
    "--preview-window",
    "hidden",
  ];
  if (initialQuery) {
    fzfArgs.push("--query", initialQuery);
  }

  const fzf = spawn("fzf", fzfArgs, {
    stdio: ["pipe", "pipe", "inherit"],
    env: {
      ...process.env,
      FZF_DEFAULT_OPTS_FILE: "/dev/null",
      FZF_DEFAULT_OPTS: "--layout=reverse --height=100% --border --ansi --no-multi",
    },
  });

  producer.stdout?.pipe(fzf.stdin);

  const [output, fzfExitCode] = await Promise.all([collectStdout(fzf.stdout), waitForClose(fzf)]);
  await waitForClose(producer).catch(() => null);

  if (fzfExitCode !== 0) {
    return { path: null };
  }

  const selected = parseSelectedCandidate(output);
  return selected ? { path: selected } : { path: null };
}

export async function promptForDestinationPath(
  currentDir: string,
  context: DestinationSearchContext = getDefaultContext(),
): Promise<DestinationSearchResult> {
  const answer = await promptForLine("Jump to directory or bookmark: ");
  if (!answer) {
    return { path: null };
  }

  const bookmarkPath = resolveBookmarkAlias(answer, context, currentDir);
  const resolved = bookmarkPath ?? resolveDirectoryInput(answer, currentDir);

  if (!existsSync(resolved)) {
    return {
      path: null,
      message: `Directory not found: ${answer}`,
    };
  }

  if (!statSync(resolved).isDirectory()) {
    return {
      path: null,
      message: `Not a directory: ${answer}`,
    };
  }

  return {
    path: resolved,
  };
}

export async function searchDestinationWithFzf(
  currentDir: string,
  context: DestinationSearchContext = getDefaultContext(),
  initialQuery = "",
): Promise<DestinationSearchResult> {
  if (!hasExecutable("fzf")) {
    return promptForDestinationPath(currentDir, context);
  }

  return runFzfDirectorySearch(currentDir, context, initialQuery);
}
