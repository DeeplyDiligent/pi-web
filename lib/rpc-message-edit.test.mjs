import assert from "node:assert/strict";
import test from "node:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { AgentSessionWrapper } = await jiti.import("./rpc-manager.ts");

function fixture({ root = false, abort, navigate } = {}) {
  const manager = SessionManager.inMemory("/test");
  if (!root) manager.appendCustomEntry("fixture", {});
  const parent = manager.getLeafId();
  const message = { role: "user", content: [{ type: "text", text: "edit me" }, { type: "image", data: "aGVsbG8=", mimeType: "image/png" }], timestamp: 123 };
  manager.appendMessage(message);
  const id = manager.getLeafId();
  const calls = [];
  const inner = {
    sessionId: manager.getSessionId(), sessionManager: manager,
    isStreaming: true, isCompacting: false, isBashRunning: true,
    extensionRunner: {}, agent: { state: { messages: [message] } },
    clearQueue() { calls.push("clear_queue"); return { steering: [], followUp: [] }; },
    abortBash() { calls.push("abort_bash"); inner.isBashRunning = false; },
    async abort() { calls.push("abort"); await abort?.(); inner.isStreaming = false; },
    async navigateTree(target) { calls.push("navigate"); assert.equal(target, id); return navigate ? navigate() : { cancelled: false }; },
    dispose() {},
  };
  const wrapper = new AgentSessionWrapper(inner);
  return { wrapper, inner, manager, parent, message, id, calls };
}

test("edit waits for abort, rejects concurrent prompts, then rewinds without deleting history", async () => {
  const stopping = Promise.withResolvers();
  const f = fixture({ abort: () => stopping.promise });
  try {
    const editing = f.wrapper.send({ type: "edit_message", entryId: f.id });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(f.calls, ["clear_queue", "abort_bash", "abort"]);
    await assert.rejects(f.wrapper.send({ type: "prompt", message: "racing prompt" }), /being prepared for editing/);
    await assert.rejects(f.wrapper.send({ type: "fork_branch", entryId: f.id }), /being prepared for editing/);
    stopping.resolve();
    const result = await editing;
    assert.equal(result.cancelled, false);
    assert.equal(result.leafId, f.parent);
    assert.deepEqual(result.message, f.message);
    assert.equal(f.manager.getLeafId(), f.parent);
    assert.ok(f.manager.getEntry(f.id), "old user entry is preserved as a branch");
    assert.deepEqual(f.inner.agent.state.messages, []);
    assert.deepEqual(f.calls, ["clear_queue", "abort_bash", "abort", "clear_queue", "navigate"]);
  } finally { stopping.resolve(); f.wrapper.destroy(); }
});

test("the first user message can be edited even when it is still the SDK leaf", async () => {
  const f = fixture({ root: true });
  try {
    const result = await f.wrapper.send({ type: "edit_message", entryId: f.id });
    assert.equal(result.leafId, null);
    assert.equal(f.manager.getLeafId(), null);
    assert.deepEqual(f.inner.agent.state.messages, []);
    assert.deepEqual(result.message.content, f.message.content);
  } finally { f.wrapper.destroy(); }
});

test("optimistic last-message editing resolves the live user entry but refuses stale text", async () => {
  const f = fixture();
  try {
    await assert.rejects(f.wrapper.send({ type: "edit_message", expectedText: "different message" }), /latest message changed/);
    assert.deepEqual(f.calls, []);
    const result = await f.wrapper.send({ type: "edit_message", expectedText: "edit me" });
    assert.equal(result.leafId, f.parent);
    assert.deepEqual(result.message, f.message);
  } finally { f.wrapper.destroy(); }
});

test("failed abort or extension-cancelled navigation does not rewind the branch", async () => {
  for (const options of [
    { abort: () => { throw new Error("stop failed"); } },
    { navigate: () => ({ cancelled: true }) },
  ]) {
    const f = fixture(options);
    try {
      if (options.abort) await assert.rejects(f.wrapper.send({ type: "edit_message", entryId: f.id }), /stop failed/);
      else assert.deepEqual(await f.wrapper.send({ type: "edit_message", entryId: f.id }), { cancelled: true });
      assert.equal(f.manager.getLeafId(), f.id);
      assert.deepEqual(f.inner.agent.state.messages, [f.message]);
    } finally { f.wrapper.destroy(); }
  }
});
