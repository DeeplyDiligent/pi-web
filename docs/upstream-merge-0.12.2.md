# Upstream 0.12.2 merge

Merged `agegr/pi-web` main at `b017cd4` into the local fork based on `af39430`.

## Versions

- Pi Web 0.12.2.
- All seven `@earendil-works/pi-*` runtime packages pinned to 1.2.0, matching upstream.
- Foundry local SDK remains at 1.2.3. No unrelated dependency upgrades.

## Conflict decisions

- Keep signed-cookie authentication, disabled Basic authentication, the local login page, and runtime personal/work icons.
- Keep the shared new-thread workspace dialog, classic chronological list, searchable project filter, project-path tooltips, mobile sidebar swipe and local workspace picker.
- Combine classic rows with upstream session links, awaiting-input state, project actions, archive transitions and configurable file placement.
- Adopt upstream's new-composer header layout, with the fork's runtime icon endpoint.
- Keep temporary button attachments, speech transcription, response read-aloud, recording handoff and screen wake locks. Drag-and-drop keeps uploading to the project.
- Keep guarded editing during a run and the assistant Fork control. Adapt speech completion to upstream's streaming store.
- Keep direct Copilot discovery shared across picker/default/catalog validation. Adopt upstream model ordering and removed-worktree fallback, and retain upstream's shared global auth runtime.
- Keep thinking expanded by default and render short thinking as Markdown. Use upstream's split plain-text rendering above 32 KiB to bound layout work for runaway thinking. Storage failures fall back safely.
- Adopt upstream's service-worker manifest bypass, retaining the fork's offline icon assets.
- Keep the fork's GitHub release workflow and private-build deployment rules.

Upstream removed broad source-text test suites. Keep its replacement behavioral coverage, retain the local mobile-toolbar suite, and move the local edit/audio/dialog checks into `hooks/local-session-behavior.test.mjs`. Update test fixtures for local paths, temporary attachments, expanded thinking and runtime icons.

## Validation

- TypeScript `tsc --noEmit` passed.
- ESLint passed without warnings.
- Full suite passed, 2,909 tests passed and one skipped.
- A real node-pty echo process passed.
- Live pre-deployment local/public cookie API health passed; unauthenticated API requests returned 401.

The production build and idle-gated restart run from a private release outside the active checkout. Deployment verification and rollback paths are recorded in the private deployment directory, not this repository. Rollback artifacts remain until the operator confirms the restart.
