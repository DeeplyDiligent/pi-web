import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as themeModule from "../lib/theme.ts";

const require = createRequire(import.meta.url);
const hookSource = await readFile(new URL("./useTheme.ts", import.meta.url), "utf8");
const layoutSource = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const componentSource = await readFile(new URL("../components/BrowserTheme.tsx", import.meta.url), "utf8");
const bootstrap = themeModule.THEME_INIT_SCRIPT;
const requireTheme = (name) => name === "@/lib/theme" ? themeModule : require(name);
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const hookScript = compile(hookSource);

function environment(preference, systemDark, storageThrows = false) {
  const style = {};
  let darkClass = false;
  const context = vm.createContext({
    exports: {},
    require: requireTheme,
    localStorage: {
      getItem: () => {
        if (storageThrows) throw new Error("Storage unavailable");
        return preference;
      },
      setItem: () => {},
    },
    window: { matchMedia: () => ({ matches: systemDark }) },
    document: {
      documentElement: { style, dataset: {}, classList: { toggle: (_, enabled) => { darkClass = enabled; } } },
      querySelectorAll: () => assert.fail("Theme code must not mutate React-owned metadata"),
    },
  });
  return { context, style, isDark: () => darkClass };
}

for (const [preference, systemDark, expectedDark] of [
  ["light", true, false], ["dark", false, true], ["auto", true, true],
  ["auto", false, false], [null, true, true], ["invalid", true, true],
  ["mist", true, false], ["rose", true, false], ["pine", false, true],
]) {
  test(`bootstrap and runtime agree for ${preference}, system dark=${systemDark}`, () => {
    const env = environment(preference, systemDark);
    vm.runInContext(bootstrap, env.context);
    assert.equal(env.isDark(), expectedDark);
    assert.equal(env.style.colorScheme, expectedDark ? "dark" : "light");
    vm.runInContext(`${hookScript}\nensureState();`, env.context);
    assert.equal(env.style.colorScheme, expectedDark ? "dark" : "light");
    assert.equal(env.isDark(), expectedDark);
  });
}

test("theme follows manual switches and automatic system changes", () => {
  const env = environment("light", true);
  vm.runInContext(hookScript, env.context);
  for (const [preference, theme] of [["dark", "dark"], ["light", "light"], ["auto", "light"]]) {
    vm.runInContext(`setThemeState("${preference}", "${theme}", true);`, env.context);
    assert.equal(env.style.colorScheme, theme);
  }
  vm.runInContext("syncAutoThemeFromSystem();", env.context);
  assert.equal(env.style.colorScheme, "dark");
  vm.runInContext('setThemeState("light", "light", true); syncAutoThemeFromSystem();', env.context);
  assert.equal(env.style.colorScheme, "light", "system changes must not override explicit light mode");
});

test("blocked storage still resolves the system theme at startup", () => {
  const env = environment(null, true, true);
  vm.runInContext(bootstrap, env.context);
  assert.equal(env.style.colorScheme, "dark");
  vm.runInContext(`${hookScript}\nensureState();`, env.context);
  assert.equal(env.style.colorScheme, "dark");
});

for (const [preference, media] of [
  ["auto", ["(prefers-color-scheme: light)", "(prefers-color-scheme: dark)"]],
  ["light", ["all", "not all"]],
  ["dark", ["not all", "all"]],
  ["mist", ["all", "not all"]],
  ["rose", ["all", "not all"]],
  ["pine", ["not all", "all"]],
]) {
  test(`${preference} renders one unambiguous native theme-color pair`, () => {
    const context = {
      exports: {},
      require: (name) => name === "@/hooks/useTheme" ? { useTheme: () => ({ preference }) } : requireTheme(name),
    };
    vm.runInNewContext(compile(componentSource), context);
    const tags = context.exports.BrowserTheme().props.children;
    assert.equal(tags.length, 2);
    for (const [index, tag] of tags.entries()) {
      assert.equal(tag.type, "meta");
      assert.equal(tag.props.name, "theme-color");
      assert.equal(tag.props.content, index === 0 ? "#ffffff" : "#1a1a1a");
      assert.equal(tag.props.media, media[index]);
    }
  });
}

test("metadata has a single declarative owner, with no pre-hydration mutation", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(layoutSource, /<BrowserTheme \/>[\s\S]*\{children\}/);
  assert.doesNotMatch(layoutSource, /themeColor\s*:/);
  assert.doesNotMatch(bootstrap, /theme-color/);
  assert.doesNotMatch(hookSource, /querySelectorAll|MutationObserver/);
  assert.match(css, /:root,\s*\[data-theme="light"\] \{\s*color-scheme: light;/);
  assert.match(css, /html\.dark,\s*\[data-theme="dark"\] \{\s*color-scheme: dark;/);
  assert.match(layoutSource, /__html: THEME_INIT_SCRIPT/);
});

test("manifest does not pin Android's system bar to one colour", async () => {
  const manifestSource = await readFile(new URL("../app/manifest.ts", import.meta.url), "utf8");
  const iconSource = await readFile(new URL("../lib/app-icons.ts", import.meta.url), "utf8");
  const icons = { exports: {}, process: { env: {} } };
  vm.runInNewContext(compile(iconSource), icons);
  const context = { exports: {}, require: () => icons.exports };
  vm.runInNewContext(compile(manifestSource), context);
  const manifest = context.exports.default();
  assert.equal(Object.hasOwn(manifest, "theme_color"), false);
  assert.equal(Object.hasOwn(JSON.parse(JSON.stringify(manifest)), "theme_color"), false);
  assert.equal(manifest.background_color, "#ffffff");
  assert.ok(manifest.icons.length >= 2);
});
