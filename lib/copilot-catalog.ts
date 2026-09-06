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
    const apis = endpoints.map((e) => supported.get(String(e))).filter(Boolean) as Api[];
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
    // Copilot doesn't consistently supply price units. Keep vetted SDK pricing;
    // explicitly report unknown costs rather than guessing a currency conversion.
    if (!known) unknownPricing.push(entry.id as string);
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
      cost: known?.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
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
