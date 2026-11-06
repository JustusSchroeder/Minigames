import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceDir = dirname(fileURLToPath(import.meta.url));

describe("engine boundaries", () => {
  it("does not import the interface, renderer, or browser database", () => {
    const files = readdirSync(sourceDir).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"));
    const forbidden = /from ["'](?:react|react-dom|pixi\.js|dexie|zustand)/;
    for (const file of files) {
      const source = readFileSync(join(sourceDir, file), "utf8");
      expect(source, file).not.toMatch(forbidden);
    }
  });
});
