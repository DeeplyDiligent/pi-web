import { NextResponse, type NextRequest } from "next/server";
import {
  isApiRequestAllowed,
  isApiRequestHostAllowed,
} from "@/lib/request-security";
import { pageFramingHeaders } from "@/lib/frame-ancestors";
import {
  isValidSessionToken,
  isWebPasswordEnabled,
  PI_WEB_SESSION_COOKIE,
} from "@/lib/web-auth";

const PUBLIC_AUTH_PATHS = new Set(["/api/session", "/api/login", "/api/logout", "/api/web-auth"]);

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function proxy(request: NextRequest) {
  const response = routeRequest(request);
  // Every page answer, the redirects and refusals included, says who may
  // frame it; see lib/frame-ancestors.ts. API answers are not pages.
  if (!isApiPath(request.nextUrl.pathname)) {
    for (const [key, value] of pageFramingHeaders()) response.headers.set(key, value);
  }
  return response;
}

function routeRequest(request: NextRequest): NextResponse {
  const pathname = request.nextUrl.pathname;
  const isApiRequest = isApiPath(pathname);
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

  if (!isWebPasswordEnabled(password) && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = { matcher: ["/", "/login", "/api/:path*"] };
