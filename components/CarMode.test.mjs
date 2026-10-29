import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Script } from "node:vm";
import ts from "typescript";

const shell = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
const chat = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
const input = await readFile(new URL("./ChatInput.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/car-mode.css", import.meta.url), "utf8");

test("car mode is mobile-only and enables the shared read/listen preference", () => {
  const mobile = shell.slice(shell.indexOf('data-mobile-toolbar="true"'), shell.indexOf("{!isMobile && (", shell.indexOf('data-mobile-toolbar="true"')));
  assert.match(mobile, /\{renderCarModeButton\(\)\}\s*\{renderRefreshButton\(true\)\}/);
  assert.match(shell, /const renderCarModeButton = \(\) => \(/);
  assert.match(shell, /carMode=\{carMode && isMobile\}/);
  assert.match(shell, /setCarMode\(!carMode\)/);
  assert.match(shell, /setAutoReadEnabled\(!carMode, \{ temporary: true \}\)/);
  assert.match(shell, /onAutoReadChange=\{\(enabled\) => setAutoReadEnabled\(enabled, \{ temporary: carMode \}\)\}/);
  assert.match(shell, /onStopSpeaking=\{stopSpeaking\}/);
});

test("leaving the app exits car mode and disables speech without re-enabling it on return", () => {
  const source = ts.createSourceFile("AppShell.tsx", shell, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function findEffect(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === "useEffect" && node.arguments[0]?.getText(source).includes("const leaveCarMode")) return node.arguments[0];
    return ts.forEachChild(node, findEffect);
  }
  const callback = ts.transpileModule(findEffect(source).getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText.trim().replace(/;$/, "");
  const script = new Script(`(${callback})()`);
  const setup = (overrides = {}) => {
    const listeners = new Map();
    const calls = [];
    const events = {
      addEventListener(name, callback) { listeners.set(name, callback); },
      removeEventListener(name, callback) { assert.equal(listeners.get(name), callback); listeners.delete(name); },
    };
    const document = { ...events, hidden: false };
    const cleanup = script.runInNewContext({ carMode: true, isMobile: true, document, window: events,
      stopSpeaking: () => calls.push("stop"), setAutoReadEnabled: (value) => calls.push(["auto", value]), setCarMode: (value) => calls.push(["car", value]), ...overrides });
    return { listeners, calls, document, cleanup };
  };
  const hidden = setup();
  hidden.listeners.get("visibilitychange")();
  assert.deepEqual(hidden.calls, []);
  hidden.document.hidden = true;
  hidden.listeners.get("visibilitychange")();
  assert.deepEqual(hidden.calls, ["stop", ["auto", false], ["car", false]]);
  hidden.document.hidden = false;
  hidden.listeners.get("visibilitychange")();
  assert.equal(hidden.calls.length, 3, "return never silently enables speech");
  hidden.cleanup();
  assert.equal(hidden.listeners.size, 0);
  const pagehide = setup();
  pagehide.listeners.get("pagehide")();
  assert.deepEqual(pagehide.calls, ["stop", ["auto", false], ["car", false]]);
  pagehide.cleanup();
  const desktop = setup({ isMobile: false });
  assert.deepEqual(desktop.calls, ["stop", ["auto", false], ["car", false]]);
  assert.equal(desktop.listeners.size, 0);
  const inactive = setup({ carMode: false });
  assert.deepEqual(inactive.calls, [], "normal-mode preferences are untouched");
  assert.equal(inactive.listeners.size, 0);
});

test("simplified composer reuses recording, pause, final transcription and send", () => {
  const car = input.slice(input.indexOf("  if (carMode) {"), input.indexOf("  return (\n    <fieldset\n      disabled={builtinCommandPending}"));
  assert.match(car, /speechCommitted, speechPreview/);
  assert.match(car, /if \(recording\) void finishSpeechRecording\(\)/);
  assert.match(car, /onStopSpeaking\?\.\(\); void startSpeechRecording\(\)/);
  assert.match(car, /onClick=\{handleSpeechAwareSend\}/);
  assert.match(car, /disabled=\{busy \|\| isStreaming/);
  assert.match(input, /wasCarModeRef\.current && !carMode\) cancelSpeechRecording\(\)/);
  assert.match(css, /30dvh/);
});

test("car view keeps extension dialogs and the same voice handoff", () => {
  assert.match(chat, /<ExtensionDialog/);
  assert.match(chat, /<ExtensionCustomPanel/);
  assert.match(chat, /carMode=\{carMode\}/);
  assert.match(chat, /autoReadEnabledRef\.current\) chatInputRef\?\.current\?\.startSpeechRecording\(\)/);
  assert.match(chat, /<MarkdownBody>\{getAssistantSpeechText\(answer\)\}<\/MarkdownBody>/);
  assert.match(chat, /useSpeechFollow\(speechProgress, carMode \? carConversationRef : scrollContainerRef, messages\)/);
});
