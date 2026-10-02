import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { load } from "js-yaml";
import { fileURLToPath } from "node:url";
import { findResumableTags, planVersion } from "./automated-release.mjs";

test("GitHub-only release workflow gates packaging on CI and needs no npm publishing credentials", () => {
  const text = readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
  const workflow = load(text);
  assert.deepEqual(workflow.on.push.branches, ["main"]);
  assert.equal(workflow.jobs.publish.needs, "ci");
  assert.equal(workflow.jobs.ci.uses, "./.github/workflows/ci.yml");
  assert.deepEqual(workflow.jobs.publish.permissions, { contents: "write" });
  assert.match(text, /npm pack --json/);
  assert.match(text, /gh release create/);
  assert.match(text, /--latest/);
  assert.doesNotMatch(text, /npm publish|NPM_TOKEN|NODE_AUTH_TOKEN|id-token/);
});

test("portable package command launches without requiring Cloudflare", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.bin["pi-web-server"], "bin/pi-web.js");
  const help = execFileSync(process.execPath, [fileURLToPath(new URL(`../${pkg.bin["pi-web-server"]}`, import.meta.url)), "--help"], { encoding: "utf8" });
  assert.match(help, /--port/);
  assert.match(help, /--hostname/);
});

test("automatically increments the highest checkout or tagged stable version", () => {
  assert.deepEqual(planVersion({ current: "0.9.3" }), { version: "0.9.4", reuse: false });
  assert.deepEqual(planVersion({
    current: "0.9.3", tags: ["0.10.1", "0.10.2", "1.0.0-beta.1", "garbage"],
  }), { version: "0.10.3", reuse: false });
  assert.deepEqual(planVersion({ current: "2.0.0", tags: ["1.0.1"] }), {
    version: "2.0.1", reuse: false,
  });
});

test("retries reuse the reserved version rather than publishing another patch", () => {
  assert.deepEqual(planVersion({ current: "0.9.3", tags: ["0.9.4"], resumable: ["0.9.4"] }), {
    version: "0.9.4", reuse: true,
  });
  assert.deepEqual(planVersion({ current: "0.9.3", tags: ["0.9.4", "0.9.5"], resumable: ["0.9.4", "0.9.5"] }), {
    version: "0.9.5", reuse: true,
  });
});

test("an older retry cannot move GitHub Latest backwards", () => {
  assert.throws(() => planVersion({ current: "0.9.3", tags: ["0.9.5"], resumable: ["0.9.4"] }), /backwards/);
});

test("rejects invalid or prerelease checkout versions", () => {
  for (const current of ["invalid", "1.0.0-beta.1"]) {
    assert.throws(() => planVersion({ current }), /stable semantic version/);
  }
});

test("only a tag with the exact source trailer and sole parent is resumable", () => {
  const source = "a".repeat(40);
  const tags = {
    good: { message: `chore(release): v0.9.4\n\nPi-Web-Source: ${source}`, parents: source },
    otherSource: { message: `Pi-Web-Source: ${"b".repeat(40)}`, parents: source },
    wrongParent: { message: `Pi-Web-Source: ${source}`, parents: "b".repeat(40) },
    merge: { message: `Pi-Web-Source: ${source}`, parents: `${source} ${"b".repeat(40)}` },
    substring: { message: `Not-Pi-Web-Source: ${source}`, parents: source },
  };
  assert.deepEqual(findResumableTags(Object.keys(tags), source, (tag) => tags[tag]), ["good"]);
});
