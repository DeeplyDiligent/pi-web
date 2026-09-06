import { NextResponse } from "next/server";
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

  let body: { password?: unknown };
  try {
    body = await request.json() as { password?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!isValidWebPassword(body.password)) {
    return NextResponse.json(
      { error: "Incorrect password" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const response = NextResponse.json({ authenticated: true });
  response.cookies.set({
    name: PI_WEB_SESSION_COOKIE,
    value: createSessionToken(),
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: PI_WEB_SESSION_MAX_AGE_SECONDS,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
