import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { getFileName } = await jiti.import("./file-paths.ts");

test("folder labels omit parent paths and trailing separators", () => {
  for (const path of [
    "/home/deep/dev/pi-web",
    "/home/deep/dev/pi-web/",
    "C:\\Users\\Deep\\pi-web",
    "C:\\Users\\Deep\\pi-web\\",
    "C:/Users/Deep/pi-web/",
    "\\\\server\\projects\\pi-web",
    "pi-web",
  ]) {
    assert.equal(getFileName(path), "pi-web", path);
  }
});
