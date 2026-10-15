import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./useAgentSession.ts", import.meta.url), "utf8");
const chat = await readFile(new URL("../components/ChatWindow.tsx", import.meta.url), "utf8");

test("editing a running prompt keeps the local guarded edit-message command", () => {
  const edit = source.slice(source.indexOf("  const handleEdit = useCallback"), source.indexOf("  const handleLeafChange = useCallback"));
  assert.match(edit, /type: "edit_message", entryId, expectedText/);
  assert.match(edit, /await loadSession\(sid, false, false, \{ strict: true \}\)/);
  assert.match(chat, /onEdit=\{msg\.role === "user" && \(entryIds\[idx\] \|\| idx === lastUserIdx\)/);
});

test("auto-read hands off to voice input only after completed response speech", () => {
  assert.match(chat, /onSpeakResponse\(text, key, \(\) => \{/);
  assert.match(chat, /autoReadEnabledRef\.current\) chatInputRef\?\.current\?\.startSpeechRecording\(\)/);
  assert.match(chat, /splitFinalAssistantBlocks\(message\)\.answerBlocks/);
});

test("consecutive extension dialogs sound once per dialog id", () => {
  assert.match(chat, /soundedExtensionDialogIdRef\.current === extensionDialog\.id/);
  assert.match(chat, /soundedExtensionDialogIdRef\.current = extensionDialog\.id/);
  assert.match(chat, /if \(\s*!completionNotificationsEnabled\s*\|\| !extensionDialog/);
});
