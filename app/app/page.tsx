import demo from "../../data/demo-run.json";
import { liveAccessConfigured } from "../../lib/access";
import { hasAgentKey } from "../../lib/env";
import { Wordmark, Workspace, type DemoRun } from "../ui";

export const dynamic = "force-dynamic";

export default function AppPage() {
  return (
    <main>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-8">
        <a href="/app" aria-label="draftit home">
          <Wordmark />
        </a>
        <form action="/api/logout" method="post">
          <button className="text-sm text-muted hover:text-ink">Log out</button>
        </form>
      </header>
      <Workspace live={hasAgentKey && liveAccessConfigured} demo={demo as DemoRun} />
    </main>
  );
}
