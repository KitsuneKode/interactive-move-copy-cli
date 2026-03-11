import { describe, expect, test } from "bun:test";

describe("cli runtime", () => {
  test("interactive mode refuses to start without a TTY", async () => {
    const proc = Bun.spawn({
      cmd: ["bun", "run", "src/bin/mvi.ts", "."],
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    expect(exitCode).toBe(1);
    expect(stdout).not.toContain("\u001b[?1049h");
    expect(stderr).toContain("requires an interactive TTY");
  });

  test("help still works without a TTY", async () => {
    const proc = Bun.spawn({
      cmd: ["bun", "run", "src/bin/mvi.ts", "--help"],
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("Usage: mvi [directory]");
  });

  test("rmi help includes delete mode options", async () => {
    const proc = Bun.spawn({
      cmd: ["bun", "run", "src/bin/rmi.ts", "--help"],
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("Usage: rmi [directory]");
    expect(stdout).toContain("--hard-delete");
  });
});
