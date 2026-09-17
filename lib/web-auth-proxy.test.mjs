import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { createJiti } from "jiti";
import { NextRequest } from "next/server.js";

const originalPassword = process.env.PI_WEB_PASSWORD;
const originalSecret = process.env.PI_WEB_SESSION_SECRET;
const jiti = createJiti(import.meta.url, {
  alias: { "@": process.cwd() }, interopDefault: true, moduleCache: false,
});
const { proxy } = await jiti.import("../proxy.ts");
const { createSessionToken } = await jiti.import("./web-auth.ts");
before(() => {
  process.env.PI_WEB_PASSWORD = "secret";
  process.env.PI_WEB_SESSION_SECRET = "test-signing-secret";
});
after(() => {
  if (originalPassword === undefined) delete process.env.PI_WEB_PASSWORD;
  else process.env.PI_WEB_PASSWORD = originalPassword;
  if (originalSecret === undefined) delete process.env.PI_WEB_SESSION_SECRET;
  else process.env.PI_WEB_SESSION_SECRET = originalSecret;
});
function request(path, headers = {}) {
  return new NextRequest(`http://localhost${path}`, { headers: { Host: "localhost", ...headers } });
}

test("preserves the local sign-in shell and URL while protecting API data", () => {
  assert.equal(proxy(request("/?session=abc")).status, 200);
  assert.equal(proxy(request("/api/sessions")).status, 401);
});

test("accepts existing independently signed sessions and rejects altered cookies", () => {
  const token = createSessionToken();
  const headers = { Cookie: `pi_web_session=${token}` };
  assert.equal(proxy(request("/", headers)).status, 200);
  assert.equal(proxy(request("/api/sessions", headers)).status, 200);
  assert.equal(proxy(request("/api/sessions", { Cookie: `pi_web_session=${token}x` })).status, 401);
});

test("does not re-enable Basic Auth or password-signed sessions in this fork", () => {
  const authorization = `Basic ${Buffer.from("pi:secret").toString("base64")}`;
  assert.equal(proxy(request("/api/sessions", { Authorization: authorization })).status, 401);
  const passwordSigned = createSessionToken("secret");
  assert.equal(proxy(request("/api/sessions", { Cookie: `pi_web_session=${passwordSigned}` })).status, 401);
});

test("both login API surfaces remain reachable without a session", () => {
  for (const path of ["/login", "/api/web-auth", "/api/login", "/api/logout", "/api/session"]) {
    assert.equal(proxy(request(path)).status, 200);
  }
});

test("rejects untrusted hosts and cross-origin authentication requests", () => {
  assert.equal(proxy(request("/api/web-auth", { Origin: "https://attacker.example", "Sec-Fetch-Site": "cross-site" })).status, 403);
  assert.equal(proxy(request("/login", { Host: "attacker.example" })).status, 403);
});
