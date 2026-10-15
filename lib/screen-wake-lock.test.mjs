import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { createJiti } from "jiti";

const { createScreenWakeLock, keepScreenAwake } = await createJiti(import.meta.url).import("./screen-wake-lock.ts");
const flush = () => new Promise((resolve) => setImmediate(resolve));

function fixture({ deferred = false, denied = false } = {}) {
  let visible = true;
  let listener;
  let resolve;
  let requests = 0;
  const sentinels = [];
  const manager = createScreenWakeLock({
    isVisible: () => visible,
    request: () => {
      requests++;
      if (denied) return Promise.reject(new Error("Denied"));
      const sentinel = {
        released: false,
        releases: 0,
        listener: null,
        async release() {
          this.releases++;
          this.released = true;
          this.listener?.();
        },
        addEventListener(_type, callback) { this.listener = callback; },
      };
      sentinels.push(sentinel);
      return deferred ? new Promise((done) => { resolve = () => done(sentinel); }) : Promise.resolve(sentinel);
    },
    listen: (callback) => {
      listener = callback;
      return () => { listener = undefined; };
    },
  });
  return {
    manager, sentinels,
    get requests() { return requests; },
    get listening() { return Boolean(listener); },
    resolve: () => resolve(),
    visibility(value) { visible = value; listener?.(); },
    focus() { listener?.(); },
  };
}

test("recording and playback share one lock until both finish", async () => {
  const f = fixture();
  const stopRecording = f.manager.acquire();
  const stopPlayback = f.manager.acquire();
  await flush();
  assert.equal(f.requests, 1);
  stopRecording();
  stopRecording(); // cleanup is idempotent
  assert.equal(f.sentinels[0].releases, 0);
  stopPlayback();
  assert.equal(f.sentinels[0].releases, 1);
  assert.equal(f.listening, false);
});

test("releases a request that resolves after activity stops", async () => {
  const f = fixture({ deferred: true });
  const stop = f.manager.acquire();
  stop();
  f.resolve();
  await flush();
  assert.equal(f.sentinels[0].releases, 1);
});

test("reacquires when returning to the page only while activity continues", async () => {
  const f = fixture();
  const stop = f.manager.acquire();
  await flush();
  f.visibility(false);
  assert.equal(f.sentinels[0].releases, 1);
  f.visibility(true);
  await flush();
  assert.equal(f.requests, 2);
  stop();
  f.visibility(false);
  f.visibility(true);
  assert.equal(f.requests, 2);
});

test("does not acquire while hidden and releases a pending hidden request", async () => {
  const f = fixture({ deferred: true });
  f.visibility(false);
  const stop = f.manager.acquire();
  assert.equal(f.requests, 0);
  f.visibility(true);
  f.visibility(false);
  f.resolve();
  await flush();
  assert.equal(f.sentinels[0].releases, 1);
  f.visibility(true);
  assert.equal(f.requests, 2);
  stop();
  f.resolve();
  await flush();
});

test("a new owner during a pending request keeps that lock", async () => {
  const f = fixture({ deferred: true });
  const first = f.manager.acquire();
  first();
  const second = f.manager.acquire();
  f.resolve();
  await flush();
  assert.equal(f.requests, 1);
  assert.equal(f.sentinels[0].releases, 0);
  second();
  assert.equal(f.sentinels[0].releases, 1);
});

test("OS release does not cause a retry loop; focus can retry", async () => {
  const f = fixture();
  const stop = f.manager.acquire();
  await flush();
  await f.sentinels[0].release();
  await flush();
  assert.equal(f.requests, 1);
  f.focus();
  await flush();
  assert.equal(f.requests, 2);
  stop();
});

test("permission rejection is handled without a retry loop", async () => {
  const f = fixture({ denied: true });
  const stop = f.manager.acquire();
  await flush();
  assert.equal(f.requests, 1);
  stop();
  assert.equal(f.listening, false);
});

test("unsupported browsers and server rendering are harmless", () => {
  assert.doesNotThrow(() => keepScreenAwake()());
});

test("audio lifecycles use the shared hook including startup and transcription", () => {
  const input = fs.readFileSync(new URL("../components/ChatInput.tsx", import.meta.url), "utf8");
  const speech = fs.readFileSync(new URL("../hooks/useSpeechSynthesis.ts", import.meta.url), "utf8");
  const hook = fs.readFileSync(new URL("../hooks/useScreenWakeLock.ts", import.meta.url), "utf8");
  assert.match(input, /useScreenWakeLock\(speechStatus !== "idle"\)/);
  assert.match(speech, /useScreenWakeLock\(speakingKey !== null\)/);
  assert.match(hook, /if \(active\) return keepScreenAwake\(\)/);
});
