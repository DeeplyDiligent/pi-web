import { NextResponse, type NextRequest } from "next/server";
import {
  isApiRequestAllowed,
  isApiRequestHostAllowed,
} from "@/lib/request-security";
import {
  isValidSessionToken,
  isWebPasswordEnabled,
  PI_WEB_SESSION_COOKIE,
} from "@/lib/web-auth";

const PUBLIC_AUTH_PATHS = new Set(["/api/session", "/api/login", "/api/logout"]);

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isApiRequest = pathname === "/api" || pathname.startsWith("/api/");
  const isTrustedRequest = isApiRequest
    ? isApiRequestAllowed(request)
    : isApiRequestHostAllowed(request);

  if (!isTrustedRequest) {
    if (!isApiRequest) return new NextResponse("Untrusted request", { status: 403 });
    return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  }

  const password = process.env.PI_WEB_PASSWORD;
  if (
    isApiRequest
    && !PUBLIC_AUTH_PATHS.has(pathname)
    && isWebPasswordEnabled(password)
    && !isValidSessionToken(request.cookies.get(PI_WEB_SESSION_COOKIE)?.value)
  ) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.next();
}

export const config = { matcher: ["/", "/api/:path*"] };
