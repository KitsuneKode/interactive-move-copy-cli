import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { executeOperation, printSummary } from "../src/ops/executor.ts";
import { mkdtemp, mkdir, writeFile, readFile, rm, stat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

let testRoot: string;

beforeEach(async () => {
  testRoot = await mkdtemp(join(tmpdir(), "mvi-exec-test-"));
});

afterAll(async () => {
  // Clean up all temp dirs
  if (testRoot) await rm(testRoot, { recursive: true, force: true }).catch(() => {});
});

describe("move operation", () => {
  test("moves file and preserves content", async () => {
    const src = join(testRoot, "src");
    const dest = join(testRoot, "dest");
    await mkdir(src);
    await mkdir(dest);

    const content = "important data that must not be lost\n".repeat(100);
    await writeFile(join(src, "data.txt"), content);

    const results = await executeOperation([join(src, "data.txt")], dest, "move");

    expect(results[0]!.success).toBe(true);

    // File should exist at destination with identical content
    const movedContent = await readFile(join(dest, "data.txt"), "utf8");
    expect(movedContent).toBe(content);

    // Original should no longer exist
    const exists = await stat(join(src, "data.txt")).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  test("moves directory recursively and preserves all contents", async () => {
    const src = join(testRoot, "src2");
    const dest = join(testRoot, "dest2");
    await mkdir(src);
    await mkdir(dest);

    const dir = join(src, "mydir");
    await mkdir(dir);
    await mkdir(join(dir, "sub"));
    await writeFile(join(dir, "a.txt"), "aaa");
    await writeFile(join(dir, "sub", "b.txt"), "bbb");

    const results = await executeOperation([dir], dest, "move");
    expect(results[0]!.success).toBe(true);

    // All files should be at destination
    expect(await readFile(join(dest, "mydir", "a.txt"), "utf8")).toBe("aaa");
    expect(await readFile(join(dest, "mydir", "sub", "b.txt"), "utf8")).toBe("bbb");

    // Original directory should be gone
    const exists = await stat(dir).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  test("no-clobber: does not overwrite existing file by default", async () => {
    const src = join(testRoot, "src3");
    const dest = join(testRoot, "dest3");
    await mkdir(src);
    await mkdir(dest);

    await writeFile(join(src, "file.txt"), "new content");
    await writeFile(join(dest, "file.txt"), "original content");

    await executeOperation([join(src, "file.txt")], dest, "move", false);

    // Destination file should still have original content
    const destContent = await readFile(join(dest, "file.txt"), "utf8");
    expect(destContent).toBe("original content");
  });

  test("handles vanished source file gracefully", async () => {
    const src = join(testRoot, "src4");
    const dest = join(testRoot, "dest4");
    await mkdir(src);
    await mkdir(dest);

    // Create then delete before execute
    const filePath = join(src, "ghost.txt");
    await writeFile(filePath, "will vanish");
    await rm(filePath);

    const results = await executeOperation([filePath], dest, "move");
    expect(results[0]!.success).toBe(false);
    expect(results[0]!.error).toContain("no longer exists");

    // Destination should be empty — nothing created
    const destFiles = await readdir(dest);
    expect(destFiles.length).toBe(0);
  });
});

describe("copy operation", () => {
  test("copies file and preserves original", async () => {
    const src = join(testRoot, "csrc");
    const dest = join(testRoot, "cdest");
    await mkdir(src);
    await mkdir(dest);

    const content = "data to copy";
    await writeFile(join(src, "file.txt"), content);

    const results = await executeOperation([join(src, "file.txt")], dest, "copy");
    expect(results[0]!.success).toBe(true);

    // Both original and copy should exist with same content
    const originalContent = await readFile(join(src, "file.txt"), "utf8");
    const copyContent = await readFile(join(dest, "file.txt"), "utf8");
    expect(originalContent).toBe(content);
    expect(copyContent).toBe(content);
  });

  test("copies directory recursively, originals remain", async () => {
    const src = join(testRoot, "csrc2");
    const dest = join(testRoot, "cdest2");
    await mkdir(src);
    await mkdir(dest);

    const dir = join(src, "project");
    await mkdir(dir);
    await mkdir(join(dir, "nested"));
    await writeFile(join(dir, "x.txt"), "xxx");
    await writeFile(join(dir, "nested", "y.txt"), "yyy");

    const results = await executeOperation([dir], dest, "copy");
    expect(results[0]!.success).toBe(true);

    // Copies exist
    expect(await readFile(join(dest, "project", "x.txt"), "utf8")).toBe("xxx");
    expect(await readFile(join(dest, "project", "nested", "y.txt"), "utf8")).toBe("yyy");

    // Originals still exist
    expect(await readFile(join(dir, "x.txt"), "utf8")).toBe("xxx");
    expect(await readFile(join(dir, "nested", "y.txt"), "utf8")).toBe("yyy");
  });

  test("no-clobber: does not overwrite existing file on copy", async () => {
    const src = join(testRoot, "csrc3");
    const dest = join(testRoot, "cdest3");
    await mkdir(src);
    await mkdir(dest);

    await writeFile(join(src, "file.txt"), "new");
    await writeFile(join(dest, "file.txt"), "existing");

    await executeOperation([join(src, "file.txt")], dest, "copy", false);

    const destContent = await readFile(join(dest, "file.txt"), "utf8");
    expect(destContent).toBe("existing");
  });

  test("multi-file operation: all succeed independently", async () => {
    const src = join(testRoot, "csrc4");
    const dest = join(testRoot, "cdest4");
    await mkdir(src);
    await mkdir(dest);

    await writeFile(join(src, "a.txt"), "aaa");
    await writeFile(join(src, "b.txt"), "bbb");
    await writeFile(join(src, "c.txt"), "ccc");

    const results = await executeOperation(
      [join(src, "a.txt"), join(src, "b.txt"), join(src, "c.txt")],
      dest,
      "copy",
    );

    expect(results.every((r) => r.success)).toBe(true);
    expect(await readFile(join(dest, "a.txt"), "utf8")).toBe("aaa");
    expect(await readFile(join(dest, "b.txt"), "utf8")).toBe("bbb");
    expect(await readFile(join(dest, "c.txt"), "utf8")).toBe("ccc");
  });

  test("binary file integrity preserved", async () => {
    const src = join(testRoot, "csrc5");
    const dest = join(testRoot, "cdest5");
    await mkdir(src);
    await mkdir(dest);

    // Create a binary file with random bytes
    const binaryData = new Uint8Array(4096);
    for (let i = 0; i < binaryData.length; i++) {
      binaryData[i] = Math.floor(Math.random() * 256);
    }
    await Bun.write(join(src, "data.bin"), binaryData);

    const results = await executeOperation([join(src, "data.bin")], dest, "copy");
    expect(results[0]!.success).toBe(true);

    const copied = new Uint8Array(await Bun.file(join(dest, "data.bin")).arrayBuffer());
    expect(copied.length).toBe(binaryData.length);
    for (let i = 0; i < binaryData.length; i++) {
      expect(copied[i]).toBe(binaryData[i]);
    }
  });
});
