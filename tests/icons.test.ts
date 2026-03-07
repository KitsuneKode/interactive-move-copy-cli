import { test, expect, describe } from "bun:test";
import { getIcon } from "../src/fs/icons.ts";

describe("getIcon", () => {
  test("returns directory icon", () => {
    const icon = getIcon("src", true, false, true);
    expect(icon).toBe("\uf07b");
  });

  test("returns symlink icon", () => {
    const icon = getIcon("link", false, true, true);
    expect(icon).toBe("\uf0c1");
  });

  test("returns lock icon for unreadable", () => {
    const icon = getIcon("secret", false, false, false);
    expect(icon).toBe("\uf023");
  });

  test("returns correct icon for TypeScript", () => {
    const icon = getIcon("index.ts", false, false, true);
    expect(icon).toBe("\ue628");
  });

  test("returns correct icon for JavaScript", () => {
    const icon = getIcon("app.js", false, false, true);
    expect(icon).toBe("\ue74e");
  });

  test("returns correct icon for package.json", () => {
    const icon = getIcon("package.json", false, false, true);
    expect(icon).toBe("\ue71e");
  });

  test("returns correct icon for Dockerfile", () => {
    const icon = getIcon("Dockerfile", false, false, true);
    expect(icon).toBe("\ue7b0");
  });

  test("returns correct icon for .gitignore", () => {
    const icon = getIcon(".gitignore", false, false, true);
    expect(icon).toBe("\ue702");
  });

  test("returns default icon for unknown extension", () => {
    const icon = getIcon("file.xyz", false, false, true);
    expect(icon).toBe("\uf15b");
  });

  test("special filename takes priority over extension", () => {
    // package.json should get npm icon, not generic json icon
    const special = getIcon("package.json", false, false, true);
    const generic = getIcon("data.json", false, false, true);
    expect(special).not.toBe(generic);
  });
});
