import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  collectFiles,
  getSourceFingerprint,
  isCompleteRelease,
  isSourceCheckout,
} = require("../bin/source-release.js");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-web-source-release-"));
  fs.mkdirSync(path.join(root, ".git"));
  fs.mkdirSync(path.join(root, "app"));
  fs.writeFileSync(path.join(root, "app", "page.tsx"), "export default 1;\n");
  fs.writeFileSync(path.join(root, "package.json"), "{}\n");
  fs.writeFileSync(path.join(root, ".env.local"), "EXAMPLE=one\n");
  return root;
}

test("source fingerprint covers application and local environment inputs", (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  assert.equal(isSourceCheckout(root), true);
  assert.deepEqual(
    collectFiles(root).map((file) => file.replaceAll(path.sep, "/")),
    [".env.local", "app/page.tsx", "package.json"],
  );

  const initial = getSourceFingerprint(root);
  fs.writeFileSync(path.join(root, "app", "page.tsx"), "export default 2;\n");
  assert.notEqual(getSourceFingerprint(root), initial);

  const afterSourceChange = getSourceFingerprint(root);
  fs.mkdirSync(path.join(root, "docs"));
  fs.writeFileSync(path.join(root, "docs", "notes.md"), "not a build input\n");
  assert.equal(getSourceFingerprint(root), afterSourceChange);
});

test("a cached release must have matching metadata and a Next build id", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-web-release-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  fs.mkdirSync(path.join(root, ".next"));
  fs.writeFileSync(path.join(root, ".next", "BUILD_ID"), "build\n");
  fs.writeFileSync(
    path.join(root, ".pi-web-source-build.json"),
    JSON.stringify({ fingerprint: "current" }),
  );

  assert.equal(isCompleteRelease(root, "current"), true);
  assert.equal(isCompleteRelease(root, "different"), false);
});
