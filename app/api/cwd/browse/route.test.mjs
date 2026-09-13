import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": process.cwd() },
  interopDefault: true,
  moduleCache: false,
});
const { POST } = await jiti.import("./route.ts");

function createRequest(body) {
  return new Request("http://localhost/api/cwd/browse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("creates a direct child folder and returns its canonical path", async (t) => {
  const parentPath = await mkdtemp(path.join(os.tmpdir(), "pi-web-cwd-create-"));
  t.after(() => rm(parentPath, { recursive: true, force: true }));

  const response = await POST(createRequest({ parentPath, name: "  new-project  " }));

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { path: path.join(parentPath, "new-project") });
  await access(path.join(parentPath, "new-project"));
});

test("rejects nested or traversal folder names", async (t) => {
  const parentPath = await mkdtemp(path.join(os.tmpdir(), "pi-web-cwd-create-invalid-"));
  t.after(() => rm(parentPath, { recursive: true, force: true }));

  for (const name of ["", ".", "..", "nested/folder", "nested\\folder", "line\nbreak"]) {
    const response = await POST(createRequest({ parentPath, name }));
    assert.equal(response.status, 400, `expected ${JSON.stringify(name)} to be rejected`);
  }
});

test("does not overwrite an existing folder", async (t) => {
  const parentPath = await mkdtemp(path.join(os.tmpdir(), "pi-web-cwd-create-existing-"));
  t.after(() => rm(parentPath, { recursive: true, force: true }));
  await mkdir(path.join(parentPath, "existing"));

  const response = await POST(createRequest({ parentPath, name: "existing" }));

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "A folder with that name already exists" });
});
