// History and navigation tests do not exercise local speech hardware/models.
// Install the stub before any page opens, including popups and fresh profiles.
export async function createE2eContext(browser, options) {
  const context = await browser.newContext(options);
  // Keep navigation visible to Playwright: worker-handled native tab opens can
  // load without emitting a page event. Serve an inert worker rather than use
  // serviceWorkers: "block", whose injected script throws in sandboxed file
  // previews. Offline/cache behavior is tested separately in public/sw.test.mjs.
  await context.route(/\/sw\.js(?:\?.*)?$/, (route) => route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: "// No fetch interception in history/navigation tests.\n",
  }));
  await context.route("**/api/speech/warm", (route) => route.fulfill({ status: 204 }));
  return context;
}
