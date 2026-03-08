import { describe, expect, test } from "bun:test";
import { formatDate, formatSize, padColumn } from "../src/fs/format.ts";

describe("formatSize", () => {
  test("0 bytes", () => {
    expect(formatSize(0)).toBe("0 B");
  });

  test("bytes", () => {
    expect(formatSize(500)).toBe("500 B");
  });

  test("kilobytes", () => {
    expect(formatSize(1024)).toBe("1.0 KB");
    expect(formatSize(1536)).toBe("1.5 KB");
  });

  test("megabytes", () => {
    expect(formatSize(1048576)).toBe("1.0 MB");
    expect(formatSize(2621440)).toBe("2.5 MB");
  });

  test("gigabytes", () => {
    expect(formatSize(1073741824)).toBe("1.0 GB");
  });

  test("large file", () => {
    expect(formatSize(1099511627776)).toBe("1.0 TB");
  });
});

describe("formatDate", () => {
  test("formats date correctly", () => {
    const date = new Date(2026, 2, 7, 14, 23); // Mar 07, 2026 14:23
    expect(formatDate(date)).toBe("Mar 07 14:23");
  });

  test("pads single digit hours", () => {
    const date = new Date(2026, 0, 1, 5, 3);
    expect(formatDate(date)).toBe("Jan 01 05:03");
  });

  test("midnight", () => {
    const date = new Date(2026, 11, 25, 0, 0);
    expect(formatDate(date)).toBe("Dec 25 00:00");
  });
});

describe("padColumn", () => {
  test("pads shorter strings", () => {
    expect(padColumn("hi", 5)).toBe("hi   ");
  });

  test("truncates longer strings", () => {
    expect(padColumn("hello world", 5)).toBe("hello");
  });

  test("exact length", () => {
    expect(padColumn("hello", 5)).toBe("hello");
  });
});
