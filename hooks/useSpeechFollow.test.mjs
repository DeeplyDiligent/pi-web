import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const shimPath = fileURLToPath(new URL("./__fixtures__/react-hook-shim.mjs", import.meta.url));
const jiti = createJiti(import.meta.url, { tsconfigPaths: true, alias: { react: shimPath } });
const { renderHook } = await import(shimPath);
const { useSpeechFollow } = await jiti.import("./useSpeechFollow.ts");
const { createSpeechProgressStore } = await jiti.import("../lib/speech-follow.ts");

test("speech follows the matching response in its own scroller and ignores stopped speech", () => {
  const text = "one two three four five six seven eight nine ten";
  let scroll = 0;
  const node = { data: text, length: text.length, parentElement: { closest: (selector) => selector === ".markdown-body" ? {} : null } };
  const root = { dataset: { speechResponseKey: "session:answer" }, contains: (candidate) => candidate === node };
  const container = {
    querySelectorAll: () => [root],
    get scrollTop() { return scroll; },
    set scrollTop(value) { scroll = Math.max(0, value); },
    getBoundingClientRect: () => ({ top: 100, bottom: 300, height: 200 }),
  };
  globalThis.NodeFilter = { SHOW_TEXT: 4 };
  globalThis.document = {
    createTreeWalker() {
      let visited = false;
      return { currentNode: node, nextNode() { if (visited) return false; visited = true; return true; } };
    },
    createRange() {
      let start = 0;
      return {
        setStart(_node, offset) { assert.equal(_node, node); start = offset; },
        setEnd(_node) { assert.equal(_node, node); },
        getBoundingClientRect: () => ({ top: 100 + start * 10 - scroll, bottom: 120 + start * 10 - scroll, height: 20 }),
      };
    },
  };
  const ref = { current: container };
  const progress = (charIndex, key = "session:answer") => ({ text, charIndex, key });
  const store = createSpeechProgressStore();
  store.set(progress(0));
  const hook = renderHook(() => useSpeechFollow(store, ref, "view"));
  assert.equal(scroll, 0);
  // Boundary events scroll without re-rendering the hook or the transcript.
  store.set(progress(text.indexOf("nine")));
  assert.ok(scroll > 0);
  const followed = scroll;
  store.set(null);
  assert.equal(scroll, followed);
  store.set(progress(0, "different-session:answer"));
  assert.equal(scroll, followed);
  hook.unmount();
  store.set(progress(0));
  assert.equal(scroll, followed, "unmount removes the speech subscription");
  delete globalThis.NodeFilter;
  delete globalThis.document;
});
