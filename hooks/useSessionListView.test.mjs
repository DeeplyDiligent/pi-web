import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Script } from "node:vm";
import ts from "typescript";

function fixture({ initial = "projects", blocked = false, server = false } = {}) {
  const events = new Map();
  const callbacks = [];
  let stored = initial;
  const context = {
    exports: {},
    ...(!server && { window: {
      localStorage: {
        getItem() { if (blocked) throw new Error("blocked"); return stored; },
        setItem(_key, value) { if (blocked) throw new Error("blocked"); stored = value; },
      },
      addEventListener(key, fn) { events.set(key, fn); },
      removeEventListener(key) { events.delete(key); },
    } }),
  };
  function run(file) {
    context.exports = {};
    new Script(ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    }).outputText).runInNewContext(context);
    return context.exports;
  }
  const prefs = run("../lib/sidebar-prefs.ts");
  context.require = (id) => {
    if (id === "@/lib/sidebar-prefs") return prefs;
    if (id === "react") return { useSyncExternalStore(subscribe, snapshot, serverSnapshot) {
      callbacks.push(subscribe);
      return server ? serverSnapshot() : snapshot();
    } };
    throw new Error(id);
  };
  const hook = run("./useSessionListView.ts");
  return { ...hook, events, callbacks, setStored(value) { stored = value; }, getStored() { return stored; } };
}

test("SSR stays grouped while the browser restores classic view", () => {
  assert.equal(fixture({ server: true }).useSessionListView(), "projects");
  assert.equal(fixture({ initial: "chronological" }).useSessionListView(), "chronological");
});

test("Settings changes notify the sidebar immediately and save the view", () => {
  const store = fixture();
  store.useSessionListView();
  let notified = 0;
  const stop = store.callbacks[0](() => notified++);
  store.setSessionListView("chronological");
  assert.equal(store.useSessionListView(), "chronological");
  assert.equal(store.getStored(), "chronological");
  assert.equal(notified, 1);
  store.setStored("projects");
  store.events.get("storage")({ key: "pi-web:session-list-view" });
  assert.equal(store.useSessionListView(), "projects");
  assert.equal(notified, 2);
  stop();
  assert.equal(store.events.size, 0);
});

test("blocked storage still allows changing the view", () => {
  const store = fixture({ blocked: true });
  assert.equal(store.useSessionListView(), "projects");
  store.setSessionListView("chronological");
  assert.equal(store.useSessionListView(), "chronological");
});
