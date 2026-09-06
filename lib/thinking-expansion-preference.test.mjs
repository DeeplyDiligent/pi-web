import assert from "node:assert/strict";
import test from "node:test";

import {
  isThinkingExpandedByDefault,
  setThinkingExpandedByDefault,
  THINKING_EXPANDED_EVENT,
} from "./thinking-expansion-preference.ts";

function installWindow() {
  const store = new Map();
  const listeners = new Set();
  const fakeWindow = {
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
    addEventListener: (_type, handler) => listeners.add(handler),
    removeEventListener: (_type, handler) => listeners.delete(handler),
    dispatchEvent: (event) => {
      for (const handler of listeners) handler(event);
      return true;
    },
  };
  globalThis.window = fakeWindow;
  return { fakeWindow, listeners };
}

test("defaults to expanded when no preference is stored", () => {
  installWindow();
  assert.equal(isThinkingExpandedByDefault(), true);
});

test("persists the preference and notifies listeners on change", () => {
  installWindow();
  let notified = 0;
  globalThis.window.addEventListener(THINKING_EXPANDED_EVENT, () => notified++);

  setThinkingExpandedByDefault(true);
  assert.equal(isThinkingExpandedByDefault(), true);
  assert.equal(notified, 1);

  setThinkingExpandedByDefault(false);
  assert.equal(isThinkingExpandedByDefault(), false);
  assert.equal(notified, 2);
});

test("defaults to expanded when window is unavailable (SSR)", () => {
  const original = globalThis.window;
  delete globalThis.window;
  try {
    assert.equal(isThinkingExpandedByDefault(), true);
  } finally {
    if (original !== undefined) globalThis.window = original;
  }
});
