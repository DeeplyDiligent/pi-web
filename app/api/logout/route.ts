import { NextResponse } from "next/server";
import { PI_WEB_SESSION_COOKIE } from "@/lib/web-auth";

export function POST() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set({
    name: PI_WEB_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
