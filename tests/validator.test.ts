import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { validateOperation } from "../src/ops/validator.ts";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

let testDir: string;
let srcDir: string;
let destDir: string;

beforeAll(async () => {
  testDir = await mkdtemp(join(tmpdir(), "mvi-test-"));
  srcDir = join(testDir, "src");
  destDir = join(testDir, "dest");
  await mkdir(srcDir, { recursive: true });
  await mkdir(destDir, { recursive: true });
  await writeFile(join(srcDir, "file1.txt"), "hello");
  await writeFile(join(srcDir, "file2.txt"), "world");
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("validateOperation", () => {
  test("valid operation passes", async () => {
    const result = await validateOperation(
      [join(srcDir, "file1.txt")],
      destDir,
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("detects non-existent destination", async () => {
    const result = await validateOperation(
      [join(srcDir, "file1.txt")],
      join(testDir, "nonexistent"),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("detects moving file into same directory", async () => {
    const result = await validateOperation(
      [join(srcDir, "file1.txt")],
      srcDir,
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("already in the destination");
  });

  test("detects circular move (parent into child)", async () => {
    const childDir = join(srcDir, "child");
    await mkdir(childDir, { recursive: true });
    const result = await validateOperation(
      [srcDir],
      childDir,
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("into itself");
  });

  test("detects name conflicts", async () => {
    await writeFile(join(destDir, "file1.txt"), "existing");
    const result = await validateOperation(
      [join(srcDir, "file1.txt")],
      destDir,
    );
    expect(result.conflicts).toContain("file1.txt");
  });
});
