import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";
import test from "node:test";
import { createJiti } from "jiti";
import ts from "typescript";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true, jsx: { runtime: "automatic" } });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");
const { CarConversation } = await jiti.import("./CarConversation.tsx");
const { restoreScrollTop } = await jiti.import("@/lib/chat-lazy-load");
const source = await readFile(new URL("./CarConversation.tsx", import.meta.url), "utf8");

const messages = [
  { role: "user", content: "First question" },
  { role: "assistant", content: [{ type: "thinking", thinking: "private" }, { type: "text", text: "First answer" }] },
  { role: "user", content: "Second question" },
  { role: "assistant", content: [{ type: "text", text: "Second answer" }] },
];

test("car history renders multiple Q&A and keeps stable playback keys for every answer", () => {
  const html = renderToStaticMarkup(React.createElement(I18nProvider, null, React.createElement(CarConversation, {
    messages, messageKeys: ["q1", "a1", "q2", "a2"], sessionKey: "session", containerRef: { current: null },
    speechProgress: null, loadingHistory: false, historyError: false,
  })));
  for (const text of ["First question", "First answer", "Second question", "Second answer"]) assert.ok(html.includes(text));
  assert.ok(html.indexOf("First question") < html.indexOf("First answer"));
  assert.ok(html.indexOf("First answer") < html.indexOf("Second question"));
  assert.match(html, /data-speech-response-key="session:a1"/);
  assert.match(html, /data-speech-response-key="session:a2"/);
  assert.doesNotMatch(html, /<button|Load earlier|Load more/);
  assert.doesNotMatch(html, /private|Process details/);
});

function scrollEffect(overrides = {}) {
  const ast = ts.createSourceFile("CarConversation.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function find(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "useLayoutEffect") return node.arguments[0];
    return ts.forEachChild(node, find);
  }
  const callback = ts.transpileModule(find(ast).getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText.trim().replace(/;$/, "");
  const container = { scrollHeight: 1000, scrollTop: 100, clientHeight: 300 };
  const context = {
    containerRef: { current: container }, firstKey: "q1", lastQuestionKey: "q2",
    layoutRef: { current: { firstKey: "q1", question: "q2", distance: 900, loading: false, error: false } }, followingTailRef: { current: false },
    speechProgress: null, loadingHistory: false, historyError: false, restoreScrollTop,
    captureScrollDistance: (height, top) => height - top, ...overrides,
  };
  const apply = new Script(`(${callback})`).runInNewContext(context);
  return { context, apply, container };
}

test("scrolling back to earlier Q&A is not undone by incoming agent updates", () => {
  const { apply, container } = scrollEffect();
  apply();
  assert.equal(container.scrollTop, 100);
});

test("prepending older messages preserves the reader's position", () => {
  const { apply, container, context } = scrollEffect({ layoutRef: { current: { firstKey: "q2", question: "q2", distance: 900, loading: true, error: false } }, loadingHistory: true });
  container.scrollHeight = 1600;
  apply();
  assert.equal(container.scrollTop, 700);
  assert.equal(context.layoutRef.current.distance, 900);
});

test("entering car mode and sending a new question reveal the latest exchange", () => {
  const initial = scrollEffect({ layoutRef: { current: null } });
  initial.apply();
  assert.equal(initial.container.scrollTop, 1000);
  const next = scrollEffect({ layoutRef: { current: { firstKey: "q1", question: "q1", distance: 900, loading: false, error: false } } });
  next.apply();
  assert.equal(next.container.scrollTop, 1000);
});

test("active speech owns following instead of being forced to the very bottom", () => {
  const { apply, container } = scrollEffect({ followingTailRef: { current: true }, speechProgress: { getSnapshot: () => ({ key: "session:a1" }) } });
  apply();
  assert.equal(container.scrollTop, 100);
});
