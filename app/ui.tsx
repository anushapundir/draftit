"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import type { PipelineEvent, Profile, Prospect, Stats } from "../lib/pipeline";

export type DemoRun = { domain: string; durationMs: number; events: { t: number; event: PipelineEvent }[] };

type CompanyStatus = Extract<PipelineEvent, { type: "company" }>["status"] | "queued";
type Row = { domain: string; name: string; status: CompanyStatus; message: string; url?: string; prior?: CompanyStatus };
type Decision = "pending" | "approved" | "skipped";
export type Card = Prospect & { decision: Decision };
type Phase = "idle" | "understanding" | "review" | "running" | "done" | "error";
type State = { phase: Phase; steps: string[]; domain: string; profile: Profile | null; rows: Row[]; cards: Card[]; stats: Stats | null; error: string | null };

type Action = PipelineEvent | { type: "start"; domain: string } | { type: "continue"; profile: Profile } | { type: "reset" } | { type: "card"; domain: string; patch: Partial<Card> };

const initial: State = { phase: "idle", steps: [], domain: "", profile: null, rows: [], cards: [], stats: null, error: null };

function reduce(s: State, a: Action): State {
  switch (a.type) {
    case "reset":
      return initial;
    case "start":
      return { ...initial, phase: "understanding", domain: a.domain };
    case "continue":
      return { ...s, phase: "running", profile: a.profile };
    case "step":
      return { ...s, steps: [...s.steps, a.message] };
    case "profile":
      return { ...s, phase: "review", domain: a.domain, profile: a.profile };
    case "companies":
      return {
        ...s,
        steps: [...s.steps, `Found ${a.companies.length} companies that would buy${a.rejected.length ? `, skipped ${a.rejected.length}` : ""}`],
        rows: a.companies.map((c) => ({ domain: c.domain, name: c.name, status: "queued", message: "Waiting" })),
      };
    case "company":
      return {
        ...s,
        // While drafting, keep showing what research found instead of a generic "Drafting".
        rows: s.rows.map((r) => (r.domain !== a.domain ? r : a.status === "drafting" ? { ...r, status: a.status, prior: r.status } : { ...r, status: a.status, message: a.message, url: a.url })),
      };
    case "prospect":
      return { ...s, cards: [...s.cards, { ...a.prospect, decision: "pending" }] };
    case "card":
      return { ...s, cards: s.cards.map((c) => (c.domain === a.domain ? { ...c, ...a.patch } : c)) };
    case "done":
      return { ...s, phase: "done", stats: a.stats };
    case "error":
      return { ...s, phase: "error", error: a.message };
  }
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(id), reject(signal.reason)), { once: true });
  });

// Plays the recorded events back at roughly 4x, so a two-minute run reads in about half a minute.
async function replay(events: DemoRun["events"], dispatch: (a: Action) => void, signal: AbortSignal) {
  for (let i = 0; i < events.length; i++) {
    const gap = i === 0 ? 300 : (events[i]!.t - events[i - 1]!.t) / 4;
    await sleep(Math.min(Math.max(gap, 160), 2200), signal);
    dispatch(events[i]!.event);
  }
}

async function streamLive(body: object, dispatch: (a: Action) => void, signal: AbortSignal) {
  const token = new URLSearchParams(window.location.search).get("token");
  const res = await fetch("/api/pipeline", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-demo-token": token } : {}) },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? "Could not start the run");
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) dispatch(JSON.parse(line) as PipelineEvent);
  }
}

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

// ---------- App ----------

export function Workspace({ live, demo }: { live: boolean; demo: DemoRun }) {
  const [s, dispatch] = useReducer(reduce, initial);
  const [mode, setMode] = useState<"live" | "demo">(live ? "live" : "demo");
  const [url, setUrl] = useState(live ? "" : demo.domain);
  const [voice, setVoice] = useState("");
  const abort = useRef<AbortController | null>(null);
  const split = demo.events.findIndex((e) => e.event.type === "profile") + 1;

  useEffect(() => () => abort.current?.abort(), []);

  async function go(run: (signal: AbortSignal) => Promise<void>) {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    try {
      await run(controller.signal);
    } catch (err) {
      if (!controller.signal.aborted) dispatch({ type: "error", message: err instanceof Error ? err.message : "Something went wrong" });
    }
  }

  function start(asDemo: boolean) {
    const m = asDemo || !live ? "demo" : "live";
    setMode(m);
    if (m === "demo") setUrl(demo.domain);
    dispatch({ type: "start", domain: m === "demo" ? demo.domain : url.trim() });
    go((signal) => (m === "demo" ? replay(demo.events.slice(0, split), dispatch, signal) : streamLive({ stage: "understand", url: url.trim() }, dispatch, signal)));
  }

  function proceed(profile: Profile) {
    dispatch({ type: "continue", profile });
    go((signal) =>
      mode === "demo" ? replay(demo.events.slice(split), dispatch, signal) : streamLive({ stage: "run", url: s.domain, profile, voice }, dispatch, signal),
    );
  }

  function reset() {
    abort.current?.abort();
    dispatch({ type: "reset" });
  }

  if (s.phase === "idle")
    return <Start live={live} url={url} setUrl={setUrl} voice={voice} setVoice={setVoice} onStart={start} demoDomain={demo.domain} />;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-4">
        <p className="min-w-0 text-sm text-muted">
          {mode === "demo" ? "Replaying a recorded run for " : "Live run for "}
          <span className="font-medium text-ink">{s.domain}</span>
        </p>
        <button onClick={reset} className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
          Start over
        </button>
      </div>
      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
        <Feed state={s} />
        <section aria-label="Approval queue" className="min-w-0">
          {s.phase === "understanding" && <Waiting />}
          {s.phase === "review" && s.profile && <Review profile={s.profile} demo={mode === "demo"} onContinue={proceed} />}
          {s.phase === "error" && <p className="rounded-lg border border-line bg-panel p-4 text-sm">{s.error}</p>}
          {(s.phase === "running" || s.phase === "done" || (s.phase === "error" && s.cards.length > 0)) && (
            <Queue cards={s.cards} stats={s.stats} total={s.rows.length} onChange={(domain, patch) => dispatch({ type: "card", domain, patch })} />
          )}
        </section>
      </div>
    </div>
  );
}

function Start(props: {
  live: boolean;
  url: string;
  setUrl: (v: string) => void;
  voice: string;
  setVoice: (v: string) => void;
  onStart: (demo: boolean) => void;
  demoDomain: string;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-16 sm:px-8 sm:pt-28">
      <h1 className="font-display text-5xl leading-[1.02] tracking-tight sm:text-6xl">Who should you email this week?</h1>
      <p className="mt-4 text-lg text-muted">Paste your site. The agent finds ten companies that would buy, a recent reason for each, and drafts a first email you can approve.</p>
      <form
        className="mt-10"
        onSubmit={(e) => {
          e.preventDefault();
          props.onStart(!props.live);
        }}
      >
        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-panel p-2 shadow-[0_1px_0_rgba(0,0,0,0.03)] focus-within:border-ink/30 sm:flex-row">
          <label className="sr-only" htmlFor="url">
            Your website
          </label>
          <input
            id="url"
            value={props.url}
            onChange={(e) => props.setUrl(e.target.value)}
            readOnly={!props.live}
            required
            minLength={3}
            maxLength={300}
            placeholder="yourstartup.com"
            autoComplete="url"
            className="min-w-0 flex-1 bg-transparent px-3 py-3 text-lg outline-none placeholder:text-muted/60"
          />
          <button className="rounded-xl bg-accent px-5 py-3 font-medium text-accent-ink transition active:scale-[0.98] hover:brightness-105">
            {props.live ? "Draft my pipeline" : "Watch the demo run"}
          </button>
        </div>
        {props.live ? (
          <details className="group mt-4">
            <summary className="cursor-pointer list-none text-sm text-muted hover:text-ink">
              <span className="mr-1 inline-block transition group-open:rotate-90">›</span> Add your voice (optional)
            </summary>
            <textarea
              value={props.voice}
              onChange={(e) => props.setVoice(e.target.value)}
              maxLength={6000}
              rows={5}
              placeholder="Paste 1 to 3 emails or posts you have written. Drafts will match how you write."
              className="mt-3 w-full rounded-xl border border-line bg-panel p-3 text-sm leading-relaxed outline-none focus:border-ink/30"
            />
          </details>
        ) : (
          <p className="mt-4 text-sm text-muted">Live runs need an API key on the server. This replays a real recorded run on {props.demoDomain}.</p>
        )}
      </form>
      {props.live && (
        <button onClick={() => props.onStart(true)} className="mt-8 text-sm font-medium text-accent underline-offset-4 hover:underline">
          Or watch a recorded demo run →
        </button>
      )}
    </div>
  );
}

// ---------- Feed ----------

function Dot({ status }: { status: CompanyStatus | "active" | "done" }) {
  const cls =
    status === "signal" || status === "done"
      ? "bg-good"
      : status === "searching" || status === "drafting" || status === "active"
        ? "bg-accent pulse"
        : status === "unverified" || status === "failed"
          ? "bg-accent"
          : "bg-line";
  return <span aria-hidden className={`mt-[7px] size-2 shrink-0 rounded-full ${cls}`} />;
}

export function Feed({ state, still = false }: { state: Pick<State, "phase" | "steps" | "rows" | "cards">; still?: boolean }) {
  const drafted = new Set(state.cards.map((c) => c.domain));
  const busy = state.phase === "understanding" || state.phase === "running";
  const working = busy && (state.phase === "understanding" || state.rows.length === 0);
  return (
    <section aria-label="Live research feed" className="min-w-0">
      <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Research feed</h2>
      <ol className="mt-4 space-y-2.5 font-mono text-[13px] leading-5">
        {state.steps.map((step, i) => (
          <li key={i} className={`flex gap-3 ${still ? "" : "rise"}`}>
            <Dot status={working && i === state.steps.length - 1 ? "active" : "done"} />
            <span className={working && i === state.steps.length - 1 ? "text-ink" : "text-muted"}>{step}</span>
          </li>
        ))}
      </ol>
      {state.rows.length > 0 && (
        <ol className="mt-6 divide-y divide-line border-y border-line">
          {state.rows.map((r) => {
            const st = drafted.has(r.domain) ? "done" : r.status;
            const found = (r.status === "drafting" ? r.prior : r.status) ?? r.status;
            return (
              <li key={r.domain} className={`flex gap-3 py-3 ${still ? "" : "rise"}`}>
                <Dot status={st} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-medium">{r.name}</span>
                    <span className="shrink-0 font-mono text-xs text-muted">{st === "done" ? "Drafted" : st === "drafting" ? "Drafting..." : r.domain}</span>
                  </p>
                  <p key={r.message} className={`mt-0.5 text-sm leading-snug ${found === "signal" ? "text-ink" : "text-muted"} ${still ? "" : "rise"}`}>
                    {r.message}
                    {r.url && found === "signal" && (
                      <>
                        {" "}
                        <a href={r.url} target="_blank" rel="noreferrer noopener" className="whitespace-nowrap text-good underline-offset-2 hover:underline">
                          {host(r.url)} ↗
                        </a>
                      </>
                    )}
                    {r.url && found === "unverified" && <span className="whitespace-nowrap font-mono text-xs"> ({host(r.url)}, not retrieved)</span>}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function Waiting() {
  return (
    <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">
      <span className="pulse">Reading your site and working out who buys from you...</span>
    </div>
  );
}

// ---------- Review ----------

function Review({ profile, demo, onContinue }: { profile: Profile; demo: boolean; onContinue: (p: Profile) => void }) {
  const [summary, setSummary] = useState(profile.summary);
  const [icp, setIcp] = useState(profile.icp);
  const field = "grow mt-2 block min-h-24 w-full resize-none rounded-xl border border-line bg-panel p-3.5 text-[15px] leading-relaxed outline-none focus:border-ink/30";
  return (
    <form
      className="rise"
      onSubmit={(e) => {
        e.preventDefault();
        onContinue({ ...profile, summary: summary.trim(), icp: icp.trim() });
      }}
    >
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Check before we search</p>
      <h2 className="mt-2 font-display text-3xl leading-tight">Is this who buys {profile.name}?</h2>
      <label className="mt-6 block text-sm font-medium">
        What you sell
        <textarea className={field} value={summary} onChange={(e) => setSummary(e.target.value)} minLength={10} maxLength={2000} required />
      </label>
      <label className="mt-5 block text-sm font-medium">
        Who buys it
        <textarea className={`${field} font-normal`} value={icp} onChange={(e) => setIcp(e.target.value)} minLength={10} maxLength={3000} required />
      </label>
      {demo && <p className="mt-3 text-sm text-muted">This is a recording, so edits here will not change the results.</p>}
      <button className="mt-6 w-full rounded-xl bg-accent px-5 py-3 font-medium text-accent-ink transition active:scale-[0.98] hover:brightness-105 sm:w-auto">
        Looks right, find prospects
      </button>
    </form>
  );
}

// ---------- Queue ----------

// Verified signals first: those are the emails with a real reason to send.
const byStrength = (a: Card, b: Card) => Number(!a.signal) - Number(!b.signal);

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;

function exportCsv(cards: Card[]) {
  const rows = [
    ["company", "domain", "signal", "signal_source", "subject", "body"],
    ...cards.map((c) => [c.name, c.domain, c.signal?.summary ?? "", c.signal?.url ?? "", c.email.subject, c.email.body]),
  ];
  const blob = new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "approved-emails.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

export function Queue({ cards, stats, total, onChange, still = false }: { cards: Card[]; stats: Stats | null; total: number; onChange?: (domain: string, patch: Partial<Card>) => void; still?: boolean }) {
  const approved = cards.filter((c) => c.decision === "approved");
  const [copied, setCopied] = useState(false);
  const counts = stats ?? {
    verified: cards.filter((c) => c.signalStatus === "verified").length,
    dropped: cards.filter((c) => c.signalStatus === "dropped").length,
    none: cards.filter((c) => c.signalStatus === "none").length,
    failed: 0,
  };

  async function copy() {
    const text = approved.map((c) => `To: ${c.name} team (${c.domain})\nSubject: ${c.email.subject}\n\n${c.email.body}`).join("\n\n---\n\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div>
      <div className={still ? "" : "sticky top-0 z-10 -mx-1 bg-bg px-1 pt-3"}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Approval queue</h2>
          <p className="mt-1.5 text-sm">
            <span className="font-medium">{approved.length}</span> approved
            <span className="text-muted">
              {" "}
              of {cards.length}
              {total > cards.length ? ` drafted, ${total - cards.length} in progress` : ""}
            </span>
          </p>
        </div>
        {!still && (
          <div className="flex gap-2">
            <button onClick={copy} disabled={!approved.length} className="rounded-lg border border-line bg-panel px-3 py-1.5 text-sm transition hover:border-ink/30 disabled:opacity-40">
              {copied ? "Copied" : "Copy approved"}
            </button>
            <button onClick={() => exportCsv(approved)} disabled={!approved.length} className="rounded-lg border border-line bg-panel px-3 py-1.5 text-sm transition hover:border-ink/30 disabled:opacity-40">
              Export CSV
            </button>
          </div>
        )}
      </div>
      <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-y border-line py-2.5 font-mono text-xs text-muted">
        <span>
          <span className="text-good">{counts.verified}</span> verified signals
        </span>
        <span>
          <span className={counts.dropped ? "text-accent" : ""}>{counts.dropped}</span> dropped as unverified
        </span>
        <span>{counts.none} with no recent signal</span>
        {counts.failed > 0 && <span>{counts.failed} failed</span>}
      </p>
      </div>
      {cards.length === 0 && <p className="mt-8 text-sm text-muted pulse">Drafts appear here as each company is researched.</p>}
      <ol className="mt-5 space-y-4">
        {[...cards].sort(byStrength).map((c) => (
          <ProspectCard key={c.domain} card={c} still={still} onChange={(patch) => onChange?.(c.domain, patch)} />
        ))}
      </ol>
    </div>
  );
}

export function SignalLine({ card }: { card: Card }) {
  if (card.signal)
    return (
      <div className="mt-3 rounded-xl bg-sunk p-3 text-sm leading-snug">
        <p>{card.signal.summary}</p>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <a
            href={card.signal.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 rounded-full bg-good-soft px-2.5 py-1 font-medium text-good transition hover:brightness-95"
            title="This URL was returned by the web search, so the claim can be checked."
          >
            <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 fill-current">
              <path d="M8 1.5 2.5 3.8v3.6c0 3.3 2.3 6.3 5.5 7.1 3.2-.8 5.5-3.8 5.5-7.1V3.8L8 1.5Zm-1 9.6L4.6 8.7l1-1L7 9.1l3.4-3.4 1 1L7 11.1Z" />
            </svg>
            Verified source · {host(card.signal.url)}
          </a>
          <span className="text-muted">
            {card.signal.kind}, {card.signal.date}
          </span>
        </p>
      </div>
    );
  return (
    <p className="mt-3 rounded-xl bg-sunk p-3 text-sm text-muted">
      {card.signalStatus === "dropped" ? "Signal dropped: its source was not in the search results. Fit-only email." : "No recent signal. Fit-only email."}
    </p>
  );
}

function ProspectCard({ card, onChange, still }: { card: Card; onChange: (patch: Partial<Card>) => void; still: boolean }) {
  const skipped = card.decision === "skipped";
  const approved = card.decision === "approved";
  if (skipped)
    return (
      <li className="rise flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3 text-sm text-muted">
        <span className="truncate">
          <span className="line-through">{card.name}</span> skipped
        </span>
        <button onClick={() => onChange({ decision: "pending" })} className="shrink-0 font-medium text-ink underline-offset-4 hover:underline">
          Undo
        </button>
      </li>
    );
  const edit = (email: Partial<Card["email"]>) => onChange({ email: { ...card.email, ...email } });
  return (
    <li className={`rounded-2xl border bg-panel p-4 transition-colors sm:p-5 ${approved ? "border-accent/60" : "border-line"} ${still ? "" : "rise"}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="truncate text-lg font-semibold tracking-tight">{card.name}</h3>
        <a href={`https://${card.domain}`} target="_blank" rel="noreferrer noopener" className="shrink-0 font-mono text-xs text-muted hover:text-ink">
          {card.domain}
        </a>
      </div>
      <p className="mt-1 text-sm leading-snug text-muted">{card.fit}</p>
      <SignalLine card={card} />
      <div className="mt-4 border-t border-line pt-3">
        <label className="flex items-baseline gap-2 text-sm">
          <span className="text-muted">Subject</span>
          <input
            value={card.email.subject}
            onChange={(e) => edit({ subject: e.target.value })}
            readOnly={still || approved}
            className="min-w-0 flex-1 bg-transparent font-medium outline-none"
          />
        </label>
        <textarea
          value={card.email.body}
          onChange={(e) => edit({ body: e.target.value })}
          readOnly={still || approved}
          aria-label={`Email to ${card.name}`}
          rows={still ? 6 : 10}
          className="grow mt-2 block w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none"
        />
      </div>
      {!still && (
        <div className="mt-3 flex items-center gap-2">
          {approved ? (
            <>
              <span className="rise inline-flex items-center gap-1.5 text-sm font-medium text-accent">
                <svg aria-hidden viewBox="0 0 16 16" className="size-4 fill-current">
                  <path d="M6.2 11.6 2.8 8.2l1-1 2.4 2.4 6-6 1 1-7 7Z" />
                </svg>
                Approved
              </span>
              <button onClick={() => onChange({ decision: "pending" })} className="ml-auto text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
                Edit
              </button>
            </>
          ) : (
            <>
              <button onClick={() => onChange({ decision: "approved" })} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-bg transition active:scale-[0.97] hover:opacity-90">
                Approve
              </button>
              <button onClick={() => onChange({ decision: "skipped" })} className="rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-sunk hover:text-ink">
                Skip
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

// ---------- Login helper ----------

export function FillDemo({ email, password }: { email: string; password: string }) {
  return (
    <button
      type="button"
      className="font-medium text-accent underline-offset-4 hover:underline"
      onClick={() => {
        const form = document.getElementById("login") as HTMLFormElement | null;
        if (!form) return;
        (form.elements.namedItem("email") as HTMLInputElement).value = email;
        (form.elements.namedItem("password") as HTMLInputElement).value = password;
      }}
    >
      Fill demo credentials
    </button>
  );
}

// ---------- Shared bits ----------

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[17px] font-semibold tracking-tight">
      <span aria-hidden className="size-2.5 rounded-full bg-accent" />
      draftit
    </span>
  );
}

// The landing page's product shot: the real recorded run, folded to its final state and frozen.
export function ProductShot({ demo }: { demo: DemoRun }) {
  const end = demo.events.reduce((st, e) => reduce(st, e.event), { ...initial, phase: "understanding" } as State);
  const cards = end.cards.filter((c) => c.signal).slice(0, 2).map((c, i) => ({ ...c, decision: i === 0 ? ("approved" as const) : ("pending" as const) }));
  return (
    <div className="grid gap-8 p-5 sm:p-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10">
      <Feed state={end} still />
      <Queue cards={cards} stats={end.stats} total={cards.length} still />
    </div>
  );
}
