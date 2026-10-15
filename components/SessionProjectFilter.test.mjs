import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");
const { SessionProjectFilter, sessionProjectFilterItems } = await jiti.import("./SessionProjectFilter.tsx");
const { SidebarMenuSurface, filterSidebarMenuItems, sidebarMenuHasFilter } = await jiti.import("./SidebarMenu.tsx");
const source = await readFile(new URL("./SessionSidebar.tsx", import.meta.url), "utf8");
const filterSource = await readFile(new URL("./SessionProjectFilter.tsx", import.meta.url), "utf8");

const projects = [
  { key: "/one/app", root: "/one/app", name: "app" },
  { key: "/two/app", root: "/two/app", name: "app" },
  { key: "/work/beta", root: "/work/beta", name: "beta" },
];
function render(value = null, choices = projects) {
  return renderToStaticMarkup(React.createElement(I18nProvider, null,
    React.createElement(SessionProjectFilter, { projects: choices, value, mobile: false, active: true, onChange() {}, onUseDefaultDirectory() {}, onOpenFolder() {} })));
}

test("the project filter defaults to All and uses the Files picker's button and shared menu", () => {
  const html = render();
  assert.match(html, /project-picker is-stacked/);
  assert.match(html, /class="project-picker-button is-project"/);
  assert.match(html, /aria-haspopup="menu" aria-expanded="false"/);
  assert.match(html, /project-picker-label">All projects/);
  assert.doesNotMatch(html, /<select/);
  assert.match(filterSource, /<SidebarMenu/);
  assert.match(filterSource, /minChoices: 1/);
  assert.match(filterSource, /classic=\{!mobile\}/);
  assert.match(filterSource, /sheet=\{mobile\}/);
  assert.match(filterSource, /returnFocusTo=\{buttonRef.current\}/);
  assert.match(render(null, []), /All projects/);
});

test("a selected project's full path is reflected in the button", () => {
  assert.match(render("/work/beta"), /project-picker-path"><span>\/work\/beta<\/span>/);
});

test("shared project menu searches paths and names, with checked selection and no-match state", () => {
  const choices = sessionProjectFilterItems(projects, null, false, "All projects", () => {});
  assert.equal(choices[0].checked, true);
  assert.ok(choices.slice(1).every((item) => item.checked === false));
  assert.equal(sidebarMenuHasFilter(choices, 1), true);
  assert.deepEqual(filterSidebarMenuItems(choices, "TWO").map((item) => item.id), ["project:/two/app"]);
  assert.deepEqual(filterSidebarMenuItems(choices, "beta").map((item) => item.id), ["project:/work/beta"]);
  const html = renderToStaticMarkup(React.createElement(SidebarMenuSurface, {
    sheet: false, ariaLabel: "Filter projects", classic: true, items: choices,
    filter: { placeholder: "Filter projects…", emptyLabel: "No matching projects", minChoices: 1 },
    filterQuery: "missing", cancelLabel: "Cancel", onFilterQueryChange() {}, onActivate() {}, onCancel() {},
  }));
  assert.match(html, /sidebar-menu-filter-input/);
  assert.match(html, /No matching projects/);
  assert.equal(sidebarMenuHasFilter(sessionProjectFilterItems([], null, false, "All projects", () => {}), 1), true);
});

test("mobile choices use the same disambiguation as the Files picker and picks only filter the list", () => {
  let selected = "unchanged";
  const choices = sessionProjectFilterItems(projects, "/work/beta", true, "All projects", (value) => { selected = value; });
  assert.equal(choices[1].label, "app");
  assert.equal(choices[1].note, "one");
  assert.equal(choices[2].note, "two");
  assert.equal(choices[3].checked, true);
  choices[2].onSelect();
  assert.equal(selected, "/two/app");
  choices[0].onSelect();
  assert.equal(selected, null);
});

test("folder actions stay at the bottom even when search finds no project and use their callbacks", () => {
  for (const mobile of [false, true]) {
    const called = [];
    const items = sessionProjectFilterItems(projects, null, mobile, "All projects", () => {}, {
      defaultLabel: "Use default directory", openLabel: "Open another project…",
      onUseDefaultDirectory: () => called.push("default"),
      onOpenFolder: () => called.push("open"),
    });
    assert.deepEqual(items.slice(-3).map((item) => item.id), ["folder-actions", "default-directory", "open-folder"]);
    const filtered = filterSidebarMenuItems(items, "not-a-project");
    assert.deepEqual(filtered.map((item) => item.id), ["folder-actions", "default-directory", "open-folder"]);
    const html = renderToStaticMarkup(React.createElement(SidebarMenuSurface, {
      sheet: mobile, ariaLabel: "Filter projects", classic: !mobile, items,
      filter: { placeholder: "Filter projects…", emptyLabel: "No matching projects", minChoices: 1 },
      filterQuery: "not-a-project", cancelLabel: "Cancel", onFilterQueryChange() {}, onActivate() {}, onCancel() {},
    }));
    assert.match(html, /Use default directory/);
    assert.match(html, /Open another project…/);
    assert.match(html, /No matching projects/);
    items.at(-2).onSelect();
    items.at(-1).onSelect();
    assert.deepEqual(called, ["default", "open"]);
  }
  assert.match(source, /onUseDefaultDirectory=\{\(\) => \{\s*setSessionProjectFilter\(null\);\s*void handleDefaultCwd\(\);/);
  assert.match(source, /onOpenFolder=\{\(\) => \{\s*setSessionProjectFilter\(null\);\s*handleCustomPathClick\(\);/);
});

test("filter wiring is classic-only, page-local, uses filtered rows and resets scroll", () => {
  assert.match(source, /useState<string \| null>\(null\)/);
  assert.match(source, /listView === "chronological" && \(\s*<SessionProjectFilter/);
  assert.match(source, /key=\{`\$\{sidebarTab\}:\$\{archiveView\}`\}/);
  assert.match(source, /rows=\{mainRows\}/);
  assert.match(source, /const visibleRows = archiveView \? archiveRows : mainRows/);
  assert.match(source, /if \(scroll\) scroll.scrollTop = 0/);
  assert.match(source, /sessionProjectFilter !== groupKey\) setSessionProjectFilter\(null\)/);
});
