"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import type { PipelineEvent, Profile, Prospect, Stats } from "../lib/pipeline";
import { pillBlack, pillAccent, pillWhite } from "./pills";

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

// ---------- Shared bits ----------

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2 text-[17px] font-semibold tracking-[-0.02em]">
      <svg aria-hidden viewBox="0 0 32 32" className="size-6">
        <rect width="32" height="32" rx="9" className="fill-ink" />
        <path d="M10 17.5 14 21l8-10" fill="none" className="stroke-bg" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      draftit
    </span>
  );
}

function Check({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-lg border border-line bg-surface text-[13px] font-semibold text-ink">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

type Icon = CompanyStatus | "active" | "done";

function StatusIcon({ status }: { status: Icon }) {
  if (status === "searching" || status === "drafting" || status === "active")
    return <span aria-hidden className="spin size-4 shrink-0 rounded-full border-2 border-line border-t-ink" />;
  if (status === "done")
    return (
      <span aria-hidden className="grid size-4 shrink-0 place-items-center rounded-full bg-ink text-bg">
        <Check className="size-2.5" />
      </span>
    );
  if (status === "signal")
    return (
      <span aria-hidden className="grid size-4 shrink-0 place-items-center rounded-full bg-accent text-white">
        <Check className="size-2.5" />
      </span>
    );
  if (status === "failed" || status === "unverified")
    return <span aria-hidden className="grid size-4 shrink-0 place-items-center rounded-full border border-faint text-[10px] font-bold leading-none text-muted">!</span>;
  return <span aria-hidden className="size-4 shrink-0 rounded-full border border-dashed border-faint" />;
}

function VerifiedChip({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      title="This URL came back from the web search, so you can check the claim."
      className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-accent-soft py-1 pl-1.5 pr-2.5 text-xs font-medium text-accent-ink transition hover:brightness-95"
    >
      <span className="grid size-4 shrink-0 place-items-center rounded-full bg-accent text-white">
        <Check className="size-2.5" />
      </span>
      <span className="truncate">Verified · {host(url)}</span>
    </a>
  );
}

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

  const busy = s.phase === "understanding" || s.phase === "running";
  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
      <div className="flex items-center justify-between gap-3 rounded-full border border-line bg-surface py-1.5 pl-4 pr-1.5">
        <p className="flex min-w-0 items-center gap-2 text-sm">
          <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${busy ? "pulse bg-accent" : "bg-faint"}`} />
          <span className="truncate text-muted">
            {mode === "demo" ? "Recorded run" : "Live run"} · <span className="font-medium text-ink">{s.domain}</span>
          </span>
        </p>
        <button onClick={reset} className={pillWhite}>
          New run
        </button>
      </div>
      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
        <Feed state={s} />
        <section aria-label="Approval queue" className="min-w-0">
          {s.phase === "understanding" && <Waiting />}
          {s.phase === "review" && s.profile && <Review profile={s.profile} demo={mode === "demo"} onContinue={proceed} />}
          {s.phase === "error" && <p className="rounded-2xl border border-line bg-surface p-4 text-sm">{s.error}</p>}
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
  const [voiceOpen, setVoiceOpen] = useState(false);
  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-20 text-center sm:pt-32">
      <h1 className="text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Who should you email this week?</h1>
      <p className="mt-3 text-muted">Paste your site. Get ten researched prospects and first drafts.</p>
      <form
        className="mt-10 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          props.onStart(!props.live);
        }}
      >
        <div className="shadow-float flex items-center gap-2 rounded-[28px] border border-line bg-raised p-2 pl-5 transition focus-within:border-accent/40">
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
            className="min-w-0 flex-1 bg-transparent py-3 text-lg outline-none placeholder:text-faint focus-visible:outline-none"
          />
          <button className={`${pillAccent} shrink-0`}>
            {props.live ? "Draft" : "Play demo"}
            <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8h10M9 4l4 4-4 4" />
            </svg>
          </button>
        </div>
        {props.live && voiceOpen && (
          <textarea
            value={props.voice}
            onChange={(e) => props.setVoice(e.target.value)}
            maxLength={6000}
            rows={5}
            autoFocus
            aria-label="Your writing samples"
            placeholder="Paste 1 to 3 emails or posts you wrote. Drafts will sound like you."
            className="rise mt-3 w-full rounded-2xl border border-line bg-surface p-4 text-sm leading-relaxed outline-none focus:border-accent/40"
          />
        )}
      </form>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted">
        {props.live ? (
          <>
            <button onClick={() => setVoiceOpen((v) => !v)} className="hover:text-ink">
              {voiceOpen ? "Hide voice samples" : "+ Add your voice"}
            </button>
            <span aria-hidden className="text-faint">·</span>
            <button onClick={() => props.onStart(true)} className="hover:text-ink">
              Watch a recorded run
            </button>
          </>
        ) : (
          <span>Live runs are off here. This plays a real recorded run on {props.demoDomain}.</span>
        )}
      </div>
    </div>
  );
}

// ---------- Feed ----------

export function Feed({ state, still = false }: { state: Pick<State, "phase" | "steps" | "rows" | "cards">; still?: boolean }) {
  const drafted = new Set(state.cards.map((c) => c.domain));
  const busy = state.phase === "understanding" || state.phase === "running";
  const working = busy && (state.phase === "understanding" || state.rows.length === 0);
  const anim = still ? "" : "rise";
  return (
    <section aria-label="Research feed" className="min-w-0">
      <h2 className="text-sm font-medium">Research</h2>
      <ol className="mt-4 space-y-2.5 text-sm">
        {state.steps.map((step, i) => {
          const active = working && i === state.steps.length - 1;
          return (
            <li key={i} className={`flex items-center gap-3 ${anim}`}>
              <StatusIcon status={active ? "active" : "done"} />
              <span className={active ? "text-ink" : "text-muted"}>{active ? step : step.replace(/\.\.\.$/, "")}</span>
            </li>
          );
        })}
      </ol>
      {state.rows.length > 0 && (
        <ol className="mt-6 space-y-1">
          {state.rows.map((r) => {
            const st: Icon = drafted.has(r.domain) ? "done" : r.status;
            const found = (r.status === "drafting" ? r.prior : r.status) ?? r.status;
            const label = st === "done" ? "Drafted" : st === "drafting" ? "Drafting" : st === "searching" ? "Searching" : st === "queued" ? "Queued" : "";
            return (
              <li key={r.domain} className={`rounded-xl px-2 py-2.5 transition-colors ${st === "searching" || st === "drafting" ? "bg-surface" : ""} ${anim}`}>
                <div className="flex items-center gap-3">
                  <Avatar name={r.name} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.name}</span>
                  <span className="shrink-0 text-xs text-muted">{label}</span>
                  <StatusIcon status={found === "signal" && st === "done" ? "signal" : st} />
                </div>
                {(found === "signal" || found === "none" || found === "unverified" || found === "failed") && (
                  <div key={r.message} className={`mt-1.5 pl-10 text-[13px] leading-snug ${anim}`}>
                    {found === "signal" ? (
                      <>
                        <p className="line-clamp-2 text-ink/80">{r.message.replace(/^Signal found:\s*/, "")}</p>
                        {r.url && (
                          <a href={r.url} target="_blank" rel="noreferrer noopener" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent-ink hover:underline">
                            <Check className="size-3" />
                            {host(r.url)}
                          </a>
                        )}
                      </>
                    ) : (
                      <p className="text-muted">
                        {r.message}
                        {found === "unverified" && r.url ? ` (${host(r.url)} was never retrieved)` : ""}
                      </p>
                    )}
                  </div>
                )}
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
    <div className="rounded-2xl border border-line bg-surface p-8 text-center text-sm text-muted">
      <span className="pulse">Reading your site and working out who buys from you...</span>
    </div>
  );
}

// ---------- Review ----------

function Review({ profile, demo, onContinue }: { profile: Profile; demo: boolean; onContinue: (p: Profile) => void }) {
  const [summary, setSummary] = useState(profile.summary);
  const [icp, setIcp] = useState(profile.icp);
  const field = "grow mt-2 block min-h-24 w-full resize-none rounded-2xl border border-line bg-surface p-4 text-[15px] font-normal leading-relaxed outline-none transition focus:border-accent/40 focus:bg-raised";
  return (
    <form
      className="rise"
      onSubmit={(e) => {
        e.preventDefault();
        onContinue({ ...profile, summary: summary.trim(), icp: icp.trim() });
      }}
    >
      <h2 className="text-2xl font-semibold tracking-[-0.03em]">Is this who buys {profile.name}?</h2>
      <p className="mt-1 text-sm text-muted">Fix anything that is off. The search uses this.</p>
      <label className="mt-6 block text-sm font-medium">
        What you sell
        <textarea className={field} value={summary} onChange={(e) => setSummary(e.target.value)} minLength={10} maxLength={2000} required />
      </label>
      <label className="mt-5 block text-sm font-medium">
        Who buys it
        <textarea className={field} value={icp} onChange={(e) => setIcp(e.target.value)} minLength={10} maxLength={3000} required />
      </label>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button className={pillAccent}>Looks right, find prospects</button>
        {demo && <p className="text-sm text-muted">Recorded run: edits will not change results.</p>}
      </div>
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
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
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

  const stat = "inline-flex items-center gap-1.5 rounded-full border border-line bg-raised px-2.5 py-1";
  return (
    <div>
      <div className={still ? "" : "sticky top-0 z-10 -mx-2 bg-bg/90 px-2 pb-3 pt-3 backdrop-blur"}>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div>
            <h2 className="text-sm font-medium">Approval queue</h2>
            <p className="mt-0.5 text-sm text-muted">
              <span className="font-medium text-ink">{approved.length}</span> approved of {cards.length}
              {total > cards.length ? `, ${total - cards.length} in progress` : ""}
            </p>
          </div>
          {!still && (
            <div className="flex gap-2">
              <button onClick={copy} disabled={!approved.length} className={pillWhite}>
                {copied ? "Copied" : "Copy"}
              </button>
              <button onClick={() => exportCsv(approved)} disabled={!approved.length} className={pillWhite}>
                Export CSV
              </button>
            </div>
          )}
        </div>
        <p className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
          <span className={stat}>
            <span className="size-1.5 rounded-full bg-accent" />
            <span className="font-medium text-ink">{counts.verified}</span> verified
          </span>
          <span className={stat}>
            <span className="font-medium text-ink">{counts.dropped}</span> dropped as unverified
          </span>
          <span className={stat}>
            <span className="font-medium text-ink">{counts.none}</span> no recent signal
          </span>
          {counts.failed > 0 && (
            <span className={stat}>
              <span className="font-medium text-ink">{counts.failed}</span> failed
            </span>
          )}
        </p>
      </div>
      {cards.length === 0 && <p className="pulse mt-8 text-sm text-muted">Drafts appear here as each company is researched.</p>}
      <ol className="mt-3 space-y-4">
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
      <div className="mt-4">
        <p className="text-[15px] leading-snug">{card.signal.summary}</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <VerifiedChip url={card.signal.url} />
          <span className="rounded-full border border-line px-2.5 py-1 text-xs capitalize text-muted">{card.signal.kind}</span>
          <span className="text-xs text-muted">{card.signal.date}</span>
        </div>
      </div>
    );
  return (
    <p className="mt-4 inline-flex rounded-full border border-dashed border-line px-3 py-1 text-xs text-muted">
      {card.signalStatus === "dropped" ? "Signal dropped: source never retrieved. Fit-only email." : "No recent signal. Fit-only email."}
    </p>
  );
}

function ProspectCard({ card, onChange, still }: { card: Card; onChange: (patch: Partial<Card>) => void; still: boolean }) {
  const approved = card.decision === "approved";
  if (card.decision === "skipped")
    return (
      <li className="rise flex items-center justify-between gap-3 rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-muted">
        <span className="truncate">Skipped {card.name}</span>
        <button onClick={() => onChange({ decision: "pending" })} className="shrink-0 font-medium text-ink hover:underline">
          Undo
        </button>
      </li>
    );
  const edit = (email: Partial<Card["email"]>) => onChange({ email: { ...card.email, ...email } });
  return (
    <li className={`rounded-3xl border bg-raised p-5 transition-[border-color,box-shadow] duration-300 sm:p-6 ${approved ? "border-accent/50 shadow-[0_0_0_4px_var(--accent-soft)]" : "border-line"} ${still ? "" : "rise"}`}>
      <div className="flex items-center gap-3">
        <Avatar name={card.name} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold tracking-[-0.01em]">{card.name}</h3>
          <a href={`https://${card.domain}`} target="_blank" rel="noreferrer noopener" className="block truncate text-xs text-muted hover:text-ink">
            {card.domain}
          </a>
        </div>
      </div>
      <p className="mt-3 text-sm leading-snug text-muted">{card.fit}</p>
      <SignalLine card={card} />
      <div className="mt-5 rounded-2xl bg-surface p-4">
        <label className="flex items-baseline gap-2 border-b border-line pb-2.5 text-sm">
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
          className="grow mt-2.5 block w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none"
        />
      </div>
      {!still && (
        <div className="mt-4 flex items-center gap-2">
          {approved ? (
            <>
              <span className="rise inline-flex items-center gap-1.5 text-sm font-medium text-accent-ink">
                <span className="grid size-5 place-items-center rounded-full bg-accent text-white">
                  <Check className="size-3" />
                </span>
                Approved
              </span>
              <button onClick={() => onChange({ decision: "pending" })} className="ml-auto text-sm text-muted hover:text-ink">
                Edit
              </button>
            </>
          ) : (
            <>
              <button onClick={() => onChange({ decision: "approved" })} className={pillBlack}>
                Approve
              </button>
              <button onClick={() => onChange({ decision: "skipped" })} className="rounded-full px-3 py-2 text-sm text-muted transition hover:bg-surface hover:text-ink">
                Skip
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

// ---------- Landing helpers ----------

// The landing page's product shot: the real recorded run, folded to its final state and frozen.
export function ProductShot({ demo }: { demo: DemoRun }) {
  const end = demo.events.reduce((st, e) => reduce(st, e.event), { ...initial, phase: "understanding" } as State);
  const cards = end.cards.filter((c) => c.signal).slice(0, 2).map((c, i) => ({ ...c, decision: i === 0 ? ("approved" as const) : ("pending" as const) }));
  return (
    <div className="grid gap-8 p-5 sm:p-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10">
      <Feed state={{ ...end, rows: end.rows.slice(0, 7) }} still />
      <Queue cards={cards} stats={end.stats} total={cards.length} still />
    </div>
  );
}

export function FillDemo({ email, password }: { email: string; password: string }) {
  return (
    <button
      type="button"
      className="font-medium text-accent-ink hover:underline"
      onClick={() => {
        const form = document.getElementById("login") as HTMLFormElement | null;
        if (!form) return;
        (form.elements.namedItem("email") as HTMLInputElement).value = email;
        (form.elements.namedItem("password") as HTMLInputElement).value = password;
      }}
    >
      Fill them in
    </button>
  );
}
