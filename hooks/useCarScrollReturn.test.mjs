import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const shimPath = fileURLToPath(new URL("./__fixtures__/react-hook-shim.mjs", import.meta.url));
const jiti = createJiti(import.meta.url, { tsconfigPaths: true, alias: { react: shimPath } });
const { renderHook } = await import(shimPath);
const { useCarScrollReturn } = await jiti.import("./useCarScrollReturn.ts");

function fixture() {
  const listeners = new Map();
  const container = { scrollTop: 600, scrollHeight: 2000, clientHeight: 300, getBoundingClientRect: () => ({ top: 100 }),
    addEventListener(name, fn) { listeners.set(name, fn); }, removeEventListener(name) { listeners.delete(name); } };
  const anchor = { dataset: { messageKey: "answer-1" }, offset: 700,
    getBoundingClientRect() { return { top: 100 + this.offset - container.scrollTop, bottom: 160 + this.offset - container.scrollTop }; } };
  container.querySelectorAll = () => [anchor];
  return { container, anchor, listeners, ref: { current: container } };
}

test("car exit returns normal chat to its saved anchor, not to the top", () => {
  const { container, anchor, listeners, ref } = fixture();
  const hook = renderHook((p) => useCarScrollReturn(p.car, ref, p.session, p.version), { car: false, session: "one", version: 1 });
  container.scrollTop = 650;
  listeners.get("scroll")();
  hook.rerender({ car: true, session: "one", version: 1 });
  assert.equal(listeners.size, 0, "hidden normal chat cannot overwrite the saved location");
  container.scrollTop = 0;
  container.scrollHeight += 500;
  anchor.offset += 500;
  hook.rerender({ car: true, session: "one", version: 2 });
  hook.rerender({ car: false, session: "one", version: 2 });
  assert.equal(container.scrollTop, 1150);
  hook.unmount();
  assert.equal(listeners.size, 0);
});

test("a new chat created in car mode does not restore the previous chat's position", () => {
  const { container, ref } = fixture();
  const hook = renderHook((p) => useCarScrollReturn(p.car, ref, p.session, p.version), { car: false, session: "one", version: 1 });
  hook.rerender({ car: true, session: "one", version: 1 });
  hook.rerender({ car: true, session: "two", version: 2 });
  container.scrollTop = 0;
  hook.rerender({ car: false, session: "two", version: 2 });
  assert.equal(container.scrollTop, container.scrollHeight);
  hook.unmount();
});
