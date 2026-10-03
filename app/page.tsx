import demo from "../data/demo-run.json";
import type { Prospect } from "../lib/pipeline";
import { ProductShot, SignalLine, Wordmark, type DemoRun } from "./ui";

const run = demo as DemoRun;
const example = run.events.map((e) => e.event).find((e): e is { type: "prospect"; prospect: Prospect } => e.type === "prospect" && e.prospect.signalStatus === "verified")!.prospect;

const cta = "inline-flex items-center rounded-full bg-accent px-5 py-2.5 font-medium text-accent-ink transition active:scale-[0.98] hover:brightness-105";

const steps = [
  ["Paste your URL", "It reads your homepage and writes down what you sell and who buys it. You check it and fix anything that is off."],
  ["The agent researches", "It searches for ten companies that would buy, then looks for one recent reason each of them needs you now."],
  ["You approve", "Every draft waits in a queue. Edit it, approve it or skip it. Nothing is ever sent for you."],
];

export default function Landing() {
  return (
    <main>
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-8">
        <a href="/" aria-label="draftit home">
          <Wordmark />
        </a>
        <div className="flex items-center gap-5 text-sm">
          <a href="/login" className="text-muted transition hover:text-ink">
            Log in
          </a>
          <a href="/app" className="rounded-full bg-ink px-4 py-2 font-medium text-bg transition hover:opacity-90">
            Try the demo
          </a>
        </div>
      </nav>

      <section className="mx-auto max-w-6xl px-4 pb-14 pt-16 sm:px-8 sm:pt-28">
        <h1 className="max-w-4xl font-display text-[52px] leading-[0.98] tracking-tight sm:text-[88px]">
          Outbound that starts with <span className="whitespace-nowrap italic text-accent">a reason</span>.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted sm:text-xl">
          Paste your URL. Get 10 researched prospects and first emails in your voice, ready to approve.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-5">
          <a href="/app" className={cta}>
            Try the demo
          </a>
          <a href="#how" className="text-sm font-medium text-muted transition hover:text-ink">
            How it works ↓
          </a>
        </div>
      </section>

      <section aria-label="Product preview" className="mx-auto max-w-6xl px-4 sm:px-8">
        <div className="overflow-hidden rounded-2xl border border-line bg-bg shadow-[0_24px_60px_-30px_rgba(40,25,10,0.25)]">
          <div className="flex items-center gap-2 border-b border-line bg-panel px-4 py-3">
            <span className="size-2.5 rounded-full bg-line" />
            <span className="size-2.5 rounded-full bg-line" />
            <span className="size-2.5 rounded-full bg-line" />
            <span className="ml-3 truncate font-mono text-xs text-muted">A recorded run for {run.domain}</span>
          </div>
          <div className="pointer-events-none max-h-[640px] overflow-hidden select-none">
            <ProductShot demo={run} />
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl scroll-mt-8 px-4 pt-28 sm:px-8 sm:pt-36">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">How it works</p>
        <h2 className="mt-3 max-w-2xl font-display text-4xl leading-tight tracking-tight sm:text-5xl">Two minutes from a URL to a queue of drafts.</h2>
        <ol className="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-8">
          {steps.map(([title, body], i) => (
            <li key={title} className="border-t border-line pt-5">
              <span className="font-mono text-xs text-accent">0{i + 1}</span>
              <h3 className="mt-3 text-lg font-semibold tracking-tight">{title}</h3>
              <p className="mt-2 leading-relaxed text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto grid max-w-6xl gap-12 px-4 pt-28 sm:px-8 sm:pt-36 lg:grid-cols-2 lg:gap-16">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">The verified-source rule</p>
          <h2 className="mt-3 font-display text-4xl leading-tight tracking-tight sm:text-5xl">Every claim links to where it was found.</h2>
          <p className="mt-6 text-lg leading-relaxed text-muted">
            Generic emails get ignored because they are not about anything. Made-up ones are worse. So a signal only reaches an email if its source URL actually came back from a web search.
          </p>
          <p className="mt-4 text-lg leading-relaxed text-muted">
            If the agent cites a page it never retrieved, the signal is dropped, counted on screen, and the email falls back to fit alone, clearly labelled.
          </p>
        </div>
        <div className="self-center rounded-2xl border border-line bg-panel p-5 sm:p-6">
          <p className="flex items-baseline justify-between gap-3">
            <span className="text-lg font-semibold tracking-tight">{example.name}</span>
            <span className="font-mono text-xs text-muted">{example.domain}</span>
          </p>
          <SignalLine card={{ ...example, decision: "pending" }} />
          <ul className="mt-5 space-y-2.5 text-sm">
            <li className="flex gap-3">
              <span aria-hidden className="mt-[7px] size-2 shrink-0 rounded-full bg-good" />
              Source returned by the search: shown with a verified chip.
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="mt-[7px] size-2 shrink-0 rounded-full bg-accent" />
              Source the model typed itself: retried once, then dropped and counted.
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="mt-[7px] size-2 shrink-0 rounded-full bg-line" />
              Nothing recent found: the email says nothing about recent news.
            </li>
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-28 text-center sm:px-8 sm:py-36">
        <h2 className="mx-auto max-w-2xl font-display text-4xl leading-tight tracking-tight sm:text-6xl">See a real run in under a minute.</h2>
        <a href="/app" className={`${cta} mt-9`}>
          Try the demo
        </a>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-8 text-sm text-muted sm:px-8">
        <Wordmark />
        <span>Open source, MIT licensed. Drafts only, nothing is sent.</span>
      </footer>
    </main>
  );
}
