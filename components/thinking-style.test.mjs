import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("thinking markdown opts into secondary typography without changing answers", () => {
  const source = readFileSync(new URL("./MessageView.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /<SafeMarkdownBody className="markdown-thinking"[^>]*>[\s\S]*?block\.thinking/);
  assert.equal((source.match(/className="markdown-thinking"/g) ?? []).length, 1);
  assert.match(css, /\.markdown-body\.markdown-thinking\s*\{[^}]*font-size: 12px;[^}]*color: var\(--text-muted\);/);
  assert.match(css, /\.markdown-body\.markdown-thinking li::marker\s*\{\s*color: inherit;/);
});
