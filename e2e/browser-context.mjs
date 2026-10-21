// History and navigation tests do not exercise local speech hardware/models.
// Install the stub before any page opens, including popups and fresh profiles.
export async function createE2eContext(browser, options) {
  // Keep navigation and mocked requests visible to Playwright. A controlling
  // service worker can load a native Ctrl/middle-click tab without Playwright
  // emitting its page event, and worker-handled requests bypass context.route.
  // Offline/cache behavior is covered separately by public/sw.test.mjs.
  const context = await browser.newContext({ ...options, serviceWorkers: "block" });
  await context.route("**/api/speech/warm", (route) => route.fulfill({ status: 204 }));
  return context;
}
