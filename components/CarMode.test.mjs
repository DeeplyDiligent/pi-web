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

test("new-chat opens the same chooser, stops playback and waits for transcription", async () => {
  const ast = ts.createSourceFile("AppShell.tsx", shell, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function find(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "requestNewSession") return node.initializer.arguments[0];
    return ts.forEachChild(node, find);
  }
  const callback = ts.transpileModule(find(ast).getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText.trim().replace(/;$/, "");
  const pending = [];
  const generation = { current: 0 };
  const state = { open: false, preparing: false, stopped: 0 };
  const request = new Script(`(${callback})`).runInNewContext({ Promise,
    stopSpeaking() { state.stopped++; }, newThreadPreparationRef: generation,
    setMobileToolbarMoreOpen() {}, setNewThreadDialogOpen(value) { state.open = value; }, setNewThreadPreparing(value) { state.preparing = value; },
    chatInputRef: { current: { pauseSpeechRecording() { const result = Promise.withResolvers(); pending.push(result); return result.promise; } } },
  });
  request();
  assert.equal(state.open, true);
  assert.equal(state.preparing, true);
  assert.equal(state.stopped, 1);
  pending[0].resolve();
  await new Promise(setImmediate);
  assert.equal(state.preparing, false);
  request();
  generation.current++; // Cancel closes the chooser and invalidates its pending readiness callback.
  state.open = false;
  state.preparing = false;
  pending[1].resolve();
  await new Promise(setImmediate);
  assert.equal(state.open, false);
  assert.equal(state.preparing, false);
  assert.match(shell, /autoReadEnabled=\{autoReadEnabled && !newThreadDialogOpen\}/);
});

test("navigation pause waits through microphone startup and final transcription", async () => {
  const ast = ts.createSourceFile("ChatInput.tsx", input, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function find(node) {
    if (ts.isBinaryExpression(node) && node.left.getText(ast) === "pauseSpeechRecordingRef.current") return node.right;
    return ts.forEachChild(node, find);
  }
  const callback = ts.transpileModule(find(ast).getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText.trim().replace(/;$/, "");
  for (const speechStatus of ["idle", "starting", "recording", "transcribing"]) {
    const waiters = { current: [] };
    const stop = { current: false };
    const send = { current: true };
    let finishes = 0;
    const pause = new Script(`(${callback})`).runInNewContext({ Promise, speechStatus, speechIdleWaitersRef: waiters,
      speechStopRequestedRef: stop, speechSendRequestedRef: send, finishSpeechRecording() { finishes++; } });
    let settled = false;
    const result = pause().then(() => { settled = true; });
    await Promise.resolve();
    assert.equal(settled, speechStatus === "idle");
    if (speechStatus !== "idle") {
      assert.equal(stop.current, true);
      assert.equal(send.current, false, "new-chat never submits the old draft");
      assert.equal(finishes, speechStatus === "recording" ? 1 : 0);
      waiters.current.splice(0).forEach((resolve) => resolve());
    }
    await result;
    assert.equal(settled, true);
  }
  assert.match(input, /insertSpeechTranscript\(value, speechRangeRef.current, liveText\)/);
  assert.match(input, /const start = carMode \? valueRef.current.length/);
});

test("car view keeps extension dialogs and the same voice handoff", () => {
  assert.doesNotMatch(chat, /Set up before driving|Keep your attention on the road|car-safety-note/);
  assert.doesNotMatch(css, /car-safety-note/);
  assert.match(chat, /<ExtensionDialog/);
  assert.match(chat, /<ExtensionCustomPanel/);
  assert.match(chat, /carMode=\{carMode\}/);
  assert.match(chat, /autoReadEnabledRef\.current\) chatInputRef\?\.current\?\.startSpeechRecording\(\)/);
  assert.match(chat, /<CarConversation[\s\S]*?messages=\{messages\}[\s\S]*?loadingHistory=\{carHistory.loading\}/);
  assert.match(chat, /useAllCarHistory\(/);
  assert.match(chat, /useCarScrollReturn\(carMode, scrollContainerRef/);
  assert.match(chat, /inert=\{carMode\}/);
  assert.match(chat, /useSpeechFollow\(speechProgress, carMode \? carConversationRef : scrollContainerRef, messages\)/);
});
