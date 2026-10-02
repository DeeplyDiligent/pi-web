# GitHub Releases

## Automatic CD on `main`

`.github/workflows/release.yml` runs on pushes to `main`. It:

1. Calls the reusable CI workflow: lint, TypeScript, unit tests, and production-mode E2E tests must all pass.
2. Allocates the next **patch** version above the highest stable version in `package.json` or the repository's `v*` tags. Prereleases are excluded. For example, `0.9.3` becomes `0.9.4`.
3. Updates `package.json` and `package-lock.json` in a release-only commit and builds the app on the GitHub runner.
4. Runs `npm pack` to produce an installable `.tgz` and retains it as an Actions artifact for 30 days.
5. Pushes an annotated `v<version>` tag pointing to that release commit.
6. Creates a **GitHub Release**, attaches the packaged app, generates commit-based release notes, and explicitly marks it **Latest**.

**Nothing is published to npm.** `npm ci`, `npm version`, and `npm pack` are only used to install dependencies, update local package metadata, and create the archive. Version allocation never queries the npm registry. No `NPM_TOKEN` or npm publishing account is needed.

The version bump is persisted in the tagged release commit, **not pushed back to `main`**. This avoids bot-triggered release loops, conflicts with simultaneous pushes, and branch-protection bypasses. The source SHA is recorded in a `Pi-Web-Source` commit trailer. Future releases use repository tags as version history even though `main` keeps its source version.

Publishing runs are serialized and never cancelled in progress. GitHub concurrency keeps at most one pending run, so rapid pushes may be coalesced into the newest pending source revision. Pull requests only run CI and never publish. Builds happen on disposable GitHub runners; this workflow does not build in or restart the local Pi Web installation.

## One-time setup

- Enable GitHub Actions in this repository.
- Allow the release workflow's automatic `GITHUB_TOKEN` to write repository contents (the workflow requests `contents: write`). Repository/org policies and tag rules must permit the Actions bot to create `v*` tags and releases.

No personal access token, npm secret, or permission to write to `main` is required. Package scope ownership does not affect creating or downloading the GitHub release archive.

## Retries and partial failures

Use **Re-run failed jobs** on the original Release workflow run.

- Before the tag is reserved, a retry may allocate a fresh version if another release has advanced the history.
- Once the tag exists, a retry finds the exact source trailer and reuses that version and release commit.
- If the GitHub Release already exists, the workflow replaces its archive attachment and explicitly marks the release Latest.
- A retry refuses to move Latest backwards if a newer stable release tag exists.
- Tags reserved before a failed release upload are intentionally retained so retries cannot accidentally allocate another version. Do not delete or repoint a published release tag.

Tag creation and release publication are separate operations. If release publication fails after tag creation, retry the failed publish job to finish it. A retry rebuilds the archive, so its build bytes may differ while its version and source remain the same.

## Verification and installation

Replace `<version>` and `<owner/repo>` with the actual release values:

```bash
gh release view v<version> --repo <owner/repo>
gh api repos/<owner/repo>/releases/latest --jq .tag_name
gh release download v<version> --repo <owner/repo> --pattern '*.tgz'
npx --yes --package=https://github.com/<owner/repo>/releases/download/v<version>/agegr-pi-web-<version>.tgz pi-web-server
```

Requires Node.js 22.19.0 or newer. `pi-web-server` is the portable launcher: it starts the app at `http://127.0.0.1:30141` without requiring Cloudflare Tunnel. The existing `pi-web` command keeps this installation's Windows-specific tunnel behavior. You can pass `--port <port>` to `pi-web-server` to change the port.

The release version and GitHub Latest should agree. The `.tgz` contains the compiled app and package metadata, not bundled dependencies; installing it still resolves dependencies from npm. Inspect the Actions run's CI jobs and uploaded package artifact if publication did not complete.

The pre-existing `npm run release` helper is an unrelated manual npm-publishing command; do not use it for this GitHub-only pipeline. Any manual production build must use a separate private checkout/release directory, never the active development checkout.
