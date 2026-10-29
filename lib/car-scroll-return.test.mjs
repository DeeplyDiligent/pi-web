import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { captureCarReturnPosition, restoreCarReturnPosition } = await jiti.import("./car-scroll-return.ts");

function fixture() {
  const container = { scrollTop: 600, scrollHeight: 2000, clientHeight: 300, getBoundingClientRect: () => ({ top: 100 }) };
  const anchor = { dataset: { messageKey: "answer-1" }, offset: 700,
    getBoundingClientRect() { return { top: 100 + this.offset - container.scrollTop, bottom: 160 + this.offset - container.scrollTop }; } };
  container.querySelectorAll = () => [anchor];
  return { container, anchor };
}

test("returning restores the same visible message after car mode prepends older Q&A", () => {
  const { container, anchor } = fixture();
  const saved = captureCarReturnPosition(container);
  assert.equal(saved.anchorOffset, 100);
  anchor.offset += 500;
  container.scrollHeight += 500;
  container.scrollTop = 0;
  restoreCarReturnPosition(container, saved);
  assert.equal(container.scrollTop, 1100);
});

test("new replies appended in car mode do not move a saved mid-conversation position", () => {
  const { container } = fixture();
  const saved = captureCarReturnPosition(container);
  container.scrollHeight += 500;
  container.scrollTop = 0;
  restoreCarReturnPosition(container, saved);
  assert.equal(container.scrollTop, 600);
});

test("a bottom-following view stays at the bottom, and a missing anchor uses the saved pixel position", () => {
  const { container } = fixture();
  container.scrollTop = 1700;
  const saved = captureCarReturnPosition(container);
  assert.equal(saved.atBottom, true);
  container.scrollHeight = 2500;
  restoreCarReturnPosition(container, saved);
  assert.equal(container.scrollTop, 2500);
  container.querySelectorAll = () => [];
  restoreCarReturnPosition(container, { atBottom: false, scrollTop: 600, anchorKey: "gone", anchorOffset: 100 });
  assert.equal(container.scrollTop, 600);
});
