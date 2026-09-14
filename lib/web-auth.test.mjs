import assert from "node:assert/strict";
import test from "node:test";

async function loadSubject() {
  return import("./web-auth.ts");
}

test("enables password authentication only for a non-empty configured password", async () => {
  const { isWebPasswordEnabled } = await loadSubject();
  const original = process.env.PI_WEB_PASSWORD;
  try {
    delete process.env.PI_WEB_PASSWORD;
    assert.equal(isWebPasswordEnabled(undefined), false);
  } finally {
    if (original !== undefined) process.env.PI_WEB_PASSWORD = original;
  }
  assert.equal(isWebPasswordEnabled(""), false);
  assert.equal(isWebPasswordEnabled("secret"), true);
});

test("compares the submitted password without accepting other input types", async () => {
  const { isValidWebPassword } = await loadSubject();
  assert.equal(isValidWebPassword("secret", "secret"), true);
  assert.equal(isValidWebPassword("wrong", "secret"), false);
  assert.equal(isValidWebPassword(null, "secret"), false);
  assert.equal(isValidWebPassword(123, "secret"), false);
  assert.equal(isValidWebPassword("secret", ""), false);
});

test("creates a signed session token and validates it before expiry", async () => {
  const { createSessionToken, isValidSessionToken } = await loadSubject();
  const now = Date.UTC(2026, 0, 1);
  const token = createSessionToken("signing-secret", now);
  assert.equal(isValidSessionToken(token, "signing-secret", now), true);
  assert.equal(isValidSessionToken(token, "wrong-secret", now), false);
});

test("rejects expired, malformed, and modified session tokens", async () => {
  const { createSessionToken, isValidSessionToken, PI_WEB_SESSION_MAX_AGE_SECONDS } = await loadSubject();
  const now = Date.UTC(2026, 0, 1);
  const token = createSessionToken("signing-secret", now);
  const expiredAt = now + (PI_WEB_SESSION_MAX_AGE_SECONDS + 1) * 1000;

  assert.equal(isValidSessionToken(token, "signing-secret", expiredAt), false);
  assert.equal(isValidSessionToken(undefined, "signing-secret", now), false);
  assert.equal(isValidSessionToken("bad-token", "signing-secret", now), false);
  assert.equal(isValidSessionToken(`${token}x`, "signing-secret", now), false);
  assert.equal(isValidSessionToken(token, undefined, now), false);
});

test("sessions use an independent signing secret and retain the seven-day lifetime", async () => {
  const { createSessionToken, isValidSessionToken, PI_WEB_SESSION_MAX_AGE_SECONDS } = await loadSubject();
  const now = Date.UTC(2026, 8, 7);
  const token = createSessionToken("independent-signing-secret", now);
  assert.equal(PI_WEB_SESSION_MAX_AGE_SECONDS, 7 * 24 * 60 * 60);
  assert.equal(isValidSessionToken(token, "independent-signing-secret", now), true);
  assert.equal(isValidSessionToken(token, "login-password", now), false);
  assert.equal(isValidSessionToken(token, "independent-signing-secret", now + PI_WEB_SESSION_MAX_AGE_SECONDS * 1000), false);
});
