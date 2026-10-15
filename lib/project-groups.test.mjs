import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { projectIdentityKey } = await jiti.import("./project-identity.ts");
const {
  getProjectActivity,
  getRecentProjects,
  getNewThreadProjects,
  filterProjects,
} = await jiti.import("./project-groups.ts");

function session(id, projectRoot, modified) {
  return {
    id,
    path: `${id}.jsonl`,
    cwd: projectRoot,
    projectRoot,
    projectKey: projectIdentityKey(projectRoot, "win32"),
    created: modified,
    modified,
    messageCount: 1,
    firstMessage: id,
  };
}

test("Windows path variants form one recent project using the newest display path", () => {
  const older = session("older", "C:\\Users\\Alex\\Project\\Study\\ELM", "2026-08-12T00:00:00.000Z");
  const newer = session("newer", "c:/users/ALEX/project/study/elm", "2026-08-13T00:00:00.000Z");

  assert.deepEqual(getRecentProjects([older, newer]), [{
    key: older.projectKey,
    root: newer.projectRoot,
  }]);
});

test("workspace search matches folder names and parent paths without changing activity order", () => {
  const projects = [
    { key: "one", root: "/work/one" },
    { key: "two", root: "C:\\Projects\\Two" },
    { key: "other-one", root: "/personal/one" },
  ];
  assert.deepEqual(filterProjects(projects, " ONE "), [projects[0], projects[2]]);
  assert.deepEqual(filterProjects(projects, "projects"), [projects[1]]);
  assert.deepEqual(filterProjects(projects, " TWO "), [projects[1]]);
  assert.deepEqual(filterProjects(projects, "missing"), []);
  assert.deepEqual(filterProjects(projects, "  "), projects);
  assert.deepEqual(filterProjects([], "one"), []);
});

test("new-thread chooser brings the checked project first and preserves all other ordering", () => {
  const sessions = [
    session("newest", "/work/newest", "2026-08-15"),
    session("current", "/work/current", "2026-08-12"),
    session("middle", "/work/middle", "2026-08-14"),
    session("oldest", "/work/oldest", "2026-08-10"),
  ];
  const original = structuredClone(sessions);
  const choices = getNewThreadProjects(sessions, "/work/current");
  assert.deepEqual(choices.map(({ root }) => root), ["/work/current", "/work/newest", "/work/middle", "/work/oldest"]);
  assert.deepEqual(sessions, original);
  assert.deepEqual(getNewThreadProjects(sessions, null), getRecentProjects(sessions));
  assert.deepEqual(getNewThreadProjects(sessions, "/work/newest"), getRecentProjects(sessions));
  assert.deepEqual(filterProjects(choices, "/work/"), choices);
  assert.deepEqual(filterProjects(choices, "middle").map(({ root }) => root), ["/work/middle"]);
});

test("new-thread chooser includes a fresh folder or active worktree first without duplicating projects", () => {
  const sessions = [session("main", "/work/project", "2026-08-15")];
  assert.deepEqual(getNewThreadProjects(sessions, "/work/project").length, 1);
  for (const cwd of ["/work/new-folder", "/work/project-worktrees/feature"]) {
    assert.deepEqual(getNewThreadProjects(sessions, cwd), [{ root: cwd, key: cwd }, ...getRecentProjects(sessions)]);
  }
  assert.deepEqual(getNewThreadProjects([], "/fresh"), [{ root: "/fresh", key: "/fresh" }]);
  assert.deepEqual(getNewThreadProjects([], null), []);
});

test("new-thread chooser can match the stable key while retaining the project's display path", () => {
  const current = session("current", "C:\\Projects\\Current", "2026-08-12");
  const newer = session("newer", "C:\\Projects\\Newer", "2026-08-15");
  const choices = getNewThreadProjects([newer, current], current.projectKey);
  assert.deepEqual(choices, [
    { root: current.projectRoot, key: current.projectKey },
    { root: newer.projectRoot, key: newer.projectKey },
  ]);
});

test("running and unread counts aggregate under the stable project identity", () => {
  const first = session("first", "C:\\Users\\Alex\\Project", "2026-08-12T00:00:00.000Z");
  const second = session("second", "c:/users/alex/project/", "2026-08-13T00:00:00.000Z");

  const activity = getProjectActivity(
    [first, second],
    new Set(["first", "second"]),
    new Set(["second"]),
  );

  assert.deepEqual(activity.get(first.projectKey), { running: 2, unread: 1 });
  assert.equal(activity.size, 1);
});
