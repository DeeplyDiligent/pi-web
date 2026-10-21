import assert from "node:assert/strict";
import test from "node:test";
import { createE2eContext } from "../e2e/browser-context.mjs";

test("each E2E profile installs speech and inert-worker fixtures before it is returned", async () => {
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
  const options = { viewport: { width: 1280, height: 800 }, locale: "en-US", serviceWorkers: "allow" };
  const first = await createE2eContext(browser, options);
  const fresh = await createE2eContext(browser, options);
  assert.notEqual(first, fresh, "fresh profiles must remain isolated");
  assert.equal(profiles.length, 2);
  for (const context of profiles) {
    assert.equal(context.options, options, "preserve caller options without injecting a service-worker blocker into sandboxed previews");
    assert.equal(context.routes.length, 2);
    const [worker, { pattern, handler }] = context.routes;
    for (const path of ["/sw.js", "/sw.js?v=0.12.2"]) {
      assert.ok(worker.pattern.test(`http://127.0.0.1:3000${path}`));
    }
    for (const path of ["/api/sessions", "/_next/static/sw.js.map", "/sw.json"]) {
      assert.ok(!worker.pattern.test(`http://127.0.0.1:3000${path}`), "do not hide application requests");
    }
    let workerResponse;
    await worker.handler({ fulfill: async (value) => { workerResponse = value; } });
    assert.equal(workerResponse.status, 200);
    assert.equal(workerResponse.contentType, "application/javascript");
    assert.equal(workerResponse.body, "// No fetch interception in history/navigation tests.\n");
    assert.equal(pattern, "**/api/speech/warm", "do not hide unrelated API errors");
    let response;
    await handler({ fulfill: async (value) => { response = value; } });
    assert.deepEqual(response, { status: 204 });
  }
});
