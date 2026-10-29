import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const shimPath = fileURLToPath(new URL("./__fixtures__/react-hook-shim.mjs", import.meta.url));
const jiti = createJiti(import.meta.url, { tsconfigPaths: true, alias: { react: shimPath } });
const { renderHook, useState } = await import(shimPath);
const { useAllCarHistory } = await jiti.import("./useAllCarHistory.ts");
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
test.beforeEach(() => { globalThis.window = new EventTarget(); });
test.afterEach(() => { delete globalThis.window; });

test("car mode automatically fetches every page without any load-more action", async () => {
  const calls = [];
  const busyRef = { current: false };
  let commit;
  const pages = { p3: { oldestEntryId: "p2", hasMore: true }, p2: { oldestEntryId: "p1", hasMore: true }, p1: { oldestEntryId: "root", hasMore: false } };
  const loadPage = async (before, signal) => {
    calls.push(before);
    assert.equal(signal.aborted, false);
    const page = pages[before];
    commit({ cursor: page.oldestEntryId, hasMore: page.hasMore });
    return page;
  };
  const hook = renderHook(() => {
    const [history, setHistory] = useState({ cursor: "p3", hasMore: true });
    commit = setHistory;
    return useAllCarHistory({ ...history, enabled: true, sessionId: "one", leafId: null, busyRef, loadPage });
  });
  for (let i = 0; i < 50; i++) {
    await tick(); hook.flush();
    if (calls.length === 3 && !hook.result.loading) break;
  }
  assert.deepEqual(calls, ["p3", "p2", "p1"]);
  assert.equal(hook.result.loading, false);
  assert.equal(hook.result.error, false);
  await tick(); // The final aborted effect releases its lock in its async finally.
  assert.equal(busyRef.current, false);
  hook.unmount();
});

test("leaving car mode cancels an outstanding history request", async () => {
  const response = Promise.withResolvers();
  const busyRef = { current: false };
  let signal;
  const hook = renderHook((p) => useAllCarHistory({ enabled: p.enabled, sessionId: "one", leafId: null, cursor: "before", hasMore: true,
    busyRef, loadPage: p.loadPage }), { enabled: true, loadPage: async (_before, requestSignal) => { signal = requestSignal; return response.promise; } });
  assert.equal(busyRef.current, true);
  hook.unmount();
  assert.equal(signal.aborted, true);
  response.resolve({ oldestEntryId: "older", hasMore: true });
  await tick();
  assert.equal(busyRef.current, false);
});

test("pagination waits for normal-history work instead of requesting the same page concurrently", async () => {
  const busyRef = { current: true };
  let calls = 0;
  const loadPage = async () => { calls++; return { oldestEntryId: "root", hasMore: false }; };
  const hook = renderHook(() => useAllCarHistory({ enabled: true, sessionId: "one", leafId: null, cursor: "before", hasMore: true,
    busyRef, loadPage }));
  assert.equal(calls, 0);
  busyRef.current = false;
  for (let i = 0; i < 10 && !calls; i++) await tick();
  hook.flush();
  assert.equal(calls, 1);
  assert.equal(hook.result.loading, false);
  hook.unmount();
});

test("a non-advancing cursor fails visibly rather than looping forever", async () => {
  let calls = 0;
  const loadPage = async () => { calls++; return { oldestEntryId: "before", hasMore: true }; };
  const busyRef = { current: false };
  const hook = renderHook(() => useAllCarHistory({ enabled: true, sessionId: "one", leafId: null, cursor: "before", hasMore: true,
    busyRef, loadPage }));
  await tick(); hook.flush();
  assert.equal(calls, 1);
  assert.equal(hook.result.error, true);
  assert.equal(hook.result.loading, false);
  hook.unmount();
});
