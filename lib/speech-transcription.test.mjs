import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("./speech-transcription.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});

function fixture() {
  let now = 0;
  const timers = new Set();
  const stopped = Promise.withResolvers();
  const sdk = {
    settings: {}, appended: 0, disposed: 0,
    async start() {},
    async append() { this.appended++; },
    async *getStream() {
      yield { content: [{ text: "Before the pause. " }], is_final: true };
      await stopped.promise;
      yield { content: [{ text: "After the pause." }], is_final: true };
    },
    async stop() { stopped.resolve(); },
    async dispose() { this.disposed++; stopped.resolve(); },
  };
  const exports = {};
  runInNewContext(outputText, {
    exports, process, Uint8Array,
    require: (id) => id === "server-only" ? {} : require(id),
    __piSpeechModelPromise: Promise.resolve({
      createAudioClient: () => ({ createLiveTranscriptionSession: () => sdk }),
    }),
    setTimeout(callback, delay) {
      const timer = {
        due: now + delay, callback,
        refresh() { this.due = now + delay; timers.add(this); return this; },
      };
      timers.add(timer);
      return timer;
    },
    clearTimeout: (timer) => timers.delete(timer),
  });
  return {
    api: exports, sdk, timers,
    async tick(ms) {
      now += ms;
      for (const timer of [...timers]) {
        if (timer.due <= now) { timers.delete(timer); timer.callback(); }
      }
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

test("silent PCM uploads keep dictation alive beyond both former duration limits", async () => {
  const f = fixture();
  const id = await f.api.createLiveSpeechSession();
  const events = [];
  f.api.subscribeLiveSpeechSession(id, (event) => events.push(event));
  // Thirty minutes, including silence: only the arrival of PCM matters.
  for (let minute = 0; minute < 30; minute++) {
    await f.tick(60_000);
    await f.api.appendLiveSpeechAudio(id, new Uint8Array(8_000));
    assert.equal(f.sdk.disposed, 0);
    assert.equal(f.timers.size, 1, "renew the lease without accumulating timers");
  }
  assert.equal(f.sdk.appended, 30);
  const text = await f.api.finishLiveSpeechSession(id);
  assert.equal(text, "Before the pause. After the pause.");
  assert.equal(events.at(-1).type, "final");
  assert.equal(events.at(-1).text, text);
  assert.equal(f.sdk.disposed, 1);
  assert.equal(f.timers.size, 0);
});

test("abandoned sessions expire after the last upload, not creation", async () => {
  const f = fixture();
  const id = await f.api.createLiveSpeechSession();
  await f.tick(120_000);
  await f.api.appendLiveSpeechAudio(id, new Uint8Array(2));
  await f.tick(179_999);
  assert.equal(f.sdk.disposed, 0);
  await f.tick(1);
  assert.equal(f.sdk.disposed, 1);
  assert.throws(() => f.api.subscribeLiveSpeechSession(id, () => {}), /expired/);
});

test("invalid audio does not renew an abandoned session", async () => {
  const f = fixture();
  const id = await f.api.createLiveSpeechSession();
  await f.tick(120_000);
  await assert.rejects(f.api.appendLiveSpeechAudio(id, new Uint8Array(1)), /Invalid PCM/);
  await f.tick(60_000);
  assert.equal(f.sdk.disposed, 1);
});

test("explicit finish owns cleanup even if final draining takes longer than the idle lease", async () => {
  const f = fixture();
  const id = await f.api.createLiveSpeechSession();
  const gate = Promise.withResolvers();
  const stop = f.sdk.stop;
  f.sdk.stop = async () => { await gate.promise; await stop(); };
  const finishing = f.api.finishLiveSpeechSession(id);
  assert.equal(f.timers.size, 0);
  await f.tick(240_000);
  assert.equal(f.sdk.disposed, 0);
  await assert.rejects(f.api.appendLiveSpeechAudio(id, new Uint8Array(2)), /finishing/);
  gate.resolve();
  assert.equal(await finishing, "Before the pause. After the pause.");
  assert.equal(f.sdk.disposed, 1);
});

test("explicit cancellation releases the SDK and idle lease", async () => {
  const f = fixture();
  const id = await f.api.createLiveSpeechSession();
  await f.api.cancelLiveSpeechSession(id);
  assert.equal(f.sdk.disposed, 1);
  assert.equal(f.timers.size, 0);
});

test("composer has no elapsed-time recording cutoff", () => {
  const composer = readFileSync(new URL("../components/ChatInput.tsx", import.meta.url), "utf8");
  const recorder = readFileSync(new URL("./speech-recorder.ts", import.meta.url), "utf8");
  assert.doesNotMatch(composer + recorder, /MAX_SPEECH_RECORDING_MS|speechTimeoutRef/);
  const start = composer.slice(composer.indexOf("const startSpeechRecording ="), composer.indexOf("const cancelSpeechRecording ="));
  assert.doesNotMatch(start, /setTimeout/);
  assert.match(start, /activeRecorder\.takePcm\(\)\.pcm/);
});
