---
name: update-pi-web
description: Update, build, and host the local Pi Web server while preserving local working-tree changes and respecting Microsoft's five-day npm package delay.
---

# Update Pi Web

Use this skill when updating or restarting the Pi Web instance on this machine.

## Local setup

- Source repository: `C:\GitHub\pi-web`
- Fork (`origin`): `https://github.com/DeeplyDiligent/pi-web.git`
- Upstream (`upstream`): `https://github.com/agegr/pi-web.git`
- Port: `30141`
- Public hostname: `work-laptop-pi.deepb.com.au`
- npm registry: `https://packagefeedproxy.microsoft.io/npm/`

## Critical package-age constraint

Microsoft's npm proxy blocks packages published less than five days ago. Do not
build the newest Pi Web commit when it references packages newer than five full
days.

Choose the newest commit whose commit timestamp is at least five days old:

```powershell
$cutoff = (Get-Date).AddDays(-5).ToString("o")
$commit = git rev-list -1 --before=$cutoff origin/main
git show -s --date=iso-strict --format="%H%n%h %ad %s" $commit
```

Confirm that every pinned `@earendil-works/pi-*` dependency at that commit is
available through the Microsoft registry before building:

```powershell
npm view "@earendil-works/pi-coding-agent@<version>" version `
  --registry=https://packagefeedproxy.microsoft.io/npm/
```

If any dependency is unavailable, move to the previous release commit. Do not
bypass the Microsoft proxy with another public registry.

## Preserve local changes

Never discard, reset, or overwrite changes in `C:\GitHub\pi-web`. Show
`git status --short` before and after the update.

Before moving `main`, preserve uncommitted work in a commit on a temporary backup
branch. Replay the fork's custom commits onto the eligible upstream release so
the deployed build includes those changes.

## Update and build

1. Confirm the remotes and fetch without modifying the checked-out branch:

   ```powershell
   git -C C:\GitHub\pi-web remote -v
   git -C C:\GitHub\pi-web fetch --all --tags --prune
   ```

2. Select and display the newest eligible commit using the five-day cutoff.

3. Create a backup branch before rewriting `main`. Commit any working changes
   with a descriptive message so they can be replayed safely.

   ```powershell
   git -C C:\GitHub\pi-web branch backup/pre-update-<timestamp>
   git -C C:\GitHub\pi-web add -A
   git -C C:\GitHub\pi-web commit -m "<description>"
   ```

4. Rebase the fork's custom commits onto the selected eligible release. Resolve
   conflicts by preserving the custom behavior while adapting it to the older
   release APIs.

5. Push the rewritten `main` to the fork only:

   ```powershell
   git -C C:\GitHub\pi-web push --force-with-lease origin main
   ```

   Never push to `upstream`.

6. Install and build through the configured Microsoft npm proxy:

   ```powershell
   Set-Location C:\GitHub\pi-web
   npm install --registry=https://packagefeedproxy.microsoft.io/npm/
   npm run build
   npm link
   ```

   `npm link` exposes this fork's `pi-web` command globally. The command ensures
   the `work-laptop-pi` Cloudflare tunnel is running, trusts the public hostname,
   and starts the production server from this repository.

## Host

Stop only the process listening on port `30141`, then start the production
server as a detached background process:

```powershell
$listener = Get-NetTCPConnection -LocalPort 30141 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1
if ($listener) {
  Stop-Process -Id $listener.OwningProcess
}

Set-Location C:\GitHub\pi-web
$env:PI_WEB_ALLOWED_HOSTS = "work-laptop-pi.deepb.com.au"
npm run start
```

Keep the server process detached so it survives the Copilot session.

## Verify

Verify both the local listener and trusted proxy hostname:

```powershell
Get-NetTCPConnection -LocalPort 30141 -State Listen
Invoke-WebRequest http://127.0.0.1:30141 `
  -Headers @{ Host = "work-laptop-pi.deepb.com.au" } `
  -UseBasicParsing
git -C C:\GitHub\pi-web status --short
```

Report the hosted commit, release version, HTTP status, and confirmation that
the fork's custom changes are present.
