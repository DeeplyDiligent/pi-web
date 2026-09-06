import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const PI_WEB_SESSION_COOKIE = "pi_web_session";
export const PI_WEB_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function hashSecret(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function secretsEqual(actual: string, expected: string): boolean {
  return timingSafeEqual(hashSecret(actual), hashSecret(expected));
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

export function isWebPasswordEnabled(
  password: string | undefined = process.env.PI_WEB_PASSWORD,
): password is string {
  return typeof password === "string" && password.length > 0;
}

export function isValidWebPassword(
  suppliedPassword: unknown,
  password = process.env.PI_WEB_PASSWORD,
): boolean {
  return isWebPasswordEnabled(password)
    && typeof suppliedPassword === "string"
    && secretsEqual(suppliedPassword, password);
}

export function createSessionToken(
  secret = process.env.PI_WEB_SESSION_SECRET,
  now = Date.now(),
): string {
  if (!secret) throw new Error("PI_WEB_SESSION_SECRET is required when password protection is enabled");
  const expiresAt = Math.floor(now / 1000) + PI_WEB_SESSION_MAX_AGE_SECONDS;
  const payload = `v1.${expiresAt}.${randomBytes(18).toString("base64url")}`;
  return `${payload}.${signature(payload, secret)}`;
}

export function isValidSessionToken(
  token: string | undefined,
  secret = process.env.PI_WEB_SESSION_SECRET,
  now = Date.now(),
): boolean {
  if (!token || !secret) return false;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return false;

  const expiresAt = Number(parts[1]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now / 1000)) return false;
  const payload = parts.slice(0, 3).join(".");
  return secretsEqual(parts[3], signature(payload, secret));
}
