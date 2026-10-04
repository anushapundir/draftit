import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "../../../lib/access";

// Relative Location, so the redirect keeps whatever host the browser used (req.url can differ behind a proxy).
const see = (path: string) => new NextResponse(null, { status: 303, headers: { location: path } });

export async function POST() {
  const res = see("/");
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
