import { NextRequest, NextResponse } from "next/server";
import {
  getAuthRetryAfterMs,
  recordAuthFailure,
  recordAuthSuccess,
  retryAfterSeconds,
} from "@/lib/auth-throttle";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";
import { isWebPasswordEnabled } from "@/lib/web-auth";
import { GET as getSession } from "../session/route";
import { POST as login } from "../login/route";
import { POST as logout } from "../logout/route";

export const dynamic = "force-dynamic";

// Adapt upstream's login/settings API to the fork's existing signed sessions.
// Keep one cookie format, signing secret, expiry and Secure/HttpOnly policy.
function rejectUntrusted(request: Request) {
  return isApiRequestAllowed(request) ? null
    : NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
}

function tooManyAttempts(retryAfterMs: number): NextResponse {
  return NextResponse.json(
    { error: "Too many failed attempts", retryAfterMs },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(retryAfterSeconds(retryAfterMs)),
      },
    },
  );
}

export async function GET(request: NextRequest) {
  const rejected = rejectUntrusted(request);
  if (rejected) return rejected;
  const response = getSession(request);
  const { authenticated } = await response.json();
  return NextResponse.json(
    { enabled: isWebPasswordEnabled(), authenticated },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const rejected = rejectUntrusted(request);
  if (rejected) return rejected;
  if (!hasJsonContentType(request)) {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }

  if (isWebPasswordEnabled()) {
    const retryAfterMs = getAuthRetryAfterMs();
    if (retryAfterMs > 0) return tooManyAttempts(retryAfterMs);
  }

  const response = await login(request);
  if (response.status === 401) {
    const delayMs = recordAuthFailure();
    console.warn(`[web-auth] Password authentication failed; next attempt blocked for ${delayMs}ms`);
    return NextResponse.json(
      { error: "Invalid password", retryAfterMs: delayMs },
      {
        status: 401,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(retryAfterSeconds(delayMs)),
        },
      },
    );
  }
  if (response.ok) recordAuthSuccess();
  return response;
}

export async function DELETE(request: NextRequest) {
  return rejectUntrusted(request) ?? logout();
}
