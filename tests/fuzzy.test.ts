import { test, expect, describe } from "bun:test";
import { fuzzyMatch, highlightMatch } from "../src/tui/fuzzy.ts";

describe("fuzzyMatch", () => {
  test("empty pattern matches everything", () => {
    const result = fuzzyMatch("", "hello");
    expect(result.matches).toBe(true);
    expect(result.score).toBe(0);
    expect(result.positions).toEqual([]);
  });

  test("exact match", () => {
    const result = fuzzyMatch("hello", "hello");
    expect(result.matches).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });

  test("partial match with gaps", () => {
    const result = fuzzyMatch("pj", "package.json");
    expect(result.matches).toBe(true);
    expect(result.positions).toContain(0);
  });

  test("no match returns false", () => {
    const result = fuzzyMatch("xyz", "hello");
    expect(result.matches).toBe(false);
    expect(result.positions).toEqual([]);
  });

  test("case insensitive", () => {
    const result = fuzzyMatch("PKG", "package");
    expect(result.matches).toBe(true);
  });

  test("characters must appear in order", () => {
    const result = fuzzyMatch("ba", "abc");
    expect(result.matches).toBe(false);
  });

  test("start-of-string bonus gives higher score", () => {
    const startMatch = fuzzyMatch("p", "package.json");
    const midMatch = fuzzyMatch("a", "package.json");
    expect(startMatch.score).toBeGreaterThan(midMatch.score);
  });

  test("word boundary bonus", () => {
    // Compare two matches at similar positions — word boundary should score higher
    const boundaryMatch = fuzzyMatch("j", "aa.json");  // 'j' at index 3, word boundary
    const midMatch = fuzzyMatch("s", "aa.json");       // 's' at index 4, not boundary
    expect(boundaryMatch.score).toBeGreaterThan(midMatch.score);
  });

  test("consecutive characters score higher", () => {
    const consecutive = fuzzyMatch("pack", "package.json");
    const spread = fuzzyMatch("pcej", "package.json");
    expect(consecutive.score).toBeGreaterThan(spread.score);
  });

  test("returns correct match positions", () => {
    const result = fuzzyMatch("pj", "package.json");
    expect(result.positions).toEqual([0, 8]);
  });

  test("camelCase boundary detection", () => {
    const result = fuzzyMatch("fN", "fileName");
    expect(result.matches).toBe(true);
    // 'N' at index 4 is a camelCase boundary
    expect(result.positions).toContain(4);
  });
});

describe("highlightMatch", () => {
  test("highlights matching positions", () => {
    const result = highlightMatch("hello", [0, 2], "[", "]");
    expect(result).toBe("[h]e[l]lo");
  });

  test("groups consecutive positions", () => {
    const result = highlightMatch("hello", [0, 1, 2], "[", "]");
    expect(result).toBe("[hel]lo");
  });

  test("no positions returns original", () => {
    const result = highlightMatch("hello", [], "[", "]");
    expect(result).toBe("hello");
  });
});
