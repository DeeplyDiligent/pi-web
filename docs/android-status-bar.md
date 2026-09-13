# Android installed-app status-bar colours

Pi Web's document theme and Chrome's installed Android shell are separate layers.

## Manifest: let Android choose its system colours

Do **not** add a fixed `theme_color` to `app/manifest.ts`. It is optional. Chrome's
WebAPK shell stores a manifest theme colour as a custom **light** toolbar colour.
`WebappIntentDataProvider.getColorProvider()` selects the dark provider only when
the system is dark and either a custom dark colour exists or no custom light
colour exists. Thus a valid light colour can win in both modes.

Without the fixed manifest colour, Chromium's default providers use white in
light mode and black in dark mode. This addresses the reported Samsung/Chrome
case where changing Samsung Settings → Display changed Pi Web and the status
icons, but left the installed status-bar background white.

`background_color` is retained for the launch splash; it is not the loaded status
bar. The native shell follows Android's system setting, which may differ from an
explicit in-app theme override. Desktop installed windows no longer receive a
fixed manifest title-bar tint.

Primary Chromium sources inspected:

- [WebApkIntentDataProviderFactory](https://github.com/chromium/chromium/blob/main/chrome/android/java/src/org/chromium/chrome/browser/webapps/WebApkIntentDataProviderFactory.java): absent `THEME_COLOR` defaults to `ColorUtils.INVALID_COLOR`; the factory constructs custom/default colour providers.
- [WebappIntentDataProvider](https://github.com/chromium/chromium/blob/main/chrome/android/java/src/org/chromium/chrome/browser/webapps/WebappIntentDataProvider.java): `getDefaultToolbarColor`, `getDefaultDarkToolbarColor`, and `getColorProvider` implement the fallback and system-dark selection.
- [Independent matching Samsung/Android report and fix](https://github.com/tiann/hapi/pull/1742). This is corroborating evidence, not a claim that Pi Web was tested on that device.

## Document: one declarative metadata owner

`components/BrowserTheme.tsx` renders exactly two `theme-color` meta tags with
stable light/dark content values. In auto mode, their `prefers-color-scheme` media
queries let the browser select the colour natively, including before hydration
or when page JavaScript is suspended. For manual preferences, React changes the
media conditions to `all` / `not all` so exactly one candidate matches.

Do not add another `viewport.themeColor` declaration to `app/layout.tsx`, mutate
these tags from the startup script, or watch/rewrite them with a MutationObserver.
The old startup mutation caused React to create duplicate hoisted metadata on a
dark cold start/reload; this was reproduced in real Chrome. The bootstrap and
`useTheme` may update the root class and CSS `color-scheme`, but metadata remains
owned by React. The root controller also runs on the sign-in page.

## Verification and installation cache

- Unit tests: `node --experimental-strip-types --test hooks/useTheme.test.mjs`
- Browser regression: `PI_THEME_TEST_URL=http://127.0.0.1:PORT PI_THEME_CHROME=/path/to/chrome node e2e/theme.mjs`
- The browser test mocks all API traffic; it does not access sessions or send agent prompts. It checks the served manifest, native selection with JavaScript disabled, authenticated/sign-in shells, light/dark cold starts, reloads, system switches, and actual manual-theme buttons. It requires a sandbox-capable Chrome environment and never disables Chrome's sandbox.
- Browser emulation validates page behaviour, **not** native Android status-bar pixels. Device-level confirmation still requires the installed app.
- Existing WebAPKs can retain installation metadata beyond an HTML/service-worker update. After deploying the omitted manifest colour, uninstall/reinstall from Chrome if the bar retains the old fixed colour. Reinstalling before this manifest change cannot fix it.
- Keep the service worker's manifest route network-first; do not change the app ID or discard user storage merely to force a colour update.
