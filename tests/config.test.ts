import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ensureConfigFile,
  getConfigPath,
  getStatePath,
  loadConfig,
  loadState,
  recordRecentDestination,
} from "../src/config.ts";

const previousXdgConfigHome = process.env.XDG_CONFIG_HOME;

afterEach(async () => {
  if (previousXdgConfigHome === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = previousXdgConfigHome;
  }
});

describe("config", () => {
  test("creates the default shared config when no config exists", async () => {
    const tempConfigHome = await mkdtemp(join(tmpdir(), "mvi-config-test-"));
    process.env.XDG_CONFIG_HOME = tempConfigHome;

    const result = await ensureConfigFile();
    const written = await readFile(result.path, "utf8");

    expect(result.created).toBe(true);
    expect(result.updated).toBe(false);
    expect(result.config).toEqual({
      mvi: {},
      cpi: {},
      destinationSearch: {
        roots: ["~"],
        bookmarks: {},
        rememberRecent: true,
        recentLimit: 8,
      },
      rmi: {
        mode: "trash",
      },
    });
    expect(written).toContain('"mvi": {}');
    expect(written).toContain('"cpi": {}');
    expect(written).toContain('"destinationSearch"');
    expect(written).toContain('"mode": "trash"');

    await rm(tempConfigHome, { recursive: true, force: true });
  });

  test("normalizes partial configs and fills future-proof default sections", async () => {
    const tempConfigHome = await mkdtemp(join(tmpdir(), "mvi-config-test-"));
    process.env.XDG_CONFIG_HOME = tempConfigHome;

    const configPath = getConfigPath();
    await mkdir(join(tempConfigHome, "interactive-move-copy-cli"), { recursive: true });
    await writeFile(
      configPath,
      JSON.stringify({
        destinationSearch: {
          roots: ["~/Projects", "~/dotfiles"],
          bookmarks: {
            dotfiles: "~/dotfiles",
          },
        },
        rmi: {
          mode: "hard-delete",
        },
      }),
      "utf8",
    );

    const result = await ensureConfigFile();
    const written = await readFile(configPath, "utf8");

    expect(result.created).toBe(false);
    expect(result.updated).toBe(true);
    expect(result.config).toEqual({
      mvi: {},
      cpi: {},
      destinationSearch: {
        roots: ["~/Projects", "~/dotfiles"],
        bookmarks: {
          dotfiles: "~/dotfiles",
        },
        rememberRecent: true,
        recentLimit: 8,
      },
      rmi: {
        mode: "hard-delete",
      },
    });
    expect(written).toContain('"mvi": {}');
    expect(written).toContain('"cpi": {}');
    expect(written).toContain('"mode": "hard-delete"');

    await rm(tempConfigHome, { recursive: true, force: true });
  });

  test("loadConfig reads the normalized config", async () => {
    const tempConfigHome = await mkdtemp(join(tmpdir(), "mvi-config-test-"));
    process.env.XDG_CONFIG_HOME = tempConfigHome;

    const config = await loadConfig();

    expect(config).toEqual({
      mvi: {},
      cpi: {},
      destinationSearch: {
        roots: ["~"],
        bookmarks: {},
        rememberRecent: true,
        recentLimit: 8,
      },
      rmi: {
        mode: "trash",
      },
    });

    await rm(tempConfigHome, { recursive: true, force: true });
  });

  test("throws when the config file contains invalid JSON", async () => {
    const tempConfigHome = await mkdtemp(join(tmpdir(), "mvi-config-test-"));
    process.env.XDG_CONFIG_HOME = tempConfigHome;

    const configPath = getConfigPath();
    await mkdir(join(tempConfigHome, "interactive-move-copy-cli"), { recursive: true });
    await writeFile(configPath, "{not-json", "utf8");

    await expect(ensureConfigFile()).rejects.toThrow(
      `Config file is not valid JSON: ${configPath}`,
    );

    await rm(tempConfigHome, { recursive: true, force: true });
  });

  test("records recent destinations in state without mutating config", async () => {
    const tempConfigHome = await mkdtemp(join(tmpdir(), "mvi-config-test-"));
    process.env.XDG_CONFIG_HOME = tempConfigHome;

    const config = await loadConfig();
    await recordRecentDestination("/tmp/one", config);
    await recordRecentDestination("/tmp/two", config);
    await recordRecentDestination("/tmp/one", config);

    const state = await loadState();
    const stateRaw = await readFile(getStatePath(), "utf8");

    expect(state.destinationSearch.recentDirectories).toEqual(["/tmp/one", "/tmp/two"]);
    expect(stateRaw).toContain('"/tmp/one"');

    await rm(tempConfigHome, { recursive: true, force: true });
  });
});
