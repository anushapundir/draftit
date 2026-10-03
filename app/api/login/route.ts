import { NextResponse } from "next/server";
import { checkLogin, newSession, SESSION_COOKIE } from "../../../lib/access";

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const email = String(form?.get("email") ?? "").slice(0, 200);
  const password = String(form?.get("password") ?? "").slice(0, 200);
  if (!checkLogin(email, password)) return NextResponse.redirect(new URL("/login?error=1", req.url), 303);
  const res = NextResponse.redirect(new URL("/app", req.url), 303);
  res.cookies.set(SESSION_COOKIE, newSession(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
