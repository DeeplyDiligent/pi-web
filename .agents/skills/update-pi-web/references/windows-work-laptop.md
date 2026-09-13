# Windows Work-Laptop Deployment

Read only when the target is the actual Windows work laptop. These are environment-specific starting facts, not defaults for the Linux server:

- Checkout: `C:\GitHub\pi-web`
- Historical fork: `https://github.com/DeeplyDiligent/pi-web.git`
- Historical upstream: `https://github.com/agegr/pi-web.git`
- Expected port: `30141`
- Historical public hostname: `work-laptop-pi.deepb.com.au`
- Corporate npm registry: `https://packagefeedproxy.microsoft.io/npm/`

Verify paths, remotes, launcher, hostname, and registry before using them. Read that checkout's `AGENTS.md`. The parent skill's approval, local-change preservation, no-automatic-history-rewrite/push, and dev/production isolation rules still apply.

## Microsoft package delay

Where the Microsoft proxy's five-day delay applies, use dependencies published at least five full days ago and verify their availability **through that proxy**. Do not switch to another registry to bypass it.

An older commit is a candidate, not proof that every pinned dependency is eligible. Resolve the desired upstream ref first, then select a candidate and inspect its manifests/lockfile:

```powershell
$cutoff = (Get-Date).AddDays(-5).ToString("o")
$commit = git rev-list -1 --before=$cutoff <VERIFIED_UPSTREAM_REF>
git show -s --date=iso-strict --format="%H%n%h %ad %s" $commit
npm view "@earendil-works/pi-coding-agent@<VERSION>" version `
  --registry=https://packagefeedproxy.microsoft.io/npm/
```

Check all relevant pinned package versions/publication metadata and lockfile hosts, not only the example package. If unavailable, select an earlier compatible release or report blocked; never silently bypass the registry. Do not turn an npm policy error into permission for global policy changes.

## Update and host

1. Record Git status/HEAD and preserve tracked, staged, and reviewed untracked changes in private rollback artifacts. Do not `git add -A`, rebase/force-push main, or publish by default.
2. Reconcile the chosen release and custom behavior in an isolated worktree. Use the existing lockfile/manager and reviewed install scripts. Build only in an approved separate production location, never a checkout currently serving dev.
3. Inspect `Get-NetTCPConnection -LocalPort 30141 -State Listen` and verify the owner before any stop. Prefer the existing service/supervisor's graceful lifecycle. Do not terminate an arbitrary first matching PID.
4. Retain the existing tunnel, allowed host, and authentication settings. Do not assume `npm link` is required or that a foreground `npm run start` is detached/durable.
5. Save a continuation plan and warn before any operation that disconnects the active agent.
6. Verify the selected release, local/public HTTP, intended auth boundary, fresh service identity, and preserved local changes. Do not expose passwords, cookies, or tunnel credentials.

Remote pushes, history rewriting, new service installation, and tunnel changes require separate explicit scope. This reference is documentation; it does not perform any operation on the laptop.
