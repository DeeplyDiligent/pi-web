import { NextRequest, NextResponse } from "next/server";
import { isApiRequestAllowed } from "@/lib/request-security";
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
  return rejectUntrusted(request) ?? login(request);
}

export async function DELETE(request: NextRequest) {
  return rejectUntrusted(request) ?? logout();
}
