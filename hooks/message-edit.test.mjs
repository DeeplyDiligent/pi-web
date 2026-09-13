import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./useAgentSession.ts", import.meta.url), "utf8");
const chat = await readFile(new URL("../components/ChatWindow.tsx", import.meta.url), "utf8");
const start = source.indexOf("  const handleEdit = useCallback");
const end = source.indexOf("  const handleLeafChange", start);
assert.ok(start > 0 && end > start);

function fixture(sendAgentCommand, loadSession = async () => {}) {
  const calls = [];
  const context = vm.createContext({
    useCallback: (fn) => fn,
    sessionIdRef: { current: "session" }, sessionHookMountedRef: { current: true },
    branchActionRef: { current: false }, promptRunIdRef: { current: 4 }, historyGenerationRef: { current: 0 },
    rpcPromptPendingRef: { current: true }, sdkAgentActiveRef: { current: true },
    optimisticUserMessageKeyRef: { current: "old" }, bashRecoveryIdRef: { current: 0 }, bashRunningRef: { current: false },
    sendAgentCommand, loadSession,
    setEditingMessage: (value) => calls.push(["editing", value]),
    cancelEventStreamGrace: () => calls.push("cancelGrace"), closeEvents: () => calls.push("closeEvents"),
    setBashRunning() {}, setPendingBash() {}, setIsCompacting() {}, setContextUsage() {}, setQueuedMessages() {},
    settleUiStage: () => calls.push("settle"), addNotice: (notice) => calls.push(["notice", notice]),
  });
  vm.runInContext(stripTypeScriptTypes(source.slice(start, end) + "\nglobalThis.edit = handleEdit;"), context);
  return { context, calls };
}

test("editing waits for server stop/navigation and fresh history before returning composer content", async () => {
  const server = Promise.withResolvers();
  const history = Promise.withResolvers();
  const message = { role: "user", content: "original" };
  const f = fixture((_sid, command) => {
    assert.equal(command.type, "edit_message");
    assert.equal(command.entryId, null);
    assert.equal(command.expectedText, "original");
    return server.promise;
  }, () => history.promise);
  const editing = f.context.edit(null, message);
  assert.deepEqual(f.calls, [["editing", true]]);
  assert.equal(await f.context.edit(null, message), null, "duplicate edit is ignored");
  server.resolve({ cancelled: false, message });
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(f.calls.includes("settle"));
  assert.equal(f.context.promptRunIdRef.current, 5);
  assert.equal(f.context.historyGenerationRef.current, 1);
  assert.equal(f.context.branchActionRef.current, true);
  history.resolve();
  assert.equal(await editing, message);
  assert.equal(f.context.branchActionRef.current, false);
});

test("failed/cancelled edits and navigation away never overwrite another composer", async () => {
  const message = { role: "user", content: "original" };
  for (const send of [async () => { throw new Error("stop failed"); }, async () => ({ cancelled: true })]) {
    const f = fixture(send);
    assert.equal(await f.context.edit("user-id", message), null);
    assert.ok(!f.calls.includes("settle"));
    assert.equal(f.context.branchActionRef.current, false);
  }
  const f = fixture(async () => ({ cancelled: false, message }), async () => { f.context.sessionHookMountedRef.current = false; });
  assert.equal(await f.context.edit("user-id", message), null);
});

test("chat applies editor content only after successful edit and offers actions during a run", () => {
  assert.match(chat, /const editable = await handleEdit\(entryId, message\);\s*if \(editable\) handleEditContent\(editable\)/);
  assert.match(chat, /onEdit=\{msg\.role === "user" && \(entryIds\[idx\] \|\| idx === lastUserIdx\)/);
  assert.doesNotMatch(chat, /onFork=\{sessionBusy|onNavigate=\{sessionBusy/);
  assert.match(chat, /showTimestamp && keyPrefix !== "process"/);
  assert.match(source, /type: "fork_branch"/);
  assert.match(source, /generation !== historyGenerationRef\.current/);
});
