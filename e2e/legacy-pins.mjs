import assert from "node:assert/strict";
import { join } from "node:path";
import { createE2eContext } from "./browser-context.mjs";
import { showSidebarSessions } from "./sidebar.mjs";

/** Pin/unpin through the actual menu and persisted API, without prompting a model. */
export async function checkLegacyPins({ browser, base, artifacts, a, b, api, post }) {
  const original = (await api("/api/sessions/ui-state")).state;
  const entries = [a, b].map((id) => ({ id, pinnedAt: original.sessions[id]?.pinnedAt ?? null, archivedAt: original.sessions[id]?.archivedAt ?? null }));
  for (const width of [1280, 390]) {
    const context = await createE2eContext(browser, { viewport: { width, height: 800 }, locale: "en-US" });
    await context.addInitScript(() => {
      localStorage.setItem("pi-web:session-list-view", "chronological");
      localStorage.setItem("pi-web:sidebar-pins-collapsed", "true");
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const panel = page.locator("#session-sidebar-panel-sessions");
    const row = (id, where = "group") => panel.locator(`[data-row-key="session:${where}:${id}"]`);
    const menu = page.getByRole("menu", { name: "Session actions" });
    const openMenu = async (id, where = "group") => {
      await row(id, where).hover();
      await row(id, where).getByRole("button", { name: "More actions", exact: true }).click();
      await menu.waitFor();
    };
    const showSessions = async () => {
      const show = page.getByRole("button", { name: "Show sidebar", exact: true });
      const hide = page.getByRole("button", { name: "Hide sidebar", exact: true });
      await show.or(hide).waitFor();
      // Initial session restoration can close the mobile drawer after the first click.
      for (let attempt = 0; attempt < 5 && !(await hide.isVisible()); attempt++) {
        await show.click({ timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(200);
      }
      await hide.waitFor();
      await showSidebarSessions(page);
    };
    const reload = async () => {
      await page.reload({ waitUntil: "domcontentloaded" });
      await showSessions();
    };
    const firstPin = async (id) => {
      await row(id, "pinned").waitFor();
      await page.waitForFunction((expected) => {
        const rows = document.querySelectorAll('#session-sidebar-panel-sessions .sidebar-sessions-view:not([hidden]) [data-row-key^="session:"]');
        return [...rows].sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top))[0]?.getAttribute("data-row-key") === `session:pinned:${expected}`;
      }, id);
    };
    try {
      await post("/api/sessions/ui-state", { action: "restore", entries: [a, b].map((id) => ({ id, pinnedAt: null, archivedAt: null })) });
      await page.goto(`${base}/?session=${a}`, { waitUntil: "domcontentloaded" });
      await showSessions();
      await row(a).waitFor();
      await row(b).waitFor();
      await openMenu(b);
      await menu.getByRole("menuitem", { name: /^Pin/ }).click();
      await firstPin(b);
      assert.equal(await row(b).count(), 0, "pin does not duplicate the unpinned row");
      assert.equal(new URL(page.url()).searchParams.get("session"), a, "pin leaves the open chat unchanged");
      await reload();
      await firstPin(b);
      assert.ok((await api("/api/sessions/ui-state")).state.sessions[b].pinnedAt, "pin persisted on the server");
      await openMenu(b, "pinned");
      await menu.getByRole("menuitem", { name: /^Unpin/ }).waitFor();
      await page.keyboard.press("p");
      await row(b).waitFor();
      assert.equal(await row(b, "pinned").count(), 0, "P removes the pin");
      await openMenu(a);
      await page.keyboard.press("p");
      await firstPin(a);
      await openMenu(a, "pinned");
      await menu.getByRole("menuitem", { name: /^Unpin/ }).click();
      await row(a).waitFor();
      await reload();
      await row(a).waitFor();
      await row(b).waitFor();
      const state = (await api("/api/sessions/ui-state")).state;
      assert.equal(state.sessions[a]?.pinnedAt, undefined);
      assert.equal(state.sessions[b]?.pinnedAt, undefined);
      assert.equal(await panel.locator('.session-tree-pinned-header').count(), 0, "legacy view stays flat despite saved grouped collapse");
      assert.deepEqual(errors, []);
      console.log(`PASS: ${width}px legacy time view pins first, persists after reload, and unpins via menu and P without duplicate rows`);
    } catch (error) {
      await page.screenshot({ path: join(artifacts, `legacy-pins-${width}.png`) }).catch(() => {});
      throw error;
    } finally {
      await context.close();
      await post("/api/sessions/ui-state", { action: "restore", entries });
    }
  }
}
