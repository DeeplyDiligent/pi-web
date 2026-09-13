---
name: update-pi-web
description: Use when auditing, updating, or restarting this Pi Web deployment safely.
---

# Update Pi Web Safely

Read the checkout's `AGENTS.md` first. This Linux checkout is `/home/deep/dev/pi-web`; port 30141 is the expected listener, not proof of process identity. Do not use Windows work-laptop commands here. Read [the Windows reference](references/windows-work-laptop.md) only when operating on that actual machine.

## Audit before apply

A request to check versions is not permission to install dependencies, rewrite Git history, push, build, restart, or expose a service. Present the proposed version/commit, local-change reconciliation, tests, registry constraints, interruption, backup, and rollback first.

1. Check for an existing listener: `lsof -nP -iTCP:30141 -sTCP:LISTEN`. Identify its exact PID, cwd, owning unit/launcher, and whether it runs `next dev` or production. Reuse a healthy instance; do not start a second dev process on another port against the same `.next/dev/lock`.
2. Record `git status --short`, HEAD, branch, and upstream/remotes (redact embedded credentials). Never assume a remote named `origin` is upstream. Identify staged/unstaged/untracked local modifications and do not overwrite them.
3. Read `package.json`, the lockfile, installed Node/npm versions, and `npm config get registry`. Inspect registry configuration without printing auth tokens or whole `.npmrc` files.
4. Check application/package versions with read-only metadata and approved Git fetches; neither a fetched ref nor an outdated list is permission to update.
5. Apply package-age restrictions only when required by the actual configured registry/policy. A commit age alone does not establish dependency publication ages or availability. Do not bypass corporate registries or globally weaken npm policy.
6. Baseline direct HTTP/API behavior, bounded logs, and active runs. Discover the real public hostname and existing auth/tunnel configuration without exposing secrets; never borrow a laptop hostname.

## Preserve and reconcile

After approval, create a private timestamped backup outside the repository/build tree. Save old HEAD, branch, status, tracked binary diff, staged diff, and reviewed important untracked source. Preserve deployment metadata and necessary secret files privately without printing them. Verify backup readability; a patch alone does not save untracked files.

Prefer an isolated worktree/branch to evaluate the selected release and reconcile local modifications. Do not auto-commit all user work, run `git reset --hard`/`git clean`, blindly pop a stash, rebase `main`, or force-push. A deployment update does not authorize any remote push. If history rewriting or publication is truly needed, propose it separately.

Install only through the selected checkout's existing lockfile/manager and configured registry after reviewing relevant lifecycle scripts. Use `npm ci` when consistent with project requirements; do not opportunistically regenerate the lockfile or perform major upgrades. Do not run `npm link` merely to host this checkout.

## Development mode: no production build

**Never run `next build` or `npm run build` in this active development checkout.** They can pollute `.next` and break the dev server. Do not use a webpack dev fallback. For source verification use the project-approved focused tests, `node_modules/.bin/tsc --noEmit`, and `npm run lint`, reporting pre-existing failures separately.

For a browser-only module-factory/HMR overlay:

1. Use the browser's explicit reload action.
2. Recheck a fresh page, direct HTTP/API response, and current server logs.
3. Restart only if fresh-page/server-side checks corroborate a failure.
4. With approved interruption, gracefully stop only the exact dev process. Move `.next` to a unique `mktemp -d` backup; do not delete it blindly.
5. Restart with the standard `npm run dev` via the verified supervisor/launcher. Confirm there is only one listener and no competing lock holder.

A healthy dev server does not need a restart merely because skill files changed. Next may generate an `AGENTS.md` block at startup; inspect status and exclude unrelated generated changes from any later commit.

## Production deployment

Only for an explicitly selected production deployment, build in a **separate release/worktree directory** with its own dependencies and build output, after reading that checkout's instructions. Inspect the actual package scripts; do not hardcode a bundler from another version. Run the permitted production build there, not in `/home/deep/dev/pi-web` while it serves development.

Preserve the current release and service definition for rollback. Use the existing verified user service/launcher and loopback binding; do not create a second production/dev listener or a new tunnel automatically. Configure only the actual approved public hostname and retain its auth boundary.

## Restart and verify

A restart of the service hosting this agent can kill the turn and its children. Finish unrelated work, save exact pending actions/post-reconnect checks, and warn immediately before interruption. Use an independent supervisor/operator when needed; do not assume a child shell outlives a service restart.

After the approved restart/switch, verify:

- exact unit/launcher, PID and fresh start time, single intended listener;
- correct mode and selected commit/release, with local customizations preserved;
- direct root and bounded API health, expected auth behavior, and actual public route;
- recent logs without new startup, dependency, or restart-loop failures;
- relevant session UI/streaming functionality when affected, using an authorized bounded test;
- `git status --short`, remaining unrelated changes, and readable rollback artifacts.

Report actual checks and any unverified capability. Do not claim completion from a process launch, package install, or build alone. Do not perform an update/restart as a side effect of reading this skill.
