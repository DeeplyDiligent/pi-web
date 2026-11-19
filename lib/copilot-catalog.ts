import type { Api, Model, ModelThinkingLevel } from "@earendil-works/pi-ai";

export const COPILOT_PROVIDER = "github-copilot";
// Required for IDE-authenticated requests, including newly discovered models.
export const COPILOT_HEADERS = {
  "User-Agent": "GitHubCopilotChat/0.35.0",
  "Editor-Version": "vscode/1.107.0",
  "Editor-Plugin-Version": "copilot-chat/0.35.0",
  "Copilot-Integration-Id": "vscode-chat",
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
function nonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Copilot prices are USD cents per one million tokens in its flat-rate tier. */
function copilotCost(entry: Record<string, unknown>, now = Date.now()): Model<Api>["cost"] | undefined {
  const billing = record(entry.billing);
  const prices = record(billing.token_prices);
  if (prices.batch_size !== 1_000_000) return undefined;
  const tiers = Object.entries(prices).filter(([name]) => name !== "batch_size");
  // Pi has one cost tuple per model and cannot represent a context-tier jump.
  // Import only a flat catalog price, never accidentally bill the default tier
  // for a model whose long-context requests cost more.
  if (tiers.some(([, tier]) => {
    const candidate = record(tier);
    const flat = record(prices.default);
    return candidate.input_price !== flat.input_price
      || candidate.cache_price !== flat.cache_price
      || candidate.cache_write_price !== flat.cache_write_price
      || candidate.output_price !== flat.output_price;
  })) return undefined;
  const price = record(prices.default);
  if (!nonnegative(price.input_price) || !nonnegative(price.output_price)) return undefined;
  const cacheRead = nonnegative(price.cache_price) ? price.cache_price : 0;
  const cacheWrite = nonnegative(price.cache_write_price) ? price.cache_write_price : 0;
  const promo = record(billing.promo);
  const expiresAt = typeof promo.ends_at === "string" ? Date.parse(promo.ends_at) : NaN;
  const discount = nonnegative(promo.discount_percent) && promo.discount_percent <= 100
    && Number.isFinite(expiresAt) && expiresAt > now
    ? promo.discount_percent / 100
    : 0;
  const dollars = (cents: number) => Number((cents * (1 - discount) / 100).toFixed(8));
  return {
    input: dollars(price.input_price),
    output: dollars(price.output_price),
    cacheRead: dollars(cacheRead),
    cacheWrite: dollars(cacheWrite),
  };
}

/** Never send IDE credentials to a URL supplied by a model entry or a redirect. */
export function copilotCatalogUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.port
    || !/^api\.(?:individual|business|enterprise)\.githubcopilot\.com$/.test(url.hostname)
    || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("Direct discovery requires an official GitHub Copilot endpoint.");
  }
  return `${url.origin}/models`;
}

/** Translate only explicitly supported chat APIs. Never guess an API from a model name. */
export function parseCopilotCatalog(
  raw: unknown,
  baseline: readonly Model<Api>[],
  baseUrl: string,
): { models: Model<Api>[]; unknownPricing: string[]; skipped: number } {
  copilotCatalogUrl(baseUrl);
  const entries = record(raw).data;
  if (!Array.isArray(entries)) throw new Error("Invalid Copilot model catalog.");
  const individual = new URL(baseUrl).hostname === "api.individual.githubcopilot.com";
  const usable = entries.map(record).filter((entry) => {
    const caps = record(entry.capabilities);
    const supports = record(caps.supports);
    return typeof entry.id === "string" && entry.id.length > 0
      && caps.type === "chat" && supports.tool_calls !== false && supports.streaming !== false
      && record(entry.policy).state !== "disabled";
  });
  // Match Pi's policy fallback for Individual accounts whose picker flags are all false.
  const hasPicker = usable.some((entry) => entry.model_picker_enabled === true);
  const selected = usable.filter((entry) => entry.model_picker_enabled === true
    || (!hasPicker && individual && record(entry.policy).state === "enabled"));
  const models = new Map<string, Model<Api>>();
  const unknownPricing: string[] = [];
  let skipped = 0;
  for (const entry of selected) {
    const endpoints = Array.isArray(entry.supported_endpoints) ? entry.supported_endpoints : [];
    const known = baseline.find((m) => m.id === entry.id);
    const supported = new Map<string, Api>([
      ["/responses", "openai-responses"],
      ["/v1/messages", "anthropic-messages"],
      ["/chat/completions", "openai-completions"],
    ]);
    // supported_endpoints is a capability set, not a preference list. Copilot
    // advertises chat/completions first for MAI Code 2, but only Responses routes
    // successfully. Keep vetted SDK choices; otherwise use our API priority.
    const apis = [...supported].filter(([endpoint]) => endpoints.includes(endpoint)).map(([, api]) => api);
    const api = known && apis.includes(known.api) ? known.api : apis[0];
    const caps = record(entry.capabilities);
    const limits = record(caps.limits);
    const supports = record(caps.supports);
    if (!api || !positive(limits.max_context_window_tokens) || !positive(limits.max_output_tokens)) {
      skipped++;
      continue;
    }
    const efforts = Array.isArray(supports.reasoning_effort)
      ? supports.reasoning_effort.filter((v): v is string => typeof v === "string") : [];
    const reasoning = efforts.length > 0 || supports.adaptive_thinking === true || positive(supports.max_thinking_budget);
    let thinkingLevelMap = known?.thinkingLevelMap;
    if (efforts.length) {
      thinkingLevelMap = {};
      for (const level of ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as ModelThinkingLevel[]) {
        const mapped = level === "off" ? "none" : level === "minimal" ? "low" : level;
        thinkingLevelMap[level] = efforts.includes(mapped) ? mapped : null;
      }
    }
    // Keep vetted SDK prices. For new models, Copilot's batch_size and token
    // fields establish USD cents per million tokens; only flat tiers are safe
    // because Pi stores one price tuple rather than context-threshold prices.
    const catalogCost = known?.cost ?? copilotCost(entry);
    if (!known && !catalogCost) unknownPricing.push(entry.id as string);
    models.set(entry.id as string, {
      ...(known ?? {}),
      id: entry.id as string,
      name: typeof entry.name === "string" ? entry.name : entry.id as string,
      provider: COPILOT_PROVIDER,
      baseUrl,
      api,
      reasoning,
      input: supports.vision === true ? ["text", "image"] : ["text"],
      contextWindow: limits.max_context_window_tokens,
      maxTokens: Math.min(limits.max_output_tokens, limits.max_context_window_tokens),
      cost: catalogCost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      headers: { ...COPILOT_HEADERS, ...known?.headers },
      ...(thinkingLevelMap ? { thinkingLevelMap } : {}),
      compat: {
        ...(api === "openai-completions" ? { supportsStore: false, supportsDeveloperRole: false, supportsReasoningEffort: efforts.length > 0 } : {}),
        ...(api === "anthropic-messages" ? { supportsEagerToolInputStreaming: false, forceAdaptiveThinking: supports.adaptive_thinking === true } : {}),
        ...(known?.api === api ? known.compat : {}),
      },
    });
  }
  if (selected.length > 0 && models.size === 0) throw new Error("Copilot returned no compatible chat model definitions.");
  return { models: [...models.values()], unknownPricing, skipped };
}
