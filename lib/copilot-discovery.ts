import { createHash } from "crypto";
import { mkdir, readFile } from "fs/promises";
import { join } from "path";
import { getAgentDir, type ModelRuntime } from "@earendil-works/pi-coding-agent";
import { githubCopilotProvider } from "@earendil-works/pi-ai/providers/github-copilot";
import type { Credential, Provider } from "@earendil-works/pi-ai";
import { COPILOT_HEADERS, COPILOT_PROVIDER, copilotCatalogUrl, parseCopilotCatalog } from "./copilot-catalog";
import { writePrivateFileAtomicSync } from "./atomic-file";
import { invalidateModelsCache } from "./models-cache";

const TTL = 15 * 60_000;
const RETRY_DELAY = 60_000;
const TIMEOUT = 10_000;
const CACHE_VERSION = 1;
interface CatalogEntry {
  version: number;
  account: string;
  baseUrl: string;
  checkedAt: number;
  data: unknown;
}
interface CacheSlot {
  entry?: CatalogEntry;
  loaded: boolean;
  retryAt: number;
  pending?: Promise<void>;
  warning?: string;
}
interface InstalledProvider {
  provider: Provider;
  baseline: ReturnType<ModelRuntime["getModels"]>;
  account: string;
}
interface DiscoveryState {
  slots: Map<string, CacheSlot>;
  installed: WeakMap<ModelRuntime, InstalledProvider>;
}
const globals = globalThis as typeof globalThis & { __piCopilotDiscovery?: DiscoveryState };
const state = globals.__piCopilotDiscovery ??= { slots: new Map(), installed: new WeakMap() };

export interface CopilotDiscoveryOptions {
  force?: boolean;
  /** Serve stale data immediately while refreshing in the background. */
  background?: boolean;
}
export interface CopilotDiscoveryResult {
  checkedAt?: number;
  warning?: string;
}

/**
 * Pi Web owns this cache; never modifies models.json, auth availability, or Pi's
 * pi.dev models-store. Token refresh and persistence remain owned by the SDK.
 */
export async function syncCopilotModels(
  runtime: ModelRuntime,
  options: CopilotDiscoveryOptions = {},
): Promise<CopilotDiscoveryResult> {
  // Don't replace a project/plugin's custom Copilot implementation.
  const installed = state.installed.get(runtime);
  const registered = runtime.getRegisteredNativeProvider(COPILOT_PROVIDER);
  if (runtime.getRegisteredProviderConfig(COPILOT_PROVIDER)
    || (registered && registered !== installed?.provider)) return options.force
      ? { warning: "Copilot is managed by an extension; direct discovery did not replace it." } : {};
  const provider = runtime.getProvider(COPILOT_PROVIDER);
  if (!provider || !runtime.hasConfiguredAuth(COPILOT_PROVIDER)) return options.force
    ? { warning: "Connect GitHub Copilot in Models settings before refreshing its catalog." } : {};
  try { copilotCatalogUrl(provider.baseUrl ?? ""); } catch {
    return options.force ? { warning: "Direct discovery is unavailable for a custom Copilot endpoint." } : {};
  }

  const agentDir = getAgentDir();
  let stored: Credential | undefined;
  try {
    stored = (JSON.parse(await readFile(join(agentDir, "auth.json"), "utf8")) as Record<string, Credential>)[COPILOT_PROVIDER];
  } catch { /* SDK will still resolve environment-only credentials below. */ }
  // Stable across OAuth access-token refresh, different for another login/account.
  const identity = stored?.type === "oauth" ? stored.refresh
    : stored?.type === "api_key" ? stored.key : process.env.COPILOT_GITHUB_TOKEN;
  if (!identity || identity.startsWith("!") || identity.startsWith("$")) return options.force
    ? { warning: "Direct discovery requires stored Copilot OAuth or a token credential." } : {};
  const account = createHash("sha256").update(identity).digest("hex");
  if (installed && installed.account !== account) {
    const reset = githubCopilotProvider();
    runtime.registerNativeProvider(reset);
    state.installed.set(runtime, { provider: reset, baseline: installed.baseline, account });
  }
  const key = `${agentDir}:${account}`;
  let slot = state.slots.get(key);
  if (!slot) {
    if (state.slots.size >= 8) state.slots.delete(state.slots.keys().next().value!);
    slot = { loaded: false, retryAt: 0 };
    state.slots.set(key, slot);
  }
  const cachePath = join(agentDir, "pi-web-cache", `copilot-${account}.json`);
  const baseline = installed?.baseline ?? runtime.getModels(COPILOT_PROVIDER);
  if (!slot.loaded) {
    slot.loaded = true;
    try {
      const saved = JSON.parse(await readFile(cachePath, "utf8")) as CatalogEntry;
      if (saved.version === CACHE_VERSION && saved.account === account && Number.isFinite(saved.checkedAt)) {
        parseCopilotCatalog(saved.data, baseline, saved.baseUrl);
        slot.entry = saved;
      }
    } catch { /* Missing/invalid cache: keep the SDK baseline until discovery succeeds. */ }
  }

  const cache = slot;
  const offline = process.env.PI_OFFLINE !== undefined;
  if (!offline && (options.force || Date.now() >= cache.retryAt)
    && (options.force || !cache.entry || Date.now() - cache.entry.checkedAt >= TTL)) {
    if (!cache.pending) {
      cache.pending = (async () => {
        try {
          const signal = AbortSignal.timeout(TIMEOUT);
          const resolved = await runtime.getAuth(COPILOT_PROVIDER, { signal });
          if (!resolved?.auth.apiKey) throw new Error("No resolved credential");
          const baseUrl = resolved.auth.baseUrl ?? provider.baseUrl!;
          const url = copilotCatalogUrl(baseUrl);
          const response = await fetch(url, {
            signal,
            redirect: "error",
            headers: {
              ...COPILOT_HEADERS,
              ...resolved.auth.headers,
              Accept: "application/json",
              Authorization: `Bearer ${resolved.auth.apiKey}`,
              "X-GitHub-Api-Version": "2026-06-01",
            },
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          // Bounded catalog; never persist response headers or credentials.
          const body = await response.text();
          if (body.length > 4 * 1024 * 1024) throw new Error("Catalog is too large");
          const data: unknown = JSON.parse(body);
          parseCopilotCatalog(data, baseline, baseUrl);
          cache.entry = { version: CACHE_VERSION, account, baseUrl, checkedAt: Date.now(), data };
          cache.warning = undefined;
          cache.retryAt = 0;
          try {
            await mkdir(join(agentDir, "pi-web-cache"), { recursive: true });
            writePrivateFileAtomicSync(cachePath, JSON.stringify(cache.entry));
          } catch {
            cache.warning = "Copilot models refreshed, but the offline cache could not be saved.";
          }
          invalidateModelsCache();
        } catch {
          // SDK/network errors may contain credentials; don't log or return them.
          cache.warning = cache.entry
            ? "Could not refresh GitHub Copilot. Showing the last successful catalog."
            : "Could not refresh GitHub Copilot. Showing Pi's existing models.";
          cache.retryAt = Date.now() + RETRY_DELAY;
        } finally {
          cache.pending = undefined;
        }
      })();
    }
    if (options.force || !options.background || !cache.entry) await cache.pending;
  }

  if (!cache.entry) return { warning: offline ? "Copilot discovery is disabled by PI_OFFLINE." : cache.warning };
  const parsed = parseCopilotCatalog(cache.entry.data, baseline, cache.entry.baseUrl);
  const ids = new Set(parsed.models.map((model) => model.id));
  const base = githubCopilotProvider();
  // Preserve built-in definitions for historical sessions, but the live catalog
  // is authoritative for picker availability, not stale OAuth availableModelIds.
  const merged = new Map(baseline.map((model) => [model.id, model]));
  for (const model of parsed.models) merged.set(model.id, model);
  const native: Provider = {
    ...base,
    getModels: () => [...merged.values()],
    filterModels: (models) => models.filter((model) => ids.has(model.id)),
  };
  state.installed.set(runtime, { provider: native, baseline, account });
  runtime.registerNativeProvider(native);
  // Registration starts a cache-only refresh itself; synchronously installed
  // definitions are immediately usable. User models.json overlays stay on top.
  let warning = offline ? "Copilot discovery is disabled by PI_OFFLINE; showing cached models." : cache.warning;
  if (parsed.unknownPricing.length) {
    warning = [warning, `Cost estimates are unavailable for newly discovered models: ${parsed.unknownPricing.join(", ")}. These models are not necessarily free.`].filter(Boolean).join(" ");
  }
  if (parsed.skipped) warning = [warning, `${parsed.skipped} Copilot models use unsupported APIs or metadata and were skipped.`].filter(Boolean).join(" ");
  return { checkedAt: cache.entry.checkedAt, warning };
}
