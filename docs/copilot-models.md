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

For genuinely new models, Copilot does not consistently supply documented pricing
units. Pi Web warns when cost estimates are unavailable instead of inventing a
currency conversion. Pi's numeric cost fields are then zero placeholders, **not a
claim that the model is free**. Configure verified prices via modelOverrides if
accurate cost accounting is required.

The same catalog is installed before agent construction, on model selection in an
existing session, and after resource reload. This avoids models appearing in the
picker but failing with "Model not found" during startup or switching.
