import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { saveTemporaryAttachments } = await jiti.import("./temporary-attachments.ts");

test("saves non-image chat attachments in a private temporary directory", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-web-attachment-test-"));
  try {
    const [saved] = await saveTemporaryAttachments([
      new File(["hello"], "notes.txt", { type: "text/plain" }),
    ], root);

    assert.equal(saved.name, "notes.txt");
    assert.equal(saved.size, 5);
    assert.equal(await readFile(saved.path, "utf8"), "hello");
    assert.equal(path.dirname(path.dirname(saved.path)), root);
    assert.equal((await stat(saved.path)).mode & 0o777, 0o600);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects attachment file names containing paths", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-web-attachment-test-"));
  try {
    await assert.rejects(
      saveTemporaryAttachments([new File(["no"], "../escape.txt")], root),
      /must not contain a path/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
