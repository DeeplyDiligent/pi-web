import { NextRequest, NextResponse } from "next/server";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";
import { isWebPasswordEnabled } from "@/lib/web-auth";
import { GET as getSession } from "../session/route";
import { POST as login } from "../login/route";
import { POST as logout } from "../logout/route";

export const dynamic = "force-dynamic";

// Adapt upstream's settings API to the fork's existing signed sessions.
function rejectUntrusted(request: Request) {
  return isApiRequestAllowed(request) ? null
    : NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
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
  return login(request);
}

export async function DELETE(request: NextRequest) {
  return rejectUntrusted(request) ?? logout();
}
