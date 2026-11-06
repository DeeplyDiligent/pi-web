import assert from "node:assert/strict";

// Exercise the actual composer without starting a model or interrupting a run.
export async function checkComposerControls(page, { base, sessionId }) {
  const originalViewport = page.viewportSize();
  let streaming = false;
  const state = () => ({
    isStreaming: streaming, isPromptRunning: streaming, isCompacting: false,
    model: { provider: "e2e", id: "model-0" }, thinkingLevel: "medium",
  });
  const routes = [
    `**/api/sessions/${sessionId}/state`,
    `**/api/agent/${sessionId}`,
    `**/api/agent/${sessionId}/events*`,
  ];
  await page.route(routes[0], route => route.fulfill({ json: { running: true, state: state() } }));
  await page.route(routes[1], route => route.fulfill({ json: { state: state() } }));
  await page.route(routes[2], route => route.fulfill({
    contentType: "text/event-stream",
    body: `data: ${JSON.stringify({ type: "connected", isStreaming: streaming })}\n\n`,
  }));
  try {
    for (streaming of [false, true]) {
      for (const width of [320, 360, 390, 480]) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(`${base}/?session=${sessionId}`, { waitUntil: "domcontentloaded" });
        const composer = page.locator(".chat-composer-shell");
        const more = composer.getByRole("button", { name: "More controls", exact: true });
        await more.waitFor();
        if (streaming) await composer.locator(".chat-composer-queue-action").first().waitFor();
        await more.click();
        const menu = composer.locator(".chat-composer-secondary-menu");
        await menu.waitFor({ state: "visible" });
        const bounds = await menu.evaluate(element => {
          const rect = element.getBoundingClientRect();
          const toolbar = element.closest(".chat-composer-toolbar").getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
            toolbarLeft: toolbar.left, toolbarRight: toolbar.right, toolbarTop: toolbar.top,
            viewportWidth: window.innerWidth, viewportHeight: window.innerHeight };
        });
        assert.ok(bounds.left >= 0 && bounds.right <= bounds.viewportWidth,
          `${width}px ${streaming ? "streaming" : "idle"}: controls menu leaves the screen: ${JSON.stringify(bounds)}`);
        assert.ok(bounds.left >= bounds.toolbarLeft && bounds.right <= bounds.toolbarRight + 1,
          "the menu must fit the composer toolbar, not the ellipsis button");
        assert.ok(bounds.top >= 0 && bounds.bottom < bounds.toolbarTop && bounds.bottom <= bounds.viewportHeight,
          "the menu must remain above the composer and within the screen");
        if (streaming) assert.equal(await menu.getByRole("button", { name: "Stop", exact: true }).isVisible(), true);
        await menu.getByRole("button", { name: "Collapse controls", exact: true }).click();
        await menu.waitFor({ state: "hidden" });
        await more.click();
        await page.mouse.click(4, 100);
        await menu.waitFor({ state: "hidden" });
      }
    }
    console.log("PASS: idle and streaming composer menus fit 320–480px phones; Stop and dismissal remain available");
  } finally {
    for (const route of routes) await page.unroute(route);
    await page.setViewportSize(originalViewport);
    await page.goto(`${base}/?session=${sessionId}`, { waitUntil: "domcontentloaded" });
  }
}
