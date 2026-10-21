import assert from "node:assert/strict";
import test from "node:test";
import { createE2eContext } from "../e2e/browser-context.mjs";

test("each E2E profile installs the speech warm-up stub before it is returned", async () => {
  const profiles = [];
  const browser = {
    async newContext(options) {
      const context = {
        options,
        routes: [],
        async route(pattern, handler) {
          // Routing is asynchronous: callers must not receive the context early.
          await new Promise((resolve) => setImmediate(resolve));
          this.routes.push({ pattern, handler });
        },
      };
      profiles.push(context);
      return context;
    },
  };
  const options = { viewport: { width: 1280, height: 800 }, locale: "en-US" };
  const first = await createE2eContext(browser, options);
  const fresh = await createE2eContext(browser, options);
  assert.notEqual(first, fresh, "fresh profiles must remain isolated");
  assert.equal(profiles.length, 2);
  for (const context of profiles) {
    assert.equal(context.options, options, "preserve caller context options");
    assert.equal(context.routes.length, 1);
    const [{ pattern, handler }] = context.routes;
    assert.equal(pattern, "**/api/speech/warm", "do not hide unrelated API errors");
    let response;
    await handler({ fulfill: async (value) => { response = value; } });
    assert.deepEqual(response, { status: 204 });
  }
});
