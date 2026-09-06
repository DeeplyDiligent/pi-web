import { NextResponse, type NextRequest } from "next/server";
import {
  isValidSessionToken,
  isWebPasswordEnabled,
  PI_WEB_SESSION_COOKIE,
} from "@/lib/web-auth";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const authenticated = !isWebPasswordEnabled()
    || isValidSessionToken(request.cookies.get(PI_WEB_SESSION_COOKIE)?.value);

  return NextResponse.json(
    { authenticated },
    { headers: { "Cache-Control": "no-store" } },
  );
}
