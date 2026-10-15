import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
const branding = source.slice(source.indexOf("{isEmptyNew && ("), source.indexOf("{chatInputElement}"));

test("new-chat branding uses the runtime blue/work icon without optimizer caching", () => {
  assert.match(branding, /<Image src="\/app-icons\/apple-touch-icon\.png" width=\{40\} height=\{40\} alt="" priority unoptimized/);
  assert.doesNotMatch(branding, /src="\/icons\/apple-touch-icon\.png"/);
});

test("new-chat branding uses the upstream header layout and composer width", () => {
  assert.match(branding, /paddingLeft: 16, paddingRight: isMobile \? 16 : 52/);
  assert.match(branding, /className="new-session-hero-inner" style=\{\{ maxWidth: "var\(--chat-content-max-width, 820px\)"/);
  assert.match(branding, /className="new-session-brand"/);
});
