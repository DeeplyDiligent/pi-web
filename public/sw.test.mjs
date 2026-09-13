import assert from "node:assert/strict";
import test from "node:test";

const listeners = new Map();
globalThis.caches = { match: async () => undefined, open: async () => ({ put: async () => {} }) };
globalThis.self = {
  location: {
    href: "https://pi.test/sw.js?v=test",
    origin: "https://pi.test",
  },
  addEventListener: (type, listener) => listeners.set(type, listener),
  clients: null,
};

await import("./sw.js");

function dispatchFetch(path) {
  let pending;
  listeners.get("fetch")({
    request: new Request(`https://pi.test${path}`),
    respondWith: (promise) => { pending = promise; },
  });
  return pending;
}

test("manifest checks the network instead of serving stale installation metadata", async (t) => {
  const fresh = new Response(JSON.stringify({ theme_color: "#ffffff" }));
  t.mock.method(globalThis, "fetch", async () => fresh);
  t.mock.method(caches, "match", async () => assert.fail("online manifest must not be cache-first"));
  let saved;
  t.mock.method(caches, "open", async () => ({
    put: async (_request, response) => { saved = await response.json(); },
  }));
  const response = await dispatchFetch("/manifest.webmanifest");
  assert.equal((await response.json()).theme_color, "#ffffff");
  assert.equal(saved.theme_color, "#ffffff", "offline fallback must refresh too");
});

test("a cache write failure does not hide the live manifest", async (t) => {
  const fresh = new Response(JSON.stringify({ theme_color: "#ffffff" }));
  t.mock.method(globalThis, "fetch", async () => fresh);
  t.mock.method(caches, "open", async () => { throw new Error("quota"); });
  assert.equal(await dispatchFetch("/manifest.webmanifest"), fresh);
});

test("manifest retains a cached fallback offline", async (t) => {
  const cached = new Response(JSON.stringify({ name: "Pi Web" }));
  t.mock.method(globalThis, "fetch", async () => { throw new Error("offline"); });
  t.mock.method(caches, "match", async () => cached);
  assert.equal(await dispatchFetch("/manifest.webmanifest"), cached);
});

function dispatchNotificationClick(data) {
  let pending;
  let closed = false;
  listeners.get("notificationclick")({
    notification: {
      data,
      close: () => { closed = true; },
    },
    waitUntil: (promise) => { pending = promise; },
  });
  return { pending, wasClosed: () => closed };
}

function dispatchPush(payload, clients) {
  let pending;
  const shown = [];
  self.clients = {
    matchAll: async () => clients,
    openWindow: async () => assert.fail("push must not open windows"),
  };
  self.registration = {
    showNotification: async (title, options) => { shown.push({ title, options }); },
  };
  listeners.get("push")({
    data: { json: () => payload },
    waitUntil: (promise) => { pending = promise; },
  });
  return { pending, shown };
}

test("push shows a notification when no window is visible", async () => {
  const event = dispatchPush(
    {
      title: "Session complete",
      body: "Task finished.",
      url: "/?session=session-1",
      tag: "pi-session-complete:session-1",
    },
    [{ url: "https://pi.test/?session=other", visibilityState: "hidden" }],
  );
  await event.pending;

  assert.deepEqual(event.shown, [{
    title: "Session complete",
    options: {
      body: "Task finished.",
      data: { url: "/?session=session-1" },
      tag: "pi-session-complete:session-1",
      renotify: true,
    },
  }]);
});

test("push skips the system notification when a window is visible", async () => {
  const event = dispatchPush(
    { title: "Session complete", body: "Task finished.", url: "/?session=session-1" },
    [
      { url: "https://pi.test/?session=other", visibilityState: "hidden" },
      { url: "https://pi.test/?session=session-1", visibilityState: "visible" },
    ],
  );
  await event.pending;

  assert.deepEqual(event.shown, []);
});

test("push ignores malformed payloads", async () => {
  const event = dispatchPush(
    { title: "", body: 42 },
    [],
  );
  await event.pending;

  assert.deepEqual(event.shown, []);
});

test("notification click focuses an existing client at the session URL", async () => {
  const calls = [];
  const focusedClient = {
    url: "https://pi.test/?session=session-1",
    focus: async () => { calls.push("focus"); },
    navigate: async () => assert.fail("exact client should not navigate"),
  };
  self.clients = {
    matchAll: async () => [focusedClient],
    openWindow: async () => assert.fail("existing client should be reused"),
  };

  const event = dispatchNotificationClick({ url: "/?session=session-1" });
  await event.pending;

  assert.equal(event.wasClosed(), true);
  assert.deepEqual(calls, ["focus"]);
});

test("notification click navigates an existing client to the session", async () => {
  const calls = [];
  const navigatedClient = {
    focus: async () => { calls.push("focus"); },
  };
  const existingClient = {
    url: "https://pi.test/?session=other-session",
    navigate: async (url) => {
      calls.push(["navigate", url]);
      return navigatedClient;
    },
    focus: async () => assert.fail("the navigated client should be focused"),
  };
  self.clients = {
    matchAll: async () => [existingClient],
    openWindow: async () => assert.fail("existing client should be reused"),
  };

  const event = dispatchNotificationClick({ url: "/?session=session-1" });
  await event.pending;

  assert.deepEqual(calls, [
    ["navigate", "https://pi.test/?session=session-1"],
    "focus",
  ]);
});

test("notification click opens a window and rejects cross-origin targets", async () => {
  const opened = [];
  self.clients = {
    matchAll: async () => [],
    openWindow: async (url) => { opened.push(url); },
  };

  const event = dispatchNotificationClick({ url: "https://example.com/redirect" });
  await event.pending;

  assert.deepEqual(opened, ["https://pi.test/"]);
});
