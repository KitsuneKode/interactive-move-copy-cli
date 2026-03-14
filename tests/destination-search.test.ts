import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { expandUserPath, resolveDirectoryInput } from "../src/tui/destination-search.ts";

describe("destination search helpers", () => {
  test("expands home shorthand", () => {
    expect(expandUserPath("~")).toBe(homedir());
    expect(expandUserPath("~/dotfiles")).toBe(join(homedir(), "dotfiles"));
  });

  test("preserves non-home inputs", () => {
    expect(expandUserPath("/tmp/work")).toBe("/tmp/work");
    expect(expandUserPath("projects")).toBe("projects");
  });

  test("resolves absolute, home, and relative inputs", () => {
    expect(resolveDirectoryInput("/tmp/work", "/tmp/base")).toBe(resolve("/tmp/work"));
    expect(resolveDirectoryInput("~/dotfiles", "/tmp/base")).toBe(
      resolve(join(homedir(), "dotfiles")),
    );
    expect(resolveDirectoryInput("projects/demo", "/tmp/base")).toBe(
      resolve("/tmp/base/projects/demo"),
    );
  });

  test("empty input resolves to the current directory", () => {
    expect(resolveDirectoryInput("", "/tmp/base")).toBe(resolve("/tmp/base"));
  });
});
