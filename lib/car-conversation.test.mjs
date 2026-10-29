import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { getCarConversationRows } = await jiti.import("./car-conversation.ts");
const user = (content) => ({ role: "user", content });
const assistant = (...content) => ({ role: "assistant", content });
const text = (value) => ({ type: "text", text: value });
const thinking = (value) => ({ type: "thinking", thinking: value });
const tool = () => ({ type: "toolCall", toolCallId: "tool", toolName: "bash", input: { command: "secret" } });

test("car mode keeps every loaded question and final answer, not only the latest exchange", () => {
  const messages = [user("First question"), assistant(text("First answer")), user("Second question"), assistant(text("Second answer")), user("Third question"), assistant(text("Third answer"))];
  assert.deepEqual(getCarConversationRows(messages), messages.map((message, index) => ({ index, role: message.role, text: message.role === "user" ? message.content : message.content[0].text })));
});

test("tools, thinking and intermediate progress stay hidden across multiple turns", () => {
  const rows = getCarConversationRows([
    user("Question one"), assistant(text("Progress report"), tool()),
    { role: "toolResult", content: [text("secret tool output")] },
    assistant(thinking("private reasoning"), text("Answer one")),
    user([text("Question two"), { type: "image", data: "secret image", mimeType: "image/png" }]),
    assistant(text("process prefix"), tool(), text("Answer two")),
  ]);
  assert.deepEqual(rows.map((row) => row.text), ["Question one", "Answer one", "Question two", "Answer two"]);
  assert.doesNotMatch(JSON.stringify(rows), /secret|private|Progress|process prefix/);
});

test("a thinking-only final message never promotes an earlier process message to an answer", () => {
  assert.deepEqual(getCarConversationRows([user("Question"), assistant(text("Let me check"), tool()), assistant(thinking("No visible answer"))]),
    [{ index: 0, role: "user", text: "Question" }]);
});

test("compactions and subagent notifications separate turns without entering the Q&A", () => {
  const rows = getCarConversationRows([
    user("Question"), assistant(text("Answer")),
    { role: "custom", customType: "compaction", display: true, content: "compaction summary" },
    assistant(text("Follow-up")),
    { role: "custom", customType: "pi-web:subagent-notification", display: true, content: "agent internals" },
    assistant(text("Subagent follow-up")), user("Next question"),
  ]);
  assert.deepEqual(rows.map((row) => row.text), ["Question", "Answer", "Follow-up", "Subagent follow-up", "Next question"]);
});

test("an older page can complete a partial turn without duplicate or missing Q&A", () => {
  const tail = [assistant(text("Answer one")), user("Question two"), assistant(text("Answer two"))];
  assert.deepEqual(getCarConversationRows(tail).map((row) => row.text), ["Answer one", "Question two", "Answer two"]);
  assert.deepEqual(getCarConversationRows([user("Question one"), assistant(tool()), ...tail]).map((row) => row.text),
    ["Question one", "Answer one", "Question two", "Answer two"]);
});
