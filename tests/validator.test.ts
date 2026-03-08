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
      "copy",
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("detects non-existent destination with one primary error", async () => {
    const result = await validateOperation(
      [join(srcDir, "file1.txt")],
      join(testDir, "nonexistent"),
      "copy",
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      `Destination "${join(testDir, "nonexistent")}" does not exist`,
    ]);
  });

  test("detects moving file into same directory", async () => {
    const result = await validateOperation(
      [join(srcDir, "file1.txt")],
      srcDir,
      "move",
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
      "move",
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("into itself");
  });

  test("detects name conflicts", async () => {
    await writeFile(join(destDir, "file1.txt"), "existing");
    const result = await validateOperation(
      [join(srcDir, "file1.txt")],
      destDir,
      "copy",
    );
    expect(result.conflicts).toContain("file1.txt");
  });

  test("detects duplicate destination names from selected sources", async () => {
    const otherDir = join(testDir, "other");
    await mkdir(otherDir, { recursive: true });
    await writeFile(join(otherDir, "file1.txt"), "other");

    const result = await validateOperation(
      [join(srcDir, "file1.txt"), join(otherDir, "file1.txt")],
      destDir,
      "copy",
    );

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('would both write to "file1.txt"'))).toBe(true);
  });

  test("detects parent-child source overlap", async () => {
    const nestedDir = join(srcDir, "nested");
    const nestedFile = join(nestedDir, "child.txt");
    await mkdir(nestedDir, { recursive: true });
    await writeFile(nestedFile, "child");

    const result = await validateOperation(
      [nestedDir, nestedFile],
      destDir,
      "copy",
    );

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("nested path"))).toBe(true);
  });
});
