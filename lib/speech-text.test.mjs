import test from "node:test";
import assert from "node:assert/strict";

import { getAssistantSpeechText, prepareSpeechText } from "./speech-text.ts";

test("assistant speech includes text but excludes thinking and tool calls", () => {
  const text = getAssistantSpeechText({
    role: "assistant",
    content: [
      { type: "thinking", thinking: "private reasoning" },
      { type: "toolCall", toolCallId: "tool-1", toolName: "bash", input: { command: "secret" } },
      { type: "text", text: " First paragraph. " },
      { type: "text", text: "Second paragraph." },
    ],
  });
  assert.equal(text, "First paragraph.\n\nSecond paragraph.");
  assert.doesNotMatch(text, /private|secret|bash/);
});

test("speech preparation removes common markdown punctuation", () => {
  assert.equal(
    prepareSpeechText("## Result\n\n- Read **this** [guide](https://example.test).\n\n```js\nconst ok = true;\n```"),
    "Result\nRead this guide.\n\nconst ok = true;",
  );
});
