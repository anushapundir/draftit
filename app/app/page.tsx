import demo from "../../data/demo-run.json";
import { liveAccessConfigured } from "../../lib/access";
import { hasAgentKey } from "../../lib/env";
import { pillWhite } from "../pills";
import { Wordmark, Workspace, type DemoRun } from "../ui";

export const dynamic = "force-dynamic";

export default function AppPage() {
  return (
    <main className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <a href="/app" aria-label="draftit home">
          <Wordmark />
        </a>
        <form action="/api/logout" method="post">
          <button className={pillWhite}>Log out</button>
        </form>
      </header>
      <Workspace live={hasAgentKey && liveAccessConfigured} demo={demo as DemoRun} />
    </main>
  );
}
