import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

// Open only under `next dev`; any other environment fails closed.
const isDev = process.env.NODE_ENV === "development";

// Live mode spends API credits and fetches arbitrary URLs, so a deployment needs a shared token.
export const liveAccessConfigured = isDev || Boolean(env.DEMO_ACCESS_TOKEN);

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function hasLiveAccess(req: Request): boolean {
  if (isDev) return true;
  const expected = env.DEMO_ACCESS_TOKEN;
  const given = req.headers.get("x-demo-token");
  return Boolean(expected && given && same(expected, given));
}

// A demo gate, not real auth: one shared login, and the cookie is a value only the server can derive.
export const SESSION_COOKIE = "draftit_session";
const sessionValue = () => createHmac("sha256", `${env.DEMO_EMAIL}:${env.DEMO_PASSWORD}`).update("draftit demo session").digest("hex");

export const checkLogin = (email: string, password: string) =>
  same(email.trim().toLowerCase(), env.DEMO_EMAIL.toLowerCase()) && same(password, env.DEMO_PASSWORD);

export const newSession = () => sessionValue();
export const hasSession = (cookie: string | undefined) => Boolean(cookie && same(cookie, sessionValue()));
