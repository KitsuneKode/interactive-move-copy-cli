import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { RemovalMode } from "./core/types.ts";

export interface DestinationSearchConfig {
  roots: string[];
  bookmarks: Record<string, string>;
  rememberRecent: boolean;
  recentLimit: number;
}

export interface CliConfig {
  mvi: Record<string, never>;
  cpi: Record<string, never>;
  destinationSearch: DestinationSearchConfig;
  rmi: {
    mode: RemovalMode;
  };
}

export interface CliState {
  destinationSearch: {
    recentDirectories: string[];
  };
}

export interface EnsureConfigResult {
  config: CliConfig;
  created: boolean;
  updated: boolean;
  path: string;
}

export const DEFAULT_DESTINATION_SEARCH: DestinationSearchConfig = {
  roots: ["~"],
  bookmarks: {},
  rememberRecent: true,
  recentLimit: 8,
};

export const DEFAULT_CONFIG: CliConfig = {
  mvi: {},
  cpi: {},
  destinationSearch: DEFAULT_DESTINATION_SEARCH,
  rmi: {
    mode: "trash",
  },
};

export const DEFAULT_STATE: CliState = {
  destinationSearch: {
    recentDirectories: [],
  },
};

function isRemovalMode(value: unknown): value is RemovalMode {
  return value === "trash" || value === "hard-delete";
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === "string");
}

function normalizeDestinationSearchConfig(value: unknown): DestinationSearchConfig {
  const parsed =
    value && typeof value === "object" ? (value as Partial<DestinationSearchConfig>) : {};

  return {
    roots:
      parsed.roots?.filter(
        (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
      ) ?? DEFAULT_DESTINATION_SEARCH.roots,
    bookmarks: isStringRecord(parsed.bookmarks)
      ? parsed.bookmarks
      : DEFAULT_DESTINATION_SEARCH.bookmarks,
    rememberRecent:
      typeof parsed.rememberRecent === "boolean"
        ? parsed.rememberRecent
        : DEFAULT_DESTINATION_SEARCH.rememberRecent,
    recentLimit:
      typeof parsed.recentLimit === "number" &&
      Number.isInteger(parsed.recentLimit) &&
      parsed.recentLimit > 0
        ? parsed.recentLimit
        : DEFAULT_DESTINATION_SEARCH.recentLimit,
  };
}

function normalizeConfig(parsed?: Partial<CliConfig> | null): CliConfig {
  return {
    mvi: {},
    cpi: {},
    destinationSearch: normalizeDestinationSearchConfig(parsed?.destinationSearch),
    rmi: {
      mode: isRemovalMode(parsed?.rmi?.mode) ? parsed.rmi.mode : DEFAULT_CONFIG.rmi.mode,
    },
  };
}

function normalizeState(parsed?: Partial<CliState> | null): CliState {
  const recentDirectories =
    parsed?.destinationSearch?.recentDirectories?.filter(
      (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
    ) ?? DEFAULT_STATE.destinationSearch.recentDirectories;

  return {
    destinationSearch: {
      recentDirectories,
    },
  };
}

function configToJson(config: CliConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

function stateToJson(state: CliState): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

export function getConfigPath(): string {
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(configHome, "interactive-move-copy-cli", "config.json");
}

export function getStatePath(): string {
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(configHome, "interactive-move-copy-cli", "state.json");
}

export async function ensureConfigFile(): Promise<EnsureConfigResult> {
  const path = getConfigPath();
  await mkdir(dirname(path), { recursive: true });

  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<CliConfig>;
    const normalized = normalizeConfig(parsed);
    const updated = raw !== configToJson(normalized);

    if (updated) {
      await writeFile(path, configToJson(normalized), "utf8");
    }

    return {
      config: normalized,
      created: false,
      updated,
      path,
    };
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(`Config file is not valid JSON: ${path}`);
    }

    const error = err as NodeJS.ErrnoException;
    if (error.code !== "ENOENT") {
      throw error;
    }

    await writeFile(path, configToJson(DEFAULT_CONFIG), "utf8");
    return {
      config: DEFAULT_CONFIG,
      created: true,
      updated: false,
      path,
    };
  }
}

export async function loadConfig(): Promise<CliConfig> {
  const result = await ensureConfigFile();
  return result.config;
}

export async function loadState(): Promise<CliState> {
  const path = getStatePath();
  await mkdir(dirname(path), { recursive: true });

  try {
    const raw = await readFile(path, "utf8");
    return normalizeState(JSON.parse(raw) as Partial<CliState>);
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(`State file is not valid JSON: ${path}`);
    }

    const error = err as NodeJS.ErrnoException;
    if (error.code !== "ENOENT") {
      throw error;
    }

    await writeFile(path, stateToJson(DEFAULT_STATE), "utf8");
    return DEFAULT_STATE;
  }
}

export async function saveState(state: CliState): Promise<void> {
  const path = getStatePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, stateToJson(normalizeState(state)), "utf8");
}

export async function recordRecentDestination(
  destination: string,
  config: CliConfig,
): Promise<void> {
  if (!config.destinationSearch.rememberRecent) {
    return;
  }

  const state = await loadState();
  const deduped = [
    destination,
    ...state.destinationSearch.recentDirectories.filter((entry) => entry !== destination),
  ].slice(0, config.destinationSearch.recentLimit);

  await saveState({
    destinationSearch: {
      recentDirectories: deduped,
    },
  });
}
