// Production theme regression test. All API traffic is mocked: this never
// reads user sessions, logs in, starts an agent, or changes server settings.
// PI_THEME_TEST_URL=http://127.0.0.1:PORT PI_THEME_CHROME=/path/to/chrome node e2e/theme.mjs
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.PI_THEME_TEST_URL ?? "http://127.0.0.1:7633";
const browser = await chromium.launch({
  ...(process.env.PI_THEME_CHROME ? { executablePath: process.env.PI_THEME_CHROME } : {}),
  headless: true,
  chromiumSandbox: true,
});

async function createPage({ system = "light", preference = "auto", authenticated = false, javaScriptEnabled = true } = {}) {
  const context = await browser.newContext({
    colorScheme: system, javaScriptEnabled, locale: "en-US", reducedMotion: "reduce",
    viewport: { width: 412, height: 915 }, isMobile: true, serviceWorkers: "block",
  });
  await context.addInitScript((preference) => {
    if (localStorage.getItem("pi-theme") == null) localStorage.setItem("pi-theme", preference);
  }, preference);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await context.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    const fixtures = {
      "/api/session": { authenticated },
      "/api/sessions": { sessions: [], sessionListVersion: 1, runningSessionIds: [] },
      "/api/agent/running": { runningSessionIds: [], sessionListVersion: 1 },
      "/api/models": { models: {}, modelList: [], defaultModel: null },
      "/api/home": { home: "/test" },
      "/api/project-trust": { trusted: true },
    };
    return route.fulfill({ json: fixtures[path] ?? {} });
  });
  await page.goto(base, { waitUntil: "networkidle" });
  return { page, context, errors };
}

async function assertTheme(page, expected, checkContent = true) {
  await page.waitForFunction(({ expected, checkContent }) => {
    const metas = [...document.querySelectorAll('meta[name="theme-color"]')];
    const active = metas.filter(meta => !meta.media || matchMedia(meta.media).matches);
    return metas.length === 2 && active.length === 1
      && active[0].content === (expected === "dark" ? "#1a1a1a" : "#ffffff")
      && (!checkContent || (document.documentElement.classList.contains("dark") === (expected === "dark")
        && getComputedStyle(document.documentElement).colorScheme === expected));
  }, { expected, checkContent }, { timeout: 5000 });
  const tags = await page.locator('meta[name="theme-color"]').evaluateAll(metas => metas.map(meta => ({
    content: meta.content, media: meta.media, parent: meta.parentElement.tagName,
  })));
  assert.deepEqual(tags.map(tag => tag.content).sort(), ["#1a1a1a", "#ffffff"]);
  assert.ok(tags.every(tag => tag.parent === "HEAD"));
}

try {
  const manifestResponse = await fetch(new URL("/manifest.webmanifest", base));
  assert.equal(manifestResponse.status, 200);
  const manifest = await manifestResponse.json();
  assert.equal(Object.hasOwn(manifest, "theme_color"), false,
    "A fixed manifest theme_color pins the Android WebAPK bar across system themes");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.length >= 2);
  console.log("PASS: served install manifest has no fixed Android bar colour");

  // Native media selection must work without any JavaScript, not merely after
  // the application's theme hook executes. This covers the paused-app case.
  for (const system of ["light", "dark"]) {
    const { page, context } = await createPage({ system, javaScriptEnabled: false });
    await assertTheme(page, system, false);
    const opposite = system === "light" ? "dark" : "light";
    await page.emulateMedia({ colorScheme: opposite });
    await assertTheme(page, opposite, false);
    await context.close();
  }
  console.log("PASS: native light/dark selection with JavaScript disabled");

  for (const authenticated of [false, true]) {
    for (const system of ["light", "dark"]) {
      for (const preference of ["auto", "light", "dark"]) {
        const { page, context, errors } = await createPage({ system, preference, authenticated });
        const expected = currentSystem => preference === "auto" ? currentSystem : preference;
        await assertTheme(page, expected(system));
        // System toggles, return from another app, back/forward cache-style
        // restoration and reload must never leave an extra white fallback tag.
        for (const nextSystem of ["dark", "light", "dark"]) {
          await page.emulateMedia({ colorScheme: nextSystem });
          await page.evaluate(() => {
            window.dispatchEvent(new Event("focus"));
            document.dispatchEvent(new Event("visibilitychange"));
            window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
          });
          await assertTheme(page, expected(nextSystem));
        }
        await page.reload({ waitUntil: "networkidle" });
        await assertTheme(page, expected("dark"));
        assert.deepEqual(errors, []);
        await context.close();
      }
    }
  }
  console.log("PASS: sign-in/app, cold light/dark starts, preferences, system switches and reloads");

  const { page, context, errors } = await createPage({ system: "dark", authenticated: true });
  // The mobile header keeps this control in its overflow menu. Use the always
  // visible desktop control for the preference cycle; all scenarios above run
  // at the phone viewport size.
  await page.setViewportSize({ width: 1280, height: 900 });
  await assertTheme(page, "dark");
  for (const [label, expected] of [
    ["System theme (click for light)", "light"],
    ["Light mode (click for dark)", "dark"],
    ["Dark mode (click for system)", "dark"],
  ]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await assertTheme(page, expected);
  }
  await page.emulateMedia({ colorScheme: "light" });
  await assertTheme(page, "light");
  assert.deepEqual(errors, []);
  await context.close();
  console.log("PASS: actual theme-toggle buttons, then return to automatic mode");
} finally {
  await browser.close();
}
