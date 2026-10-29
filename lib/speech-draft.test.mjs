import assert from "node:assert/strict";
import test from "node:test";
import { insertSpeechTranscript } from "./speech-draft.ts";

test("continuing dictation shows the saved draft followed by the new live words", () => {
  const saved = "First part of my message.";
  const range = { start: saved.length, end: saved.length };
  assert.equal(insertSpeechTranscript(saved, range, "And the next part")?.value, "First part of my message. And the next part");
  const final = insertSpeechTranscript(saved, range, "And the next part.");
  const resumedRange = { start: final.value.length, end: final.value.length };
  assert.equal(insertSpeechTranscript(final.value, resumedRange, "One more thing")?.value,
    "First part of my message. And the next part. One more thing");
  assert.equal(saved, "First part of my message.", "preview does not mutate the saved draft");
});

test("final transcription replaces the live range once, with correct spacing", () => {
  const range = { start: 5, end: 5 };
  const live = insertSpeechTranscript("Hello world", range, "new");
  assert.equal(live.value, "Hello new world");
  range.end = live.end;
  const final = insertSpeechTranscript(live.value, range, "new words");
  assert.equal(final.value, "Hello new words world");
  assert.equal(final.cursor, "Hello new words".length);
  assert.equal(insertSpeechTranscript("Hello\n", { start: 6, end: 6 }, "again").value, "Hello\nagain");
});

test("no live result leaves the previous draft intact", () => {
  assert.equal(insertSpeechTranscript("Previous words", { start: 14, end: 14 }, " "), null);
  assert.equal(insertSpeechTranscript("Previous words", null, "new"), null);
});
