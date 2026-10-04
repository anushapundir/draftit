import demo from "../data/demo-run.json";
import type { Prospect } from "../lib/pipeline";
import { pillBlack, pillBlue, pillWhite, ProductShot, SignalLine, Wordmark, type DemoRun } from "./ui";

const run = demo as DemoRun;
const prospects = run.events.map((e) => e.event).flatMap((e) => (e.type === "prospect" ? [e.prospect] : []));
const example: Prospect = prospects.find((p) => p.signalStatus === "verified")!;
const second: Prospect = prospects.filter((p) => p.signalStatus === "verified")[1] ?? example;

const host = (url: string) => new URL(url).hostname.replace(/^www\./, "");

function Vignette({ children }: { children: React.ReactNode }) {
  return <div className="flex h-44 items-center justify-center rounded-2xl border border-line bg-surface p-5">{children}</div>;
}

const steps: { title: string; body: string; ui: React.ReactNode }[] = [
  {
    title: "Paste your URL",
    body: "It reads your homepage and writes down who buys from you. You fix anything that is off.",
    ui: (
      <div className="shadow-soft flex w-full max-w-xs items-center gap-2 rounded-full border border-line bg-raised p-1.5 pl-4 text-sm">
        <span className="flex-1 truncate text-ink">{run.domain}</span>
        <span className={`${pillBlue} px-3.5 py-1.5 text-xs`}>Draft</span>
      </div>
    ),
  },
  {
    title: "It researches",
    body: "Ten companies that would buy, and one recent reason each, with the link it came from.",
    ui: (
      <div className="shadow-soft w-full max-w-xs rounded-2xl border border-line bg-raised p-3.5 text-left">
        <div className="flex items-center gap-2.5">
          <span className="grid size-6 place-items-center rounded-md border border-line bg-surface text-xs font-semibold">{second.name.charAt(0).toUpperCase()}</span>
          <span className="flex-1 truncate text-sm font-medium">{second.name}</span>
          <span className="grid size-4 place-items-center rounded-full bg-blue text-[9px] text-white">✓</span>
        </div>
        <p className="mt-2 line-clamp-2 text-xs leading-snug text-muted">{second.signal?.summary}</p>
        <span className="mt-2 inline-flex rounded-full bg-blue-soft px-2 py-0.5 text-[11px] font-medium text-blue-ink">Verified · {host(second.signal!.url)}</span>
      </div>
    ),
  },
  {
    title: "You approve",
    body: "Every draft waits for you. Edit, approve or skip, then export. Nothing is sent.",
    ui: (
      <div className="shadow-soft w-full max-w-xs rounded-2xl border border-line bg-raised p-3.5 text-left">
        <p className="truncate text-xs text-muted">Subject: {example.email.subject}</p>
        <div className="mt-2 space-y-1.5">
          <div className="h-1.5 w-full rounded-full bg-surface" />
          <div className="h-1.5 w-4/5 rounded-full bg-surface" />
          <div className="h-1.5 w-3/5 rounded-full bg-surface" />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className={`${pillBlack} px-3 py-1 text-xs`}>Approve</span>
          <span className="text-xs text-muted">Skip</span>
        </div>
      </div>
    ),
  },
];

export default function Landing() {
  return (
    <main className="overflow-x-clip">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <a href="/" aria-label="draftit home">
          <Wordmark />
        </a>
        <div className="flex items-center gap-2">
          <a href="/login" className="rounded-full px-3 py-2 text-sm text-muted transition hover:text-ink">
            Log in
          </a>
          <a href="/app" className={pillBlack}>
            Try the demo
          </a>
        </div>
      </nav>

      <section className="mx-auto max-w-3xl px-4 pb-14 pt-16 text-center sm:pt-24">
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-raised px-3 py-1 text-xs text-muted shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
          <span className="size-1.5 rounded-full bg-blue" />
          Open source · Drafts only, nothing is sent
        </span>
        <h1 className="mt-6 text-[40px] font-semibold leading-[1.05] tracking-[-0.045em] sm:text-[62px]">
          Outbound with a reason
          <br className="hidden sm:block" /> behind every email
        </h1>
        <p className="mx-auto mt-5 max-w-lg text-lg text-muted">Paste your URL. Get 10 researched prospects and first emails in your voice, ready to approve.</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a href="/app" className={pillBlue}>
            Try the demo
          </a>
          <a href="#how" className={`${pillWhite} px-5 py-2.5 text-[15px]`}>
            How it works
          </a>
        </div>
      </section>

      <section aria-label="Product preview" className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="sky rounded-[28px] p-3 sm:p-12 lg:px-16 lg:pt-16">
          <div className="shadow-float overflow-hidden rounded-2xl border border-white/60 bg-bg dark:border-white/10">
            <div className="flex items-center gap-1.5 border-b border-line px-4 py-3">
              <span className="size-2.5 rounded-full bg-line" />
              <span className="size-2.5 rounded-full bg-line" />
              <span className="size-2.5 rounded-full bg-line" />
              <span className="ml-3 truncate text-xs text-muted">Recorded run · {run.domain}</span>
            </div>
            <div className="pointer-events-none max-h-[620px] select-none overflow-hidden" inert>
              <ProductShot demo={run} />
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl scroll-mt-8 px-4 pt-28 sm:px-6 sm:pt-36">
        <h2 className="max-w-xl text-3xl font-semibold tracking-[-0.035em] sm:text-[40px] sm:leading-[1.1]">From a URL to a queue of drafts in two minutes</h2>
        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map((s) => (
            <li key={s.title} className="rounded-3xl border border-line bg-raised p-3">
              <Vignette>{s.ui}</Vignette>
              <div className="px-3 pb-3 pt-5">
                <h3 className="font-semibold tracking-[-0.01em]">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-28 sm:px-6 sm:pt-36 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 className="text-3xl font-semibold tracking-[-0.035em] sm:text-[40px] sm:leading-[1.1]">Every claim links to where it was found</h2>
          <p className="mt-5 max-w-md leading-relaxed text-muted">
            A signal only reaches an email if its source came back from a real web search. Anything else is dropped, counted on screen, and the email says nothing recent.
          </p>
        </div>
        <div className="rounded-[28px] bg-surface p-3 sm:p-6">
          <div className="shadow-soft rounded-3xl border border-line bg-raised p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-7 place-items-center rounded-lg border border-line bg-surface text-[13px] font-semibold">{example.name.charAt(0).toUpperCase()}</span>
              <div className="min-w-0">
                <p className="truncate font-semibold">{example.name}</p>
                <p className="truncate text-xs text-muted">{example.domain}</p>
              </div>
            </div>
            <SignalLine card={{ ...example, decision: "pending" }} />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-28 sm:px-6 sm:pt-36">
        <div className="rounded-[28px] bg-surface px-6 py-16 text-center sm:py-20">
          <h2 className="text-3xl font-semibold tracking-[-0.035em] sm:text-[40px]">See a real run in a minute</h2>
          <p className="mt-3 text-muted">No signup. It replays a recorded run.</p>
          <a href="/app" className={`${pillBlue} mt-8`}>
            Try the demo
          </a>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-4 pt-20 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-muted">
          <Wordmark />
          <div className="flex gap-5">
            <a href="/app" className="hover:text-ink">
              Demo
            </a>
            <a href="/login" className="hover:text-ink">
              Log in
            </a>
            <span>MIT license</span>
          </div>
        </div>
        <p aria-hidden className="wordmark-fade mt-6 select-none text-center text-[26vw] font-semibold leading-[0.8] tracking-[-0.06em] lg:text-[300px]">
          draftit
        </p>
      </footer>
    </main>
  );
}
