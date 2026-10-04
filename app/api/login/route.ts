import { NextResponse } from "next/server";
import { checkLogin, newSession, SESSION_COOKIE } from "../../../lib/access";

// Relative Location, so the redirect keeps whatever host the browser used (req.url can differ behind a proxy).
const see = (path: string) => new NextResponse(null, { status: 303, headers: { location: path } });

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const email = String(form?.get("email") ?? "").slice(0, 200);
  const password = String(form?.get("password") ?? "").slice(0, 200);
  if (!checkLogin(email, password)) return see("/login?error=1");
  const res = see("/app");
  res.cookies.set(SESSION_COOKIE, newSession(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
