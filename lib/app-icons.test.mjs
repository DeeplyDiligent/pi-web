import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const compile = async (path) => ts.transpileModule(
  await readFile(new URL(path, import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const iconScript = await compile("./app-icons.ts");
const manifestScript = await compile("../app/manifest.ts");
const routeScript = await compile("../app/app-icons/[name]/route.ts");
const sw = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");

function runtime(envType) {
  const process = { env: { ENV_TYPE: envType } };
  const icons = { exports: {}, process };
  vm.runInNewContext(iconScript, icons);
  const load = (script) => {
    const context = {
      exports: {}, Response, Object,
      require: (name) => {
        assert.equal(name, "@/lib/app-icons");
        return icons.exports;
      },
    };
    vm.runInNewContext(script, context);
    return context.exports;
  };
  return { process, icons: icons.exports, manifest: load(manifestScript), route: load(routeScript) };
}

for (const envType of [undefined, "", "personal", "WORK", "work"]) {
  test(`icon selection for ENV_TYPE=${envType}`, async () => {
    const app = runtime(envType);
    const paths = app.icons.getAppIcons();
    const manifest = app.manifest.default();
    assert.equal(app.manifest.dynamic, "force-dynamic");
    assert.equal(app.route.dynamic, "force-dynamic");
    assert.deepEqual(Array.from(manifest.icons, (icon) => icon.src), [paths.icon192, paths.icon512, paths.maskable512]);
    assert.equal(manifest.icons[2].purpose, "maskable");
    for (const [key, path] of Object.entries(paths)) {
      assert.equal(path.includes("-work"), envType === "work");
      assert.ok(sw.includes(`"${path}"`), `${path} must be available offline`);
      const png = await readFile(new URL(`../public${path}`, import.meta.url));
      assert.equal(png.subarray(1, 4).toString(), "PNG");
      const size = key === "apple" ? 180 : key === "icon192" ? 192 : 512;
      assert.equal(png.readUInt32BE(16), size);
      assert.equal(png.readUInt32BE(20), size);
      if (key === "maskable512" || key === "apple") {
        assert.equal(png[25], 2, "maskable and Apple PNGs must be RGB with no transparent padding");
      }
    }
    for (const [name, expected] of [["icon-192.png", paths.icon192], ["apple-touch-icon.png", paths.apple]]) {
      const response = await app.route.GET(new Request(`https://pi.test/app-icons/${name}`), { params: Promise.resolve({ name }) });
      assert.equal(response.status, 307);
      assert.equal(response.headers.get("Location"), expected);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
    }
  });
}

test("runtime environment changes do not require rebuilding the manifest or touch icons", async () => {
  const app = runtime(undefined);
  const plain = app.manifest.default().icons[0].src;
  app.process.env.ENV_TYPE = "work";
  assert.notEqual(app.manifest.default().icons[0].src, plain);
  const response = await app.route.GET(new Request("https://pi.test/app-icons/apple-touch-icon.png"), {
    params: Promise.resolve({ name: "apple-touch-icon.png" }),
  });
  assert.equal(response.headers.get("Location"), "/icons/apple-touch-icon-blue-v1-work.png");
});

test("icon endpoint rejects unknown and inherited object keys", async () => {
  const app = runtime("work");
  for (const name of ["missing.png", "toString", "__proto__"]) {
    const response = await app.route.GET(new Request("https://pi.test/app-icons/unknown"), { params: Promise.resolve({ name }) });
    assert.equal(response.status, 404);
  }
});
