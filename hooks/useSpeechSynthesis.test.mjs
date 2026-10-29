import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const shimPath = fileURLToPath(new URL("./__fixtures__/react-hook-shim.mjs", import.meta.url));
const jiti = createJiti(import.meta.url, { tsconfigPaths: true, alias: { react: shimPath } });
const { renderHook } = await import(shimPath);
const { useSpeechSynthesis } = await jiti.import("./useSpeechSynthesis.ts");
let utterances;
let stored;
class Utterance { constructor(text) { this.text = text; } }
test.beforeEach(() => {
  utterances = [];
  globalThis.SpeechSynthesisUtterance = Utterance;
  globalThis.window = { SpeechSynthesisUtterance: Utterance, speechSynthesis: { cancel() {}, speak(utterance) { utterances.push(utterance); } } };
  stored = new Map();
  globalThis.localStorage = { getItem(key) { return stored.get(key) ?? null; }, setItem(key, value) { stored.set(key, value); } };
});
test.afterEach(() => { delete globalThis.window; delete globalThis.localStorage; delete globalThis.SpeechSynthesisUtterance; });

test("car auto-read is temporary, exits off and stays off after a fresh mount", () => {
  stored.set("pi-auto-read-responses", "true");
  const hook = renderHook(() => useSpeechSynthesis("en"));
  assert.equal(hook.result.autoReadEnabled, true);
  hook.result.setAutoReadEnabled(true, { temporary: true });
  hook.flush();
  assert.equal(hook.result.autoReadEnabled, true);
  assert.equal(stored.get("pi-auto-read-responses"), "false", "saved off before a phone can kill the page");
  // Reopen without any visibility/pagehide callback or explicit car-mode exit.
  const reopened = renderHook(() => useSpeechSynthesis("en"));
  assert.equal(reopened.result.autoReadEnabled, false);
  reopened.unmount();
  hook.result.setAutoReadEnabled(false, { temporary: true });
  hook.flush();
  assert.equal(hook.result.autoReadEnabled, false);
  hook.unmount();
});

test("explicit auto-read settings outside car mode still persist", () => {
  const hook = renderHook(() => useSpeechSynthesis("en"));
  hook.result.setAutoReadEnabled(true);
  hook.unmount();
  const reopened = renderHook(() => useSpeechSynthesis("en"));
  assert.equal(reopened.result.autoReadEnabled, true);
  reopened.result.setAutoReadEnabled(false);
  assert.equal(stored.get("pi-auto-read-responses"), "false");
  reopened.unmount();
});

test("temporary auto-read works when browser storage is blocked", () => {
  globalThis.localStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  const hook = renderHook(() => useSpeechSynthesis("en"));
  hook.result.setAutoReadEnabled(true, { temporary: true });
  hook.flush();
  assert.equal(hook.result.autoReadEnabled, true);
  hook.result.setAutoReadEnabled(false);
  hook.flush();
  assert.equal(hook.result.autoReadEnabled, false);
  hook.unmount();
});

test("speech reports prepared-text boundary positions and completes once", () => {
  const hook = renderHook(() => useSpeechSynthesis("en-AU"));
  let completions = 0;
  hook.result.speakResponse("**Hello** world. ".repeat(80), "response-1", () => completions++);
  hook.flush();
  assert.equal(hook.result.speechProgress.getSnapshot().charIndex, 0);
  assert.equal(hook.result.speechProgress.getSnapshot().key, "response-1");
  assert.match(hook.result.speechProgress.getSnapshot().text, /^Hello world/);
  utterances[0].onboundary({ charIndex: 6 });
  hook.flush();
  assert.equal(hook.result.speechProgress.getSnapshot().charIndex, 6);
  const firstLength = utterances[0].text.length;
  utterances[0].onend();
  hook.flush();
  assert.ok(hook.result.speechProgress.getSnapshot().charIndex > firstLength);
  assert.ok(utterances.length > 1, "chunk starts follow speech even without boundary events");
  let i = 1;
  while (i < utterances.length) utterances[i++].onend();
  hook.flush();
  assert.equal(hook.result.speechProgress.getSnapshot(), null);
  assert.equal(hook.result.speakingKey, null);
  assert.equal(completions, 1);
  hook.unmount();
});

test("cancelled, replaced and failed speech cannot move the reader or start listening", () => {
  const hook = renderHook(() => useSpeechSynthesis("en"));
  let completions = 0;
  hook.result.speakResponse("Old response.", "old", () => completions++);
  hook.flush();
  const old = utterances[0];
  hook.result.speakResponse("New response.", "new", () => completions++);
  hook.flush();
  old.onboundary({ charIndex: 4 });
  old.onend();
  hook.flush();
  assert.equal(hook.result.speechProgress.getSnapshot().key, "new");
  utterances[1].onerror();
  utterances[1].onboundary({ charIndex: 4 });
  utterances[1].onend();
  hook.flush();
  assert.equal(hook.result.speechProgress.getSnapshot(), null);
  assert.equal(completions, 0);
  hook.result.speakResponse("Cancelled.", "cancelled", () => completions++);
  hook.flush();
  hook.result.stopSpeaking();
  utterances[2].onboundary({ charIndex: 3 });
  utterances[2].onend();
  hook.flush();
  assert.equal(hook.result.speechProgress.getSnapshot(), null);
  assert.equal(completions, 0);
  hook.unmount();
});
