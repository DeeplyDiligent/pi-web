import { NextResponse } from "next/server";
import { getAuthRetryAfterMs, recordAuthFailure, recordAuthSuccess, retryAfterSeconds } from "@/lib/auth-throttle";
import { hasJsonContentType } from "@/lib/request-security";
import {
  createSessionToken,
  isValidWebPassword,
  isWebPasswordEnabled,
  PI_WEB_SESSION_COOKIE,
  PI_WEB_SESSION_MAX_AGE_SECONDS,
} from "@/lib/web-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isWebPasswordEnabled()) return NextResponse.json({ authenticated: true });
  if (!hasJsonContentType(request)) {
    return NextResponse.json({ error: "Expected a JSON request" }, { status: 415 });
  }

  let body: { password?: unknown } | null;
  try {
    body = await request.json() as { password?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // After reading the body, check, compare and record without yielding.
  // Both password endpoints use this path and share one counter.
  const retryAfterMs = getAuthRetryAfterMs();
  if (retryAfterMs > 0) {
    return NextResponse.json(
      { error: "Too many failed attempts", retryAfterMs },
      { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(retryAfterSeconds(retryAfterMs)) } },
    );
  }
  if (!isValidWebPassword(body?.password)) {
    const delayMs = recordAuthFailure();
    console.warn(`[web-auth] Password authentication failed; next attempt blocked for ${delayMs}ms`);
    return NextResponse.json(
      { error: "Invalid password", retryAfterMs: delayMs },
      { status: 401, headers: { "Cache-Control": "no-store", "Retry-After": String(retryAfterSeconds(delayMs)) } },
    );
  }
  recordAuthSuccess();

  const response = NextResponse.json({ authenticated: true });
  response.cookies.set({
    name: PI_WEB_SESSION_COOKIE,
    value: createSessionToken(),
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: PI_WEB_SESSION_MAX_AGE_SECONDS,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
