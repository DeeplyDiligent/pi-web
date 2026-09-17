#!/usr/bin/env node
"use strict";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { spawn, spawnSync } = require("child_process");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("path");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prepareSourceRelease } = require("./source-release");

const tunnelName = process.env.PI_WEB_CLOUDFLARE_TUNNEL || "work-laptop-pi";
const publicHostname = process.env.PI_WEB_PUBLIC_HOSTNAME || "work-laptop-pi.deepb.com.au";

if (!process.env.ENV_TYPE) {
  process.env.ENV_TYPE = "work";
}

if (!process.env.PI_WEB_ALLOWED_HOSTS) {
  process.env.PI_WEB_ALLOWED_HOSTS = publicHostname;
}

function isTunnelRunning() {
  if (process.platform !== "win32") return false;

  const script = [
    "$escaped = [Regex]::Escape($env:PI_WEB_TUNNEL_NAME)",
    "$running = Get-CimInstance Win32_Process -Filter \"Name = 'cloudflared.exe'\" | Where-Object { $_.CommandLine -match ('\\brun\\s+' + $escaped + '(?:\\s|$)') }",
    "if ($running) { exit 0 } else { exit 1 }",
  ].join("; ");

  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    {
      env: { ...process.env, PI_WEB_TUNNEL_NAME: tunnelName },
      stdio: "ignore",
      windowsHide: true,
    },
  );
  return result.status === 0;
}

function resolveCloudflared() {
  const result = spawnSync("where.exe", ["cloudflared.exe"], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) return null;
  return result.stdout.split(/\r?\n/, 1)[0].trim() || null;
}

function ensureTunnel() {
  if (process.platform !== "win32") {
    console.error("The local Pi Web launcher currently supports Cloudflare Tunnel on Windows only.");
    process.exit(1);
  }

  if (isTunnelRunning()) {
    console.log(`Cloudflare tunnel "${tunnelName}" is already running.`);
    return;
  }

  const cloudflared = resolveCloudflared();
  if (!cloudflared) {
    console.error("cloudflared.exe was not found on PATH.");
    process.exit(1);
  }

  const port = process.env.PORT || "30141";
  const tunnel = spawn(
    cloudflared,
    ["tunnel", "--url", `http://127.0.0.1:${port}`, "run", tunnelName],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    },
  );
  tunnel.unref();
  console.log(`Started Cloudflare tunnel "${tunnelName}".`);
}

// A registry-installed package already contains its matching production build.
// A globally linked source checkout does not, so build/reuse an isolated,
// content-addressed release rather than writing .next in the active checkout.
const packageDir = process.argv.includes("--help") || process.argv.includes("-h")
  ? path.join(__dirname, "..")
  : prepareSourceRelease(path.join(__dirname, ".."));

ensureTunnel();
// eslint-disable-next-line @typescript-eslint/no-require-imports
require(path.join(packageDir, "bin", "pi-web"));
