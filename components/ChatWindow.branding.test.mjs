import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
const branding = source.slice(source.indexOf("{isEmptyNew && ("), source.indexOf("{chatInputElement}"));

test("new-chat branding uses the runtime blue/work icon without optimizer caching", () => {
  assert.match(branding, /<Image src="\/app-icons\/apple-touch-icon\.png" width=\{32\} height=\{32\} alt="" priority unoptimized/);
  assert.doesNotMatch(branding, /src="\/icons\/apple-touch-icon\.png"/);
});

test("new-chat branding aligns with the fork's mobile and desktop composer gutters", () => {
  assert.match(branding, /paddingLeft: isMobile \? 8 : 16, paddingRight: isMobile \? 8 : 52/);
  assert.match(branding, /maxWidth: "var\(--chat-content-max-width, 820px\)", margin: "0 auto"/);
  assert.match(branding, /alignItems: "center", gap: isMobile \? 7 : 10/);
});
