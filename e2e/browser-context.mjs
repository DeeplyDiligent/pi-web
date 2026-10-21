// History and navigation tests do not exercise local speech hardware/models.
// Install the stub before any page opens, including popups and fresh profiles.
export async function createE2eContext(browser, options) {
  const context = await browser.newContext(options);
  await context.route("**/api/speech/warm", (route) => route.fulfill({ status: 204 }));
  return context;
}
