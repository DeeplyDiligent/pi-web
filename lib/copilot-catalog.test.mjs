import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { parseCopilotCatalog, copilotCatalogUrl, COPILOT_HEADERS } = await jiti.import("./copilot-catalog.ts");

export function upstream(id = "new-model", overrides = {}) {
  return {
    id, name: id, model_picker_enabled: true, policy: { state: "enabled" },
    supported_endpoints: ["/responses"],
    capabilities: { type: "chat", limits: { max_context_window_tokens: 1000000, max_output_tokens: 128000 },
      supports: { tool_calls: true, streaming: true, vision: true, reasoning_effort: ["low", "medium", "high", "xhigh", "max"] } },
    ...overrides,
  };
}
const baseUrl = "https://api.individual.githubcopilot.com";

test("discovers unseen models using actual API and capability metadata, including IDE headers", () => {
  const { models, unknownPricing } = parseCopilotCatalog({ data: [upstream("gpt-6-astra")] }, [], baseUrl);
  assert.equal(models[0].api, "openai-responses");
  assert.equal(models[0].contextWindow, 1000000);
  assert.equal(models[0].maxTokens, 128000);
  assert.deepEqual(models[0].input, ["text", "image"]);
  assert.equal(models[0].thinkingLevelMap.off, null);
  assert.equal(models[0].thinkingLevelMap.max, "max");
  assert.deepEqual(models[0].headers, COPILOT_HEADERS);
  assert.deepEqual(unknownPricing, ["gpt-6-astra"]);
});

test("preserves known compatibility and vetted pricing while updating limits", () => {
  const cost = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 };
  const known = { id: "known", api: "anthropic-messages", cost, compat: { forceAdaptiveThinking: true } };
  const { models, unknownPricing } = parseCopilotCatalog({ data: [upstream("known", { supported_endpoints: ["/chat/completions", "/v1/messages"] })] }, [known], baseUrl);
  assert.equal(models[0].api, "anthropic-messages");
  assert.equal(models[0].compat.forceAdaptiveThinking, true);
  assert.deepEqual(models[0].cost, cost);
  assert.deepEqual(unknownPricing, []);
});

test("filters disabled, hidden, non-chat, and unsupported models", () => {
  const data = [upstream("ok"), upstream("disabled", { policy: { state: "disabled" } }),
    upstream("hidden", { model_picker_enabled: false }), upstream("embedding", { capabilities: { type: "embeddings" } }),
    upstream("unknown-api", { supported_endpoints: ["/something-new"] })];
  const parsed = parseCopilotCatalog({ data }, [], baseUrl);
  assert.deepEqual(parsed.models.map(m => m.id), ["ok"]);
  assert.equal(parsed.skipped, 1);
});

test("Individual policy fallback does not broaden business accounts", () => {
  const data = [upstream("policy-only", { model_picker_enabled: false })];
  assert.equal(parseCopilotCatalog({ data }, [], baseUrl).models.length, 1);
  assert.equal(parseCopilotCatalog({ data }, [], "https://api.business.githubcopilot.com").models.length, 0);
});

test("rejects invalid catalogs and untrusted destinations", () => {
  assert.throws(() => parseCopilotCatalog({ error: "oops" }, [], baseUrl));
  for (const url of ["http://api.individual.githubcopilot.com", "https://api.individual.githubcopilot.com.evil.com", "https://example.com", "https://user@api.business.githubcopilot.com", baseUrl + "/proxy"]) {
    assert.throws(() => copilotCatalogUrl(url));
  }
  assert.equal(copilotCatalogUrl(baseUrl), baseUrl + "/models");
});
