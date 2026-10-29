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

test("tables announce headings once and speak concise rows", () => {
  assert.equal(prepareSpeechText("| Name | Price | Available |\n| :--- | ---: | :---: |\n| **Small** | $10 | Yes |\n| Large | $20 | No |"),
    "Table with headings: Name, Price, Available.\nSmall, $10, Yes.\nLarge, $20, No.");
});

test("tables without outer pipes, blank cells, links and escaped pipes", () => {
  assert.equal(prepareSpeechText("Item | Notes\n--- | ---\n[Guide](https://example.test) | a\\|b\nOther |"),
    "Table with headings: Item, Notes.\nGuide, a|b.\nOther, blank.");
});

test("table-looking fenced code and ordinary pipes are not narrated as tables", () => {
  assert.doesNotMatch(prepareSpeechText("```text\na | b\n--- | ---\nc | d\n```"), /Table with headings/);
  assert.equal(prepareSpeechText("Choose a | b.\n\n---\n\nDone."), "Choose a | b.\n\nDone.");
});

test("multiple tables keep surrounding prose", () => {
  assert.equal(prepareSpeechText("First.\n\nx | y\n--- | ---\n1 | 2\n\nNext.\n\n| z |\n| --- |\n| 3 |"),
    "First.\n\nTable with headings: x, y.\n1, 2.\n\nNext.\n\nTable with headings: z.\n3.");
});

test("speech preparation removes common markdown punctuation", () => {
  assert.equal(
    prepareSpeechText("## Result\n\n- Read **this** [guide](https://example.test).\n\n```js\nconst ok = true;\n```"),
    "Result\nRead this guide.\n\nconst ok = true;",
  );
});
