import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hasSession, SESSION_COOKIE } from "../../lib/access";
import { env } from "../../lib/env";
import { FillDemo, Wordmark } from "../ui";

export const dynamic = "force-dynamic";

const field = "mt-2 block w-full rounded-xl border border-line bg-panel px-3.5 py-3 text-[15px] outline-none transition focus:border-ink/30";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (hasSession((await cookies()).get(SESSION_COOKIE)?.value)) redirect("/app");
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col px-4 py-6">
      <a href="/" aria-label="draftit home">
        <Wordmark />
      </a>
      <div className="my-auto py-16">
        <h1 className="font-display text-4xl tracking-tight">Log in</h1>
        <p className="mt-2 text-muted">This is a demo account, shared by everyone.</p>
        <form id="login" action="/api/login" method="post" className="mt-8">
          <label className="block text-sm font-medium">
            Email
            <input name="email" type="email" required autoComplete="username" className={field} />
          </label>
          <label className="mt-4 block text-sm font-medium">
            Password
            <input name="password" type="password" required autoComplete="current-password" className={field} />
          </label>
          {error && (
            <p role="alert" className="mt-4 text-sm text-accent">
              That email and password do not match the demo account.
            </p>
          )}
          <button className="mt-6 w-full rounded-xl bg-accent px-5 py-3 font-medium text-accent-ink transition active:scale-[0.98] hover:brightness-105">Log in</button>
        </form>
        <div className="mt-8 rounded-xl border border-dashed border-line p-4 text-sm">
          <p className="text-muted">Demo credentials</p>
          <p className="mt-1 font-mono text-[13px]">
            {env.DEMO_EMAIL} / {env.DEMO_PASSWORD}
          </p>
          <div className="mt-2">
            <FillDemo email={env.DEMO_EMAIL} password={env.DEMO_PASSWORD} />
          </div>
        </div>
      </div>
    </main>
  );
}
