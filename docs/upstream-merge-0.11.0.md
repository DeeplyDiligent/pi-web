# Pi Web 0.11.0 upstream merge

Merged upstream tag `v0.11.0` into the DeeplyDiligent fork. This includes pi 1.1.0, Next.js 16.3.8, startup preview-secret rotation, the grouped sidebar with pin/archive/order state, project/worktree composer controls, font preferences, file-drop uploads and the upstream MCP/subagent fixes.

## Reconciliation

- The upstream grouped sidebar replaces the fork's All projects dropdown and split session/file pane. All projects still appear together. The shell's workspace chooser and keyboard shortcut remain; sidebar New and group New use the upstream direct creation path. The chooser passes the validated project key when creating a session.
- Speech input, automatic response reading, temporary attachment uploads, custom icons, mobile edge swipe, workspace draft/tab memory, message editing during a run and independent cookie authentication remain.
- Dropped images use the fork's attachment handle; other dropped files use upstream working-directory uploads and mentions. The attachment picker retains the fork's temporary-file behavior.
- Copilot discovery still runs before model selection, enabled-model listing and default validation. Those paths also include upstream's remembered extension-provider models. Model-load tests cover both preserved choices across project changes and stale-response protection.
- Command status buttons render below the composer with the upstream command handler and busy guard. Ordinary status text stays in the shell's top status area.
- The new-session header keeps runtime icons and the fork's mobile gutters while adopting upstream's wrapping project/worktree controls and version labels.
- Aborted runs do not play the completion sound or automatically read a response.
- The uncommitted Telegram new-session handoff experiment is excluded and removed at the user's request.

## Deployment

Build only in a private release directory, with its own dependencies and `.next`. The release must be writable by the existing service so startup can rotate `.next/prerender-manifest.json`; the service already allows writes under `~/.local/share`. Keep the preceding live release available for rollback. Preserve the keyring-backed password and independent cookie-signing secret, loopback port 7633 and the existing public hostname.

Validation uses the full Node test suite, TypeScript, ESLint, a private production build, HTTP/API checks, exact served static assets and authentication checks. No live visual browser interaction is authorized for this update.
