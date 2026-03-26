import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateOperation, validateRemovalOperation } from "../src/ops/validator.ts";

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

describe("validateRemovalOperation", () => {
  test("valid trash removal passes", async () => {
    const result = await validateRemovalOperation([join(srcDir, "file2.txt")], "trash");
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("detects parent-child overlap for removal", async () => {
    const nestedDir = join(srcDir, "remove-nested");
    const nestedFile = join(nestedDir, "child.txt");
    await mkdir(nestedDir, { recursive: true });
    await writeFile(nestedFile, "child");

    const result = await validateRemovalOperation([nestedDir, nestedFile], "hard-delete");
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("nested path"))).toBe(true);
  });
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("validateOperation", () => {
  test("valid operation passes", async () => {
    const result = await validateOperation([join(srcDir, "file1.txt")], destDir, "copy");
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
    expect(result.errors).toEqual([`Destination "${join(testDir, "nonexistent")}" does not exist`]);
  });

  test("detects moving file into same directory", async () => {
    const result = await validateOperation([join(srcDir, "file1.txt")], srcDir, "move");
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("already in the destination");
  });

  test("detects circular move (parent into child)", async () => {
    const childDir = join(srcDir, "child");
    await mkdir(childDir, { recursive: true });
    const result = await validateOperation([srcDir], childDir, "move");
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("into itself");
  });

  test("detects name conflicts", async () => {
    await writeFile(join(destDir, "file1.txt"), "existing");
    const result = await validateOperation([join(srcDir, "file1.txt")], destDir, "copy");
    expect(result.conflicts[0]?.sourceName).toBe("file1.txt");
    expect(result.conflicts[0]?.destinationKind).toBe("file");
    expect(result.conflicts[0]?.overwrittenStats.files).toBe(1);
  });

  test("includes recursive overwrite details for folder conflicts", async () => {
    const sourceDir = join(srcDir, "project");
    const destProjectDir = join(destDir, "project");
    await mkdir(join(sourceDir, "nested"), { recursive: true });
    await mkdir(join(destProjectDir, "existing-nested"), { recursive: true });
    await writeFile(join(sourceDir, "nested", "new.txt"), "new");
    await writeFile(join(destProjectDir, "old.txt"), "old");
    await writeFile(join(destProjectDir, "existing-nested", "keep.txt"), "keep");

    const result = await validateOperation([sourceDir], destDir, "copy");

    expect(result.valid).toBe(true);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.sourceKind).toBe("directory");
    expect(result.conflicts[0]?.destinationKind).toBe("directory");
    expect(result.conflicts[0]?.overwrittenStats.directories).toBe(2);
    expect(result.conflicts[0]?.overwrittenStats.files).toBe(2);
    expect(result.conflicts[0]?.overwrittenEntries.map((entry) => entry.relativePath)).toEqual([
      "existing-nested",
      "existing-nested/keep.txt",
      "old.txt",
    ]);
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
    expect(result.errors.some((error) => error.includes('would both write to "file1.txt"'))).toBe(
      true,
    );
  });

  test("detects parent-child source overlap", async () => {
    const nestedDir = join(srcDir, "nested");
    const nestedFile = join(nestedDir, "child.txt");
    await mkdir(nestedDir, { recursive: true });
    await writeFile(nestedFile, "child");

    const result = await validateOperation([nestedDir, nestedFile], destDir, "copy");

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("nested path"))).toBe(true);
  });
});
