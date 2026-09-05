import assert from "node:assert/strict";
import test from "node:test";

async function loadSubject() {
  return import("./speech-recorder.ts");
}

test("encodes clamped little-endian PCM16 samples", async () => {
  const { encodePcm16 } = await loadSubject();
  const bytes = encodePcm16([new Float32Array([-2, -1, 0, 1, 2])], 16_000);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  assert.deepEqual(
    Array.from({ length: 5 }, (_, index) => view.getInt16(index * 2, true)),
    [-32768, -32768, 0, 32767, 32767],
  );
});

test("resamples microphone input to 16 kHz", async () => {
  const { encodePcm16 } = await loadSubject();
  const bytes = encodePcm16([new Float32Array(48_000)], 48_000, 16_000);
  assert.equal(bytes.byteLength, 16_000 * 2);
});
