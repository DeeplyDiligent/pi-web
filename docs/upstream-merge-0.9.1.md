# Upstream v0.9.1 merge (2026-09-14)

Merged `agegr/pi-web` at `8366762` into the fork based on `54ea47d`.
Pi remains pinned to 0.85.1. The lockfile changes only the application version;
no dependency versions or download locations change.

## Reconciliation decisions

- Preserve the fork's workspace chooser, folder creation, mobile edge swipe,
  compact composer spacing, currency-safe math, unlimited active dictation,
  cost-only footer and runtime-selectable PWA icons.
- Keep **Fork** on completed assistant responses and **Edit from here** on user
  messages, including the first message and messages edited during a run. The
  fork's server-side abort/navigation transaction supersedes upstream's older
  client-side edit path. Retain upstream's first-message persistence fix for
  the legacy fork command and streaming/model recovery changes.
- Support upstream's new palettes while retaining one declarative owner for
  browser theme metadata. Bootstrap and runtime set the palette, dark class
  and native color scheme consistently; mist/rose are light and pine is dark.
- Keep the existing independently signed, seven-day Secure/HttpOnly session
  cookies and local sign-in shell. Adapt upstream `/api/web-auth` to the same
  login/session/logout handlers, so upstream settings/logout and `/login` work
  without a second token format. Do not re-enable Basic Auth or replace the
  signing key with the password. Host/origin checks remain enforced.
- Update regression tests for these deliberate fork behaviors, including
  compatibility between both login API surfaces. Isolate the auth unit test
  from an inherited production password setting.

## Verification

The merged source passes TypeScript, ESLint and 1,105 automated tests. A native
PTY smoke test also succeeds using the isolated lockfile installation. Browser
interaction is not part of this update; deployment verification uses HTTP,
API authentication, manifest/static asset hashes and service identity checks.
Production builds must run in the private release directory, not the live
checkout. Keep the prior source, service configuration and build for rollback.
