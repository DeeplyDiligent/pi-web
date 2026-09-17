"use strict";

/* eslint-disable @typescript-eslint/no-require-imports */

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

// Only files which can affect the production application belong in the
// fingerprint. Documentation and development output should not force a build.
const SOURCE_ENTRIES = [
  "app",
  "bin",
  "components",
  "hooks",
  "lib",
  "public",
  "instrumentation.ts",
  "next-env.d.ts",
  "next.config.ts",
  "package-lock.json",
  "package.json",
  "postcss.config.mjs",
  "proxy.ts",
  "tailwind.config.ts",
  "tsconfig.json",
];

function isSourceCheckout(packageDir) {
  return fs.existsSync(path.join(packageDir, ".git"));
}

function collectFiles(packageDir) {
  const files = [];

  function visit(relativePath) {
    const absolutePath = path.join(packageDir, relativePath);
    if (!fs.existsSync(absolutePath)) return;

    const stat = fs.lstatSync(absolutePath);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(absolutePath).sort()) {
        visit(path.join(relativePath, name));
      }
      return;
    }

    if (stat.isFile() || stat.isSymbolicLink()) {
      const normalized = relativePath.replaceAll(path.sep, "/");
      if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(normalized)) return;
      if (normalized === "bin/local-pi-web.js" || normalized === "bin/source-release.js") return;
      files.push(relativePath);
    }
  }

  for (const entry of SOURCE_ENTRIES) visit(entry);
  for (const name of fs.readdirSync(packageDir).sort()) {
    if (/^\.env(?:\..+)?$/.test(name)) visit(name);
  }
  return files.sort();
}

function getSourceFingerprint(packageDir) {
  const hash = crypto.createHash("sha256");
  for (const relativePath of collectFiles(packageDir)) {
    const absolutePath = path.join(packageDir, relativePath);
    const stat = fs.lstatSync(absolutePath);
    hash.update(relativePath.replaceAll(path.sep, "/"));
    hash.update("\0");
    if (stat.isSymbolicLink()) {
      hash.update(`link:${fs.readlinkSync(absolutePath)}`);
    } else {
      hash.update(fs.readFileSync(absolutePath));
    }
    hash.update("\0");
  }
  return hash.digest("hex");
}

function isCompleteRelease(releaseDir, fingerprint) {
  try {
    const metadata = JSON.parse(
      fs.readFileSync(path.join(releaseDir, ".pi-web-source-build.json"), "utf8"),
    );
    return metadata.fingerprint === fingerprint
      && fs.existsSync(path.join(releaseDir, ".next", "BUILD_ID"));
  } catch {
    return false;
  }
}

function runNpm(args, cwd) {
  const command = process.platform === "win32"
    ? (process.env.ComSpec || "cmd.exe")
    : "npm";
  const commandArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", `npm ${args.join(" ")}`]
    : args;
  const result = spawnSync(command, commandArgs, {
    cwd,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`npm ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function copySource(packageDir, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const relativePath of collectFiles(packageDir)) {
    const source = path.join(packageDir, relativePath);
    const target = path.join(destination, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, { dereference: false });
  }
}

function waitForRelease(releaseDir, fingerprint, buildingDir) {
  const deadline = Date.now() + 15 * 60 * 1000;
  console.log("Another pi-web process is building this source; waiting for it to finish...");
  while (Date.now() < deadline) {
    if (isCompleteRelease(releaseDir, fingerprint)) return releaseDir;
    if (!fs.existsSync(buildingDir)) break;
    sleep(500);
  }
  throw new Error("Timed out waiting for the pi-web source build. Remove the stale build directory and try again: " + buildingDir);
}

function prepareSourceRelease(packageDir) {
  const resolvedPackageDir = fs.realpathSync(packageDir);
  if (process.env.PI_WEB_SOURCE_BUILD === "0" || !isSourceCheckout(resolvedPackageDir)) {
    return resolvedPackageDir;
  }

  const fingerprint = getSourceFingerprint(resolvedPackageDir);
  const cacheRoot = process.env.PI_WEB_BUILD_CACHE_DIR
    || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), ".cache"), "pi-web", "source-builds");
  const releaseDir = path.join(cacheRoot, fingerprint.slice(0, 20));
  const buildingDir = `${releaseDir}.building`;

  if (isCompleteRelease(releaseDir, fingerprint)) return releaseDir;

  fs.mkdirSync(cacheRoot, { recursive: true });
  try {
    fs.mkdirSync(buildingDir);
  } catch (error) {
    if (error && error.code === "EEXIST") {
      return waitForRelease(releaseDir, fingerprint, buildingDir);
    }
    throw error;
  }

  try {
    console.log(`No production build exists for the current pi-web source (${fingerprint.slice(0, 12)}).`);
    console.log(`Building it outside the source checkout in ${buildingDir}...`);
    copySource(resolvedPackageDir, buildingDir);
    // foundry-local-sdk's install hook downloads an optional multi-gigabyte
    // runtime and can fail behind corporate proxies. Pi Web only needs the
    // package's shipped JS/native addon to build; run our own postinstall
    // explicitly after installing the locked dependency tree.
    runNpm(["ci", "--ignore-scripts"], buildingDir);
    const prepareResult = spawnSync(
      process.execPath,
      [path.join(buildingDir, "bin", "prepare-terminal.js")],
      { cwd: buildingDir, env: process.env, stdio: "inherit" },
    );
    if (prepareResult.error) throw prepareResult.error;
    if (prepareResult.status !== 0) {
      throw new Error(`pi-web postinstall failed with exit code ${prepareResult.status}`);
    }
    runNpm(["run", "build"], buildingDir);
    fs.writeFileSync(
      path.join(buildingDir, ".pi-web-source-build.json"),
      `${JSON.stringify({ fingerprint, source: resolvedPackageDir, builtAt: new Date().toISOString() }, null, 2)}\n`,
    );
    fs.renameSync(buildingDir, releaseDir);
    console.log(`Built pi-web source release ${fingerprint.slice(0, 12)}.`);
    return releaseDir;
  } catch (error) {
    fs.rmSync(buildingDir, { recursive: true, force: true });
    throw error;
  }
}

module.exports = {
  collectFiles,
  getSourceFingerprint,
  isCompleteRelease,
  isSourceCheckout,
  prepareSourceRelease,
};
