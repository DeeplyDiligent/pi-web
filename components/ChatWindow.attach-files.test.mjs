import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Script } from "node:vm";
import { createJiti } from "jiti";
import ts from "typescript";

const jiti = createJiti(import.meta.url);
const { dropMentionText, splitDroppedItems } = await jiti.import("../lib/file-upload-client.ts");

const sourceText = readFileSync(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
const source = ts.createSourceFile("ChatWindow.tsx", sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

/** Runs one of ChatWindow's useCallback bodies against the given scope. */
function chatWindowCallback(name, context) {
  function findCallback(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) {
      return node.initializer.arguments[0];
    }
    return ts.forEachChild(node, findCallback);
  }
  return new Script(ts.transpileModule(findCallback(source).getText(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText).runInNewContext(context);
}

const photo = new File(["x"], "photo.png", { type: "image/png" });
const report = new File(["x"], "report.pdf", { type: "application/pdf" });
const log = new File(["x"], "server.log", { type: "" });

/** Picks files with the composer's attach button, through ChatWindow's real drop path. */
async function attach(files, { cwd = "/project", response } = {}) {
  const calls = { images: [], uploads: [], mentions: [], notices: [], refreshed: 0 };
  const scope = {
    session: null,
    newSessionCwd: cwd,
    chatInputRef: {
      current: {
        addAttachments: (files) => calls.images.push(...files),
        insertText: (text) => calls.mentions.push(text),
      },
    },
    addNotice: (notice) => calls.notices.push([notice.type, notice.message]),
    t: (key, vars) => (vars ? `${key} ${JSON.stringify(vars)}` : key),
    onFilesUploaded: () => { calls.refreshed += 1; },
    splitDroppedItems,
    dropMentionText,
    uploadFiles: async (target, uploads, strategy) => {
      calls.uploads.push([target, uploads.map((file) => file.name), strategy]);
      return response;
    },
  };
  scope.uploadDroppedFiles = chatWindowCallback("uploadDroppedFiles", scope);
  scope.onDrop = chatWindowCallback("onDrop", scope);
  chatWindowCallback("onAttachFiles", scope)(files);
  await new Promise((resolve) => setImmediate(resolve));
  return calls;
}

test("the attach button sends all files to temporary attachments without writing to the project", async () => {
  const mixed = await attach([photo, report, log], {
    response: { status: 207, data: { uploaded: ["report.pdf"], skipped: ["server.log"] } },
  });
  assert.deepEqual(mixed.images, [photo, report, log]);
  assert.deepEqual(mixed.uploads, []);
  assert.deepEqual(mixed.mentions, []);
  assert.deepEqual(mixed.notices, []);
  assert.equal(mixed.refreshed, 0);

  const imagesOnly = await attach([photo]);
  assert.deepEqual(imagesOnly.images, [photo]);
  assert.deepEqual(imagesOnly.uploads, []);
  assert.deepEqual(imagesOnly.notices, []);
});

test("temporary attachments do not require a working directory", async () => {
  const calls = await attach([photo, report], { cwd: null });
  assert.deepEqual(calls.images, [photo, report]);
  assert.deepEqual(calls.uploads, []);
  assert.deepEqual(calls.notices, []);
});
