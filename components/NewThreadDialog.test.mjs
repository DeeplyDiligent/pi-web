import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./NewThreadDialog.tsx", import.meta.url), "utf8");
const shell = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
const sidebar = await readFile(new URL("./SessionSidebar.tsx", import.meta.url), "utf8");
const picker = await readFile(new URL("./ProjectPicker.tsx", import.meta.url), "utf8");

function setup(fetch) {
  const selections = [];
  const context = vm.createContext({
    AbortController,
    requestRef: { current: null },
    fetch,
    onSelect: (workspace) => selections.push(JSON.parse(JSON.stringify(workspace))),
    setBusy: (busy) => { context.busy = busy; },
    setError: (error) => { context.error = error; },
  });
  const start = source.indexOf("  const selectWorkspace = async");
  const end = source.indexOf("\n  if (browsing)", start);
  assert.ok(start > 0 && end > start);
  vm.runInContext(stripTypeScriptTypes(source.slice(start, end) + "\nglobalThis.select = selectWorkspace;"), context);
  return { context, selections };
}

test("both New entry points open one chooser and share the sidebar's searchable list", () => {
  assert.match(shell, /onNewSession=\{requestNewSession\}/);
  assert.match(shell, /onClick=\{requestNewSession\}/);
  assert.match(shell, /setNewThreadDialogOpen\(true\)/);
  assert.match(shell, /<NewThreadDialog[\s\S]*?onCancel=\{\(\) => setNewThreadDialogOpen\(false\)\}/);
  assert.match(sidebar, /onClick=\{onNewSession\}/);
  assert.match(sidebar, /<ProjectPicker/);
  assert.match(source, /<ProjectPicker/);
  assert.match(picker, /filterProjects\(projects, query\)/);
  assert.match(picker, /event\.key === "Enter" && visibleProjects\.length === 1 && !disabled/);
  assert.match(source, /choices\.unshift\(\{ root: currentCwd, key: currentCwd \}\)/);
});

test("validates the selected folder before creating a thread and uses canonical identity", async () => {
  const workspace = { cwd: "C:\\Projects\\One", projectRoot: "C:\\Projects\\One", projectKey: "c:/projects/one" };
  const { context, selections } = setup(async (url, options) => {
    assert.equal(url, "/api/cwd/validate");
    assert.equal(options.method, "POST");
    assert.equal(JSON.parse(options.body).cwd, "c:/projects/one");
    return { ok: true, json: async () => workspace };
  });
  await context.select("c:/projects/one");
  assert.deepEqual(selections, [workspace]);
  assert.equal(context.busy, false);
});

test("missing or removed workspaces stay in the chooser with an error", async () => {
  const { context, selections } = setup(async () => ({ ok: false, status: 404, json: async () => ({ error: "Directory not found" }) }));
  await context.select("/removed");
  assert.deepEqual(selections, []);
  assert.equal(context.error, "Directory not found");
  assert.equal(context.busy, false);
  assert.equal(context.requestRef.current, null);
});

test("duplicate clicks and a late response after unmount cannot start extra threads", async () => {
  const response = Promise.withResolvers();
  let requests = 0;
  const { context, selections } = setup(() => { requests++; return response.promise; });
  const pending = context.select("/project");
  await context.select("/project");
  assert.equal(requests, 1);
  context.requestRef.current.abort();
  response.resolve({ ok: true, json: async () => ({ cwd: "/project", projectRoot: "/project", projectKey: "/project" }) });
  await pending;
  assert.deepEqual(selections, []);
});

test("dialog traps focus natively, restores its opener, and isolates Escape from agent abort", () => {
  assert.match(source, /dialog\.showModal\(\)/);
  assert.match(source, /trigger\.focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /onKeyDown=\{\(event\) => \{[\s\S]*?event\.stopPropagation\(\)/);
  assert.match(source, /onCancel=\{\(event\) => \{ event\.preventDefault\(\); if \(!busy\) onCancel\(\)/);
  assert.match(source, /requestRef\.current\?\.abort\(\)/);
  assert.match(source, /<DirectoryPicker/);
});
