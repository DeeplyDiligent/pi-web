import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");

test("opens the mobile chat list with a deliberate swipe from the left edge", () => {
  assert.match(source, /isMobile && !sidebarOpen[\s\S]*?data-mobile-sidebar-swipe-edge="true"/);
  assert.match(source, /onPointerDown=\{handleMobileEdgeSwipeStart\}/);
  assert.match(source, /onPointerMove=\{handleMobileEdgeSwipeMove\}/);
  assert.match(source, /deltaX < MOBILE_EDGE_SWIPE_OPEN_DISTANCE/);
  assert.match(source, /deltaX < deltaY \* 1\.25/);
  assert.match(source, /setRightPanelOpen\(false\)[\s\S]*?setSidebarOpen\(true\)/);
});

test("keeps vertical edge scrolling available and does not cover the toolbar", () => {
  assert.match(source, /top: "calc\(36px \+ env\(safe-area-inset-top\)\)"/);
  assert.match(source, /touchAction: "pan-y"/);
  assert.match(source, /event\.pointerType === "mouse"/);
  assert.match(source, /onPointerCancel=\{handleMobileEdgeSwipeEnd\}/);
});
