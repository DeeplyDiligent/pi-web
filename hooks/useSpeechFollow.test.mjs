import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const shimPath = fileURLToPath(new URL("./__fixtures__/react-hook-shim.mjs", import.meta.url));
const jiti = createJiti(import.meta.url, { tsconfigPaths: true, alias: { react: shimPath } });
const { renderHook } = await import(shimPath);
const { useSpeechFollow } = await jiti.import("./useSpeechFollow.ts");
const { createSpeechProgressStore } = await jiti.import("../lib/speech-follow.ts");

function fixture(t) {
  const text = "one two three four five six seven eight nine ten";
  let scroll = 0;
  const elements = text.split(" ").map(() => {
    const attributes = new Set();
    return { attributes, setAttribute(name) { attributes.add(name); }, removeAttribute(name) { attributes.delete(name); } };
  });
  const nodes = text.split(" ").map((data, index) => ({ data, length: data.length, index,
    parentElement: { closest: (selector) => selector === ".markdown-body" ? {} : selector === "[data-speech-word]" ? elements[index] : null },
  }));
  const root = { dataset: { speechResponseKey: "session:answer" }, contains: (candidate) => nodes.includes(candidate) };
  const container = {
    querySelectorAll: () => [root],
    get scrollTop() { return scroll; },
    set scrollTop(value) { scroll = Math.max(0, value); },
    getBoundingClientRect: () => ({ top: 100, bottom: 300, height: 200 }),
  };
  const originalDocument = globalThis.document;
  const originalNodeFilter = globalThis.NodeFilter;
  globalThis.NodeFilter = { SHOW_TEXT: 4 };
  globalThis.document = {
    createTreeWalker() {
      let index = -1;
      return { get currentNode() { return nodes[index]; }, nextNode() { return ++index < nodes.length; } };
    },
    createRange() {
      let index = 0;
      return {
        setStart(node) { index = node.index; },
        setEnd() {},
        getBoundingClientRect: () => ({ top: 100 + index * 50 - scroll, bottom: 120 + index * 50 - scroll, height: 20 }),
      };
    },
  };
  t.after(() => {
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
    if (originalNodeFilter === undefined) delete globalThis.NodeFilter; else globalThis.NodeFilter = originalNodeFilter;
  });
  const store = createSpeechProgressStore();
  const progress = (word, key = "session:answer") => ({ text, charIndex: text.indexOf(word), key });
  return { text, nodes, elements, store, progress, ref: { current: container }, scroll: () => scroll,
    highlighted: () => elements.flatMap((element, index) => element.attributes.has("data-speech-current-word") ? [nodes[index].data] : []),
  };
}

test("car speech follows and bolds only the current word, without rendering or splitting text", (t) => {
  const f = fixture(t);
  f.store.set(f.progress("one"));
  let renders = 0;
  const hook = renderHook(() => { renders++; useSpeechFollow(f.store, f.ref, "view"); });
  t.after(() => hook.unmount());
  assert.equal(f.scroll(), 0);
  assert.deepEqual(f.highlighted(), ["one"]);
  f.store.set(f.progress("nine"));
  assert.ok(f.scroll() > 0);
  assert.deepEqual(f.highlighted(), ["nine"]);
  assert.equal(renders, 1, "word boundaries do not re-render the transcript");
  assert.equal(f.nodes.map((node) => node.data).join(" "), f.text, "React-owned text stays intact");
  const followed = f.scroll();
  f.store.set(null);
  assert.deepEqual(f.highlighted(), []);
  assert.equal(f.scroll(), followed);
  f.store.set(f.progress("one", "different-session:answer"));
  assert.deepEqual(f.highlighted(), []);
  assert.equal(f.scroll(), followed);
  f.store.set(f.progress("one"));
  assert.deepEqual(f.highlighted(), ["one"]);
  hook.unmount();
  assert.deepEqual(f.highlighted(), []);
  const stopped = f.scroll();
  f.store.set(f.progress("ten"));
  assert.equal(f.scroll(), stopped, "unmount removes the speech subscription");
});

test("normal mode never follows speech, and leaving car mode clears the highlight and subscription", (t) => {
  const f = fixture(t);
  let carMode = false;
  f.store.set(f.progress("nine"));
  const hook = renderHook(() => useSpeechFollow(carMode ? f.store : null, f.ref, "view"));
  t.after(() => hook.unmount());
  assert.equal(f.scroll(), 0);
  assert.deepEqual(f.highlighted(), []);
  f.store.set(f.progress("ten"));
  assert.equal(f.scroll(), 0);
  carMode = true;
  hook.rerender();
  assert.ok(f.scroll() > 0);
  assert.deepEqual(f.highlighted(), ["ten"]);
  carMode = false;
  hook.rerender();
  assert.deepEqual(f.highlighted(), []);
  const stopped = f.scroll();
  f.store.set(f.progress("one"));
  assert.equal(f.scroll(), stopped);
});

test("unmatched speech and a missing container clear the last highlighted word", (t) => {
  const f = fixture(t);
  f.store.set(f.progress("one"));
  const hook = renderHook(() => useSpeechFollow(f.store, f.ref, "view"));
  t.after(() => hook.unmount());
  f.store.set({ key: "session:answer", text: "Unmatched vocabulary", charIndex: 0 });
  assert.deepEqual(f.highlighted(), []);
  f.store.set(f.progress("two"));
  assert.deepEqual(f.highlighted(), ["two"]);
  f.ref.current = null;
  f.store.set(f.progress("three"));
  assert.deepEqual(f.highlighted(), []);
});
