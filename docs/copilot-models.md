# GitHub Copilot model discovery in Pi Web

Pi Web supplements Pi's bundled/pi.dev catalog by requesting the authenticated
Copilot `/models` endpoint. Newly released models no longer need a manual
`~/.pi/agent/models.json` entry **in Pi Web**. The standalone Pi CLI is unchanged.

## Usage

Open the model picker and choose **Refresh from Copilot** to fetch immediately.
The picker shows the last successful check and any discovery warnings. Refreshing
never switches your selected model or reloads an active agent session.

The browser rechecks the model list every minute while visible. Direct Copilot
requests are cached for 15 minutes and shared between concurrent requests.
When an older cached catalog exists, normal listing serves it immediately while
refreshing in the background. First discovery and explicit refresh wait at most
10 seconds for authentication/network operations. Failures preserve the last good
catalog, use a one-minute retry backoff, and surface a sanitized warning.

## Cache and authentication

- Pi's existing credential resolver handles OAuth/token refresh and request auth.
- Discovery reads account identity only to partition caches; it does not alter
  `auth.json`, `models.json`, or Pi's `models-store.json`.
- Cached upstream model metadata lives under `~/.pi/agent/pi-web-cache/copilot-<hash>.json`.
  Files contain model metadata, an identity hash, endpoint and timestamp—no tokens.
- `PI_OFFLINE` disables discovery requests and restores the cached catalog.
- Only official Individual, Business and Enterprise Copilot HTTPS API hosts are
  contacted. Redirects are refused. Extension-managed providers and custom proxy
  endpoints are left untouched.

## Mapping and limitations

The upstream picker/policy flags determine availability, rather than Pi's stale
OAuth `availableModelIds` list. Disabled models, non-chat models and models with
unsupported endpoints are not offered. Individual accounts retain Pi's policy-only
fallback when all picker flags are false.

Definitions use the advertised Responses, Anthropic Messages or Chat Completions
API, context/output limits, vision support and reasoning levels. Required IDE
headers are included for every model. Known SDK compatibility/pricing metadata is
retained; user model definitions and overrides remain the top layer.

New models with a flat Copilot `token_prices` block use its USD-cent rates per
one million tokens. Active percentage promotions are applied until their
`ends_at` time; MAI Code 2 currently becomes $0.50 input, $0.025 cached input,
$0 cache write, and $2.50 output per million tokens from its advertised 50%
promotion. Its list rates are $1.00 / $0.05 / $0 / $5.00. Tiered context prices
are not mapped because Pi stores one cost tuple per model and the default tier
would underestimate longer requests. Pi Web warns when a catalog has no safe
price, leaving zero placeholders that are **not a claim that the model is free**.
Configure verified prices via modelOverrides when needed.

The same catalog is installed before agent construction, on model selection in an
existing session, and after resource reload. This avoids models appearing in the
picker but failing with "Model not found" during startup or switching.
