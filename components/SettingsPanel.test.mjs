import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cssSource = await readFile(new URL("../app/settings.css", import.meta.url), "utf8");
const loginSource = await readFile(new URL("../app/login/page.tsx", import.meta.url), "utf8");
const panelSource = await readFile(new URL("./SettingsPanel.tsx", import.meta.url), "utf8");

test("the trust dialog Settings › MCP opens stacks above Settings", () => {
  const zIndex = (selector) => Number(cssSource.match(new RegExp(`\\${selector} \\{[^}]*z-index: (\\d+);`))?.[1]);
  assert.ok(zIndex(".project-trust-backdrop") > zIndex(".settings-dialog-backdrop"));
});

test("session list choices reuse the themed segmented control, not appearance swatches", () => {
  const section = panelSource.match(/<section[^>]*>\s*<h3[^>]*>\{t\("settings\.sessionList"\)\}[\s\S]*?<\/section>/)?.[0];
  assert.ok(section);
  assert.match(section, /role="radiogroup"[^>]*aria-label=\{t\("settings\.sessionList"\)\}[^>]*aria-describedby="settings-session-list-description"[^>]*className="settings-send-mode-options"/);
  assert.match(section, /id="settings-session-list-description"/);
  assert.match(section, /className="settings-send-mode-option"/);
  assert.match(section, /className="settings-send-mode-label"/);
  assert.doesNotMatch(section, /settings-theme-/);
  assert.match(section, /type="radio" name="session-list-view" value=\{view\} checked=\{sessionListView === view\}/);
  assert.match(section, /onChange=\{\(\) => setSessionListView\(view\)\}/);
  for (const state of [":has(input:checked)", ":not(:has(input:checked)):hover", ":has(input:focus-visible)"]) {
    assert.ok(cssSource.includes(`.settings-send-mode-option${state}`));
  }
});

test("the login page returns only to a destination safeLoginDestination() accepts", () => {
  assert.match(loginSource, /safeLoginDestination\(destination, window\.location\.origin\)/);
});
