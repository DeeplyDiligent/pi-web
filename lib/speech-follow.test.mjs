import assert from "node:assert/strict";
import test from "node:test";
import { createSpeechTextTracker, revealSpeechRange, splitSpeechText } from "./speech-follow.ts";

test("short speech chunks retain exact offsets and every spoken word", () => {
  const text = "  " + "First sentence with several words.\n\nSecond sentence follows. ".repeat(12);
  const chunks = splitSpeechText(text);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.equal(text.slice(chunk.start, chunk.start + chunk.text.length), chunk.text);
    assert.ok(chunk.text.length <= 320);
  }
  assert.deepEqual(chunks.flatMap((chunk) => chunk.text.split(/\s+/)), text.trim().split(/\s+/));
});

test("each sentence starts an utterance even when the voice provides no boundaries", () => {
  const text = "  First sentence. Second sentence!\nHeading\nPrice is $0.0036. Next one?";
  const chunks = splitSpeechText(text);
  assert.deepEqual(chunks.map((chunk) => chunk.text), ["First sentence.", "Second sentence!", "Heading", "Price is $0.0036.", "Next one?"]);
  for (const chunk of chunks) {
    assert.equal(text.slice(chunk.start, chunk.start + chunk.text.length), chunk.text);
    assert.equal(chunk.sentenceStart, chunk.start);
    assert.equal(chunk.sentenceEnd, chunk.start + chunk.text.length);
  }
});

test("long sentences keep a single highlight range across bounded utterances", () => {
  const text = "A long sentence " + "with more words ".repeat(40) + "ends here.";
  const chunks = splitSpeechText(text);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.text.length <= 320));
  assert.ok(chunks.every((chunk) => chunk.sentenceStart === 0 && chunk.sentenceEnd === text.length));
  assert.deepEqual(chunks.flatMap((chunk) => chunk.text.split(/\s+/)), text.split(/\s+/));
});

test("sentence fallback without Intl.Segmenter preserves decimals and Unicode punctuation", (t) => {
  const segmenter = Intl.Segmenter;
  Intl.Segmenter = undefined;
  t.after(() => { Intl.Segmenter = segmenter; });
  const text = "Cost is 1.25. Next sentence! 你好。下一句！";
  assert.deepEqual(splitSpeechText(text).map((chunk) => chunk.text), ["Cost is 1.25.", "Next sentence!", "你好。", "下一句！"]);
});

test("sentence matching covers rendered words without leaking into the next table row", () => {
  const spoken = "Name, Price. Small, blank. Large, 20.";
  const visible = "Name Price Small Large 20";
  const track = createSpeechTextTracker(spoken, visible);
  const header = track(0, spoken.indexOf("Small"));
  assert.equal(visible.slice(header.start, header.end), "Name Price");
  const small = track(spoken.indexOf("Small"), spoken.indexOf("Large"));
  assert.equal(visible.slice(small.start, small.end), "Small");
  const large = track(spoken.indexOf("Large"), spoken.length);
  assert.equal(visible.slice(large.start, large.end), "Large 20");
});

test("spoken words follow rendered Markdown and skip the invented table introduction", () => {
  const spoken = "Result. Table with headings: Name, Price. Small, 10. Large, 20. Done.";
  const visible = "Pi Result Name Price Small 10 Large 20 Done";
  const track = createSpeechTextTracker(spoken, visible);
  for (const word of ["Result", "Table", "Small", "Large", "Done"]) {
    const range = track(spoken.indexOf(word));
    const expected = word === "Table" ? "Name" : word;
    assert.equal(visible.slice(range.start, range.end), expected);
  }
});

test("repeated words stay in the current sentence and a restarted reading can rewind", () => {
  const text = "The cost is low. The price is high. The cost is low.";
  const track = createSpeechTextTracker(text, text);
  for (const offset of [0, text.indexOf("price"), text.lastIndexOf("cost"), 0]) {
    const range = track(offset);
    assert.equal(range.start, offset);
  }
});

test("an invented blank cell does not skip ahead to prose containing the same word", () => {
  const spoken = "Name, Price. Small, blank. Large, 20. Leave this blank.";
  const visible = "Name Price Small Large 20 Leave this blank";
  const track = createSpeechTextTracker(spoken, visible);
  track(spoken.indexOf("Small"));
  const nextRow = track(spoken.indexOf("blank"));
  assert.equal(visible.slice(nextRow.start, nextRow.end), "Large");
  const large = track(spoken.indexOf("Large"));
  assert.equal(visible.slice(large.start, large.end), "Large");
});

test("Unicode words match and nonmatching generated text is harmless", () => {
  const track = createSpeechTextTracker("Café coûte 10. Blank.", "Café coûte 10.");
  assert.equal(track(5).start, 5);
  assert.equal(track(15), null);
});

test("reading scrolls only when the spoken range leaves the padded chat viewport", () => {
  const container = { scrollTop: 100, getBoundingClientRect: () => ({ top: 100, bottom: 500, height: 400 }) };
  const range = (top, bottom) => ({ getBoundingClientRect: () => ({ top, bottom, height: bottom - top }) });
  revealSpeechRange(container, range(200, 220));
  assert.equal(container.scrollTop, 100);
  revealSpeechRange(container, range(520, 540));
  assert.equal(container.scrollTop, 400);
  revealSpeechRange(container, range(80, 100));
  assert.equal(container.scrollTop, 260);
});
