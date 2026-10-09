import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() } });
const enabled = await jiti.import("./enabled-models-runtime.ts");
const { resolveVisibleModels } = await jiti.import("./model-scope.ts");
const { rememberProviderModels, withDeferredProviderModels } = await jiti.import("./deferred-provider-models.ts");

// Exercise actual route/helper bodies with only their external boundaries
// injected: no credentials, network requests or user settings writes.
async function load(file, bindings) {
  const text = await readFile(new URL(file, import.meta.url), "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const withoutImports = ts.factory.updateSourceFile(source,
    source.statements.filter((statement) => !ts.isImportDeclaration(statement)));
  const code = ts.transpileModule(ts.createPrinter().printFile(withoutImports), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { ...bindings, exports, Response, URL, console });
  return exports;
}

async function fixture({ shadowed = [] } = {}) {
  const calls = [];
  let discovered = false;
  const models = ["gpt-6-sol", "gpt-6.1-sol", "gpt-6.1-sol-fast"].map((id) => ({
    id, name: id, provider: "github-copilot", api: "openai-responses",
  }));
  const runtime = {
    getAvailable: async () => {
      calls.push("inventory");
      assert.equal(discovered, true, "Copilot discovery must precede inventory/scoping");
      return models;
    },
    getModels: () => models,
    getProviders: () => [{ id: "github-copilot", name: "GitHub Copilot" }],
    getRegisteredProviderIds: () => [],
    getError: () => undefined,
  };
  const settingsManager = {
    getEnabledModels: () => ["github-copilot/gpt-6.1-sol"],
    getProjectSettings: () => ({}),
  };
  const services = { modelRuntime: runtime, settingsManager };
  const { createModelSelectionServices } = await load("./model-runtime.ts", {
    rememberProviderModels,
    getAgentDir: () => "/agent",
    projectTrustReloadOptions: (cwd, agentDir) => {
      assert.equal(cwd, "/project"); assert.equal(agentDir, "/agent");
      return { trust: "test" };
    },
    createAgentSessionServices: async (options) => {
      assert.equal(options.cwd, "/project");
      assert.equal(options.resourceLoaderReloadOptions.trust, "test");
      calls.push("services"); return services;
    },
    syncCopilotModels: async (modelRuntime, options) => {
      assert.equal(modelRuntime, runtime);
      calls.push(["discovery", options.force, options.background]);
      discovered = true; return { checkedAt: 123 };
    },
  });
  const writes = [];
  const common = {
    createModelSelectionServices, withDeferredProviderModels, getAgentDir: () => "/agent", resolve,
    stat: async () => ({ isDirectory: () => true }),
    getAllowedFileRoots: async () => ["/project"],
    isExistingFilePathAllowed: () => true,
  };
  const defaultRoute = await load("../app/api/models/default/route.ts", {
    ...common, resolveVisibleModels,
    shadowingProjectKeys: () => shadowed,
    projectSettingsPath: () => "/project/.pi/settings.json",
    isThinkingLevel: () => true,
    writeDefaultPreferences: async (_settings, edit) => writes.push(edit),
    invalidateModelsCache() {},
  });
  const catalogRoute = await load("../app/api/models/enabled/route.ts", {
    ...common, ...enabled,
  });
  return { calls, writes, defaultRoute, catalogRoute, createModelSelectionServices };
}

function put(modelId) {
  return new Request("http://localhost/api/models/default", {
    method: "PUT", body: JSON.stringify({ cwd: "/project", provider: "github-copilot", modelId }),
  });
}

test("the default star accepts a newly discovered Copilot model offered by the picker", async () => {
  const f = await fixture();
  const response = await f.defaultRoute.PUT(put("gpt-6.1-sol"));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).defaultModel.modelId, "gpt-6.1-sol");
  assert.equal(f.writes[0].model.modelId, "gpt-6.1-sol");
  assert.deepEqual(f.calls, ["services", ["discovery", false, true], "inventory", "inventory"]);
});

test("the catalog contains discovered AND disabled models, not the enabled picker subset", async () => {
  const f = await fixture();
  const response = await f.catalogRoute.GET(new Request("http://localhost/api/models/enabled?cwd=/project"));
  assert.equal(response.status, 200);
  const view = await response.json();
  const copilot = view.providers.find((p) => p.id === "github-copilot");
  assert.equal(view.availableTotal, 3);
  assert.equal(view.enabledTotal, 1);
  assert.equal(copilot.models.length, 3);
  assert.equal(copilot.models.find((m) => m.id === "gpt-6.1-sol").enabled, true);
  assert.equal(copilot.models.find((m) => m.id === "gpt-6.1-sol-fast").enabled, false);
  assert.equal(copilot.models.find((m) => m.id === "gpt-6-sol").enabled, false);
});

test("default validation still rejects disabled or unknown models without writing settings", async () => {
  for (const id of ["gpt-6.1-sol-fast", "not-a-model"]) {
    const f = await fixture();
    assert.equal((await f.defaultRoute.PUT(put(id))).status, 404);
    assert.equal(f.writes.length, 0);
  }
});

test("project default shadowing still refuses global writes", async () => {
  const f = await fixture({ shadowed: ["defaultModel"] });
  const response = await f.defaultRoute.PUT(put("gpt-6.1-sol"));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).reason, "project-scope");
  assert.equal(f.writes.length, 0);
});

test("explicit picker refresh reaches discovery as force rather than a background refresh", async () => {
  const f = await fixture();
  const services = await f.createModelSelectionServices("/project", { forceCopilot: true });
  assert.equal(services.copilotCatalog.checkedAt, 123);
  assert.deepEqual(f.calls, ["services", ["discovery", true, false], "inventory"]);
});
