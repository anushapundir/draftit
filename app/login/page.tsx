import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hasSession, SESSION_COOKIE } from "../../lib/access";
import { env } from "../../lib/env";
import { FillDemo, Wordmark } from "../ui";

export const dynamic = "force-dynamic";

const field = "mt-1.5 block w-full rounded-xl border border-line bg-raised px-3.5 py-2.5 text-[15px] outline-none transition focus:border-accent/50 focus:ring-4 focus:ring-accent-soft";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (hasSession((await cookies()).get(SESSION_COOKIE)?.value)) redirect("/app");
  const { error } = await searchParams;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-surface px-4 py-12">
      <a href="/" aria-label="draftit home" className="mb-8">
        <Wordmark />
      </a>
      <div className="shadow-soft w-full max-w-sm rounded-3xl border border-line bg-raised p-6 sm:p-8">
        <h1 className="text-xl font-semibold tracking-[-0.02em]">Log in to draftit</h1>
        <p className="mt-1 text-sm text-muted">One shared demo account.</p>
        <form id="login" action="/api/login" method="post" className="mt-6">
          <label className="block text-sm font-medium">
            Email
            <input name="email" type="email" required autoComplete="username" className={field} />
          </label>
          <label className="mt-4 block text-sm font-medium">
            Password
            <input name="password" type="password" required autoComplete="current-password" className={field} />
          </label>
          {error && (
            <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
              That email and password do not match the demo account.
            </p>
          )}
          <button className="mt-6 w-full rounded-full bg-ink px-5 py-2.5 font-medium text-bg transition hover:opacity-85 active:scale-[0.98]">Continue</button>
        </form>
        <div className="mt-6 rounded-2xl bg-surface px-4 py-3 text-sm">
          <p className="text-muted">
            Demo: <span className="font-medium text-ink">{env.DEMO_EMAIL}</span> / <span className="font-medium text-ink">{env.DEMO_PASSWORD}</span>
          </p>
          <div className="mt-1">
            <FillDemo email={env.DEMO_EMAIL} password={env.DEMO_PASSWORD} />
          </div>
        </div>
      </div>
      <p className="mt-6 text-xs text-muted">A demo gate, not a real account system.</p>
    </main>
  );
}
