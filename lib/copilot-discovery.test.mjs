import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { syncCopilotModels } = await jiti.import("./copilot-discovery.ts");
const { githubCopilotProvider } = await import("@earendil-works/pi-ai/providers/github-copilot");
const payload = { data: [{ id: "future-model", name: "Future model", model_picker_enabled: true,
  policy: { state: "enabled" }, supported_endpoints: ["/responses"],
  capabilities: { type: "chat", supports: { tool_calls: true, streaming: true },
    limits: { max_context_window_tokens: 200000, max_output_tokens: 8000 } } }] };

function runtime() {
  let registered;
  const base = githubCopilotProvider();
  return {
    getRegisteredNativeProvider: () => registered,
    getRegisteredProviderConfig: () => undefined,
    getProvider: () => registered ?? base,
    getModels: () => (registered ?? base).getModels(),
    hasConfiguredAuth: () => true,
    getAuth: async () => ({ auth: { apiKey: "secret-access-token", baseUrl: base.baseUrl } }),
    registerNativeProvider: (provider) => { registered = provider; },
  };
}

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "pi-copilot-test-"));
  const oldDir = process.env.PI_CODING_AGENT_DIR;
  const oldOffline = process.env.PI_OFFLINE;
  const oldFetch = globalThis.fetch;
  process.env.PI_CODING_AGENT_DIR = dir;
  delete process.env.PI_OFFLINE;
  const credentials = { "github-copilot": { type: "oauth", refresh: "account-one", access: "secret-access-token", expires: Date.now() + 3600000, availableModelIds: [] } };
  await writeFile(join(dir, "auth.json"), JSON.stringify(credentials));
  t.after(async () => {
    globalThis.fetch = oldFetch;
    if (oldDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = oldDir;
    if (oldOffline === undefined) delete process.env.PI_OFFLINE; else process.env.PI_OFFLINE = oldOffline;
    await rm(dir, { recursive: true, force: true });
  });
  return { dir, credentials };
}

test("coalesces refreshes, preserves auth/models.json, and exposes unseen IDs despite old OAuth allow-list", async t => {
  const { dir } = await fixture(t);
  const before = await readFile(join(dir, "auth.json"), "utf8");
  let requests = 0;
  globalThis.fetch = async (url, options) => {
    requests++;
    assert.equal(url, "https://api.individual.githubcopilot.com/models");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers["Editor-Version"], "vscode/1.107.0");
    await new Promise(resolve => setTimeout(resolve, 20));
    return Response.json(payload);
  };
  const a = runtime(), b = runtime();
  await Promise.all([syncCopilotModels(a, { force: true }), syncCopilotModels(b, { force: true })]);
  assert.equal(requests, 1);
  const p = a.getProvider();
  assert.deepEqual(p.filterModels(p.getModels(), { type: "oauth", availableModelIds: [] }).map(m => m.id), ["future-model"]);
  await syncCopilotModels(runtime());
  assert.equal(requests, 1);
  assert.equal(await readFile(join(dir, "auth.json"), "utf8"), before);
  const cacheFiles = await readdir(join(dir, "pi-web-cache"));
  const cache = await readFile(join(dir, "pi-web-cache", cacheFiles[0]), "utf8");
  assert.ok(!cache.includes("secret-access-token"));
  assert.ok(!cache.includes("account-one"));
  await assert.rejects(readFile(join(dir, "models.json")), { code: "ENOENT" });
});

test("network failure keeps last good models and returns a sanitized warning", async t => {
  await fixture(t);
  const r = runtime();
  globalThis.fetch = async () => Response.json(payload);
  await syncCopilotModels(r, { force: true });
  globalThis.fetch = async () => { throw new Error("secret-access-token upstream failure"); };
  const result = await syncCopilotModels(r, { force: true });
  assert.match(result.warning, /last successful catalog/);
  assert.ok(!result.warning.includes("secret-access-token"));
  assert.ok(r.getModels().some(m => m.id === "future-model"));
});

test("offline restores a saved catalog without network; new account cannot reuse it", async t => {
  const { dir, credentials } = await fixture(t);
  globalThis.fetch = async () => Response.json(payload);
  await syncCopilotModels(runtime(), { force: true });
  // Simulate a cold in-memory cache while retaining the on-disk catalog.
  globalThis.__piCopilotDiscovery.slots.clear();
  process.env.PI_OFFLINE = "1";
  globalThis.fetch = async () => { throw new Error("Network must not be used"); };
  const r = runtime();
  await syncCopilotModels(r);
  assert.ok(r.getModels().some(m => m.id === "future-model"));
  credentials["github-copilot"].refresh = "account-two";
  await writeFile(join(dir, "auth.json"), JSON.stringify(credentials));
  await syncCopilotModels(r);
  assert.ok(!r.getModels().some(m => m.id === "future-model"));
});

test("does not replace extension registered providers", async t => {
  await fixture(t);
  const r = runtime();
  r.getRegisteredProviderConfig = () => ({ models: [] });
  globalThis.fetch = async () => { throw new Error("Should not fetch"); };
  assert.match((await syncCopilotModels(r, { force: true })).warning, /managed by an extension/);
  assert.equal(r.getRegisteredNativeProvider(), undefined);
});
