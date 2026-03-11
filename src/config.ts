import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { RemovalMode } from "./core/types.ts";

export interface CliConfig {
  mvi: Record<string, never>;
  cpi: Record<string, never>;
  rmi: {
    mode: RemovalMode;
  };
}

export interface EnsureConfigResult {
  config: CliConfig;
  created: boolean;
  updated: boolean;
  path: string;
}

export const DEFAULT_CONFIG: CliConfig = {
  mvi: {},
  cpi: {},
  rmi: {
    mode: "trash",
  },
};

function isRemovalMode(value: unknown): value is RemovalMode {
  return value === "trash" || value === "hard-delete";
}

function normalizeConfig(parsed?: Partial<CliConfig> | null): CliConfig {
  return {
    mvi: {},
    cpi: {},
    rmi: {
      mode: isRemovalMode(parsed?.rmi?.mode) ? parsed.rmi.mode : DEFAULT_CONFIG.rmi.mode,
    },
  };
}

function configToJson(config: CliConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export function getConfigPath(): string {
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(configHome, "interactive-move-copy-cli", "config.json");
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
