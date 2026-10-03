import { NextResponse, type NextRequest } from "next/server";
import { hasSession, SESSION_COOKIE } from "./lib/access";

export function proxy(req: NextRequest) {
  if (hasSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) return Response.json({ error: "Log in first" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = { matcher: ["/app/:path*", "/api/pipeline"] };
