import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { cleanTargets, cleanText, retrievedUrls, verifySignal, wordCount, type Candidate } from "./checks";
import { logUsage } from "./cost";
import { env } from "./env";
import { fetchHomepage, InputError, pageText, parseSiteUrl } from "./site";

const PAGE_CHARS = 4000;
const TARGETS = 10;
const FIND_SEARCHES = 5;
const RESEARCH_SEARCHES = 3;
const MAX_ROUNDS = 4;
const CONCURRENCY = 3;
const MAX_WORDS = 120;

export type Profile = { name: string; summary: string; icp: string };
export type Signal = { kind: string; summary: string; date: string; url: string };
export type Prospect = Candidate & {
  signal: Signal | null;
  // "dropped": the model cited a source the search never returned, so the claim was thrown away.
  signalStatus: "verified" | "none" | "dropped";
  email: { subject: string; body: string };
};
export type Stats = { verified: number; dropped: number; none: number; failed: number };

export type PipelineEvent =
  | { type: "step"; message: string }
  | { type: "profile"; domain: string; profile: Profile }
  | { type: "companies"; companies: Candidate[]; rejected: { name: string; domain: string; reason: string }[] }
  | { type: "company"; domain: string; status: "searching" | "signal" | "unverified" | "none" | "drafting" | "failed"; message: string; url?: string }
  | { type: "prospect"; prospect: Prospect }
  | { type: "done"; stats: Stats }
  | { type: "error"; message: string };

export type Emit = (event: PipelineEvent) => void;

let client: Anthropic | undefined;
const anthropic = () => (client ??= new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    defaultHeaders: env.ANTHROPIC_WORKSPACE_ID ? { "anthropic-workspace-id": env.ANTHROPIC_WORKSPACE_ID } : undefined,
  }));

const today = () => new Date().toISOString().slice(0, 10);

const HOUSE_STYLE = "Never use em dashes. Never name individual people and never include email addresses.";

// ---------- 1. Understand ----------

const ProfileOutput = z.object({
  name: z.string().describe("The product or company name."),
  summary: z.string().describe("Two or three plain sentences: what it sells, to whom, and the problem it solves."),
  buyer: z.string().describe("Who buys it: the kind of company and the team or role that owns the purchase."),
  size: z.string().describe("Typical buyer company size and stage."),
  signals: z.array(z.string()).describe("Three to five observable events that mean a company needs this now, e.g. a specific kind of job post or launch."),
});

export async function understand(input: string, emit: Emit, signal?: AbortSignal): Promise<{ domain: string; profile: Profile }> {
  emit({ type: "step", message: "Reading homepage..." });
  const { url, html } = await fetchHomepage(parseSiteUrl(input));
  const page = pageText(html);
  const domain = url.hostname.replace(/^www\./, "");
  if (page.text.length < 80) throw new InputError("Could not read enough text from that homepage");
  emit({ type: "step", message: `Read ${wordCount(page.text).toLocaleString("en-US")} words from ${domain}` });
  emit({ type: "step", message: "Working out who buys it..." });

  const res = await anthropic().messages.parse(
    {
      model: env.DRAFTIT_MODEL,
      max_tokens: 4000,
      output_config: { effort: "low", format: zodOutputFormat(ProfileOutput) },
      system: `You read a company's homepage and describe what it sells and its ideal customer profile (ICP) for outbound sales. Be specific and concrete, no marketing language. ${HOUSE_STYLE}`,
      messages: [{ role: "user", content: `Website: ${domain}\nTitle: ${page.title}\nHomepage text:\n${page.text.slice(0, PAGE_CHARS)}` }],
    },
    { signal },
  );
  logUsage("understand", env.DRAFTIT_MODEL, res.usage);
  const out = res.parsed_output;
  if (!out) throw new Error(`No profile (stop_reason: ${res.stop_reason})`);
  const profile: Profile = {
    name: cleanText(out.name),
    summary: cleanText(out.summary),
    icp: cleanText(`Buyer: ${out.buyer}\nSize: ${out.size}\nSignals they need it now:\n${out.signals.map((s) => `- ${s}`).join("\n")}`),
  };
  emit({ type: "profile", domain, profile });
  return { domain, profile };
}

// ---------- Search loop shared by find and research ----------

// Structured output alongside a server tool: the model searches, then calls a custom submit tool.
// Forced tool_choice is rejected by current models, so the prompt asks for the call instead.
async function searchThenSubmit<T>(opts: {
  step: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxSearches: number;
  signal?: AbortSignal;
  // Returns a complaint to send back once, or null when the submission is acceptable.
  check?: (out: T, urls: Set<string>) => string | null;
}): Promise<{ out: T | null; urls: Set<string> }> {
  const submit: Anthropic.Tool = {
    name: "submit",
    description: "Submit your final answer. Call exactly once, at the end.",
    input_schema: { ...z.toJSONSchema(opts.schema), type: "object" },
  };
  const urls = new Set<string>();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: opts.prompt }];
  let complained = false;
  let last: T | null = null;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await anthropic().messages.create(
      {
        model: env.DRAFTIT_MODEL,
        max_tokens: 8000,
        output_config: { effort: "medium" },
        system: opts.system,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: opts.maxSearches }, submit],
        messages,
      },
      { signal: opts.signal },
    );
    logUsage(`${opts.step} round ${round + 1}`, env.DRAFTIT_MODEL, res.usage);
    for (const u of retrievedUrls(res.content)) urls.add(u);
    messages.push({ role: "assistant", content: res.content });

    const call = res.content.find((b) => b.type === "tool_use" && b.name === submit.name);
    if (call?.type === "tool_use") {
      const parsed = opts.schema.safeParse(call.input);
      const complaint = !parsed.success ? `Invalid input: ${parsed.error.message}` : (opts.check?.(parsed.data, urls) ?? null);
      if (parsed.success) last = parsed.data;
      if (!complaint || complained) return { out: last, urls };
      complained = true;
      messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: call.id, is_error: true, content: complaint }] });
      continue;
    }
    if (res.stop_reason === "refusal") break;
    // pause_turn means the server paused a long search; resending the same turn resumes it.
    if (res.stop_reason !== "pause_turn") messages.push({ role: "user", content: "Call submit now with what you found." });
  }
  return { out: last, urls };
}

// ---------- 2. Find ----------

const FindOutput = z.object({
  companies: z.array(
    z.object({
      name: z.string(),
      domain: z.string().describe("The company's own website domain, e.g. acme.com."),
      fit: z.string().describe("One sentence: why this company matches the ICP, based on what you found."),
    }),
  ),
});

async function find(domain: string, profile: Profile, signal?: AbortSignal) {
  const { out } = await searchThenSubmit({
    step: "find",
    signal,
    schema: FindOutput,
    maxSearches: FIND_SEARCHES,
    system: `You build outbound prospect lists. You find companies that would BUY a product, never companies that sell something similar. ${HOUSE_STYLE}`,
    prompt: `Today is ${today()}.

The product (${domain}):
${profile.summary}

Ideal customer profile:
${profile.icp}

Use at most ${FIND_SEARCHES} web searches to find 15 real companies that would pay for this product.

Rules:
- Buyers only. Exclude competitors, companies selling a similar or overlapping product, agencies, resellers and integration partners.
- Search for evidence of the buying signals (job posts, launches, funding news, engineering blog posts), not for "best tools" lists, which return competitors.
- Each must be an operating company with its own website domain. No directories, review sites, news sites, listicles or social profiles.
- Prefer small and mid-size companies a small team could realistically reach, not household-name enterprises.
- Skip companies that publicly already use this product (customer stories, "powered by" notes, open source code that depends on it).

Then call submit with each company's name, its own domain and a one-sentence fit reason.`,
  });
  if (!out) throw new Error("Find step did not submit companies");
  return cleanTargets(
    out.companies.map((c) => ({ name: cleanText(c.name), domain: c.domain, fit: cleanText(c.fit) })),
    domain,
    TARGETS,
  );
}

// ---------- 3. Research ----------

const ResearchOutput = z.object({
  signal: z
    .object({
      kind: z.enum(["hiring", "funding", "launch", "expansion", "tech change", "other"]),
      summary: z.string().describe("One factual sentence about what the company did, company-level, no people's names."),
      date: z.string().describe("When it happened, e.g. 2026-08 or Aug 2026."),
      source_url: z.string().describe("Copied exactly from one of your search results."),
    })
    .nullable()
    .describe("Null when you found nothing recent and concrete."),
});

async function research(target: Candidate, profile: Profile, signal?: AbortSignal) {
  let rejectedUrl: string | undefined;
  const { out, urls } = await searchThenSubmit({
    step: `research ${target.domain}`,
    signal,
    schema: ResearchOutput,
    maxSearches: RESEARCH_SEARCHES,
    system: `You research one company for a sales team and report one verifiable fact. Only report what a search result actually says. ${HOUSE_STYLE}`,
    prompt: `Today is ${today()}.

Company: ${target.name} (${target.domain})
We sell: ${profile.summary}

Use at most ${RESEARCH_SEARCHES} web searches to find one concrete, recent event (within the last 12 months) at this company that suggests they could need what we sell now: a relevant job post, a funding round, a product launch, an expansion, or a change in their tech stack.

A good signal connects to what we sell. A routine patch release, a minor version bump or a generic blog post is not a signal.
Prefer the company's own site (blog, careers, changelog) or a news article about it over data aggregators. The source_url must be copied exactly from one of your search results. If you find nothing recent and concrete about this exact company, submit signal: null. Do not stretch an old or unrelated result into a signal.

Then call submit.`,
    check: (o, seen) => {
      if (!o.signal || verifySignal(o.signal.source_url, seen) === "verified") return null;
      rejectedUrl = o.signal.source_url;
      return "That source_url was not returned by any of your searches. Resubmit with a URL copied exactly from your search results, or submit signal: null.";
    },
  });
  const s = out?.signal ?? null;
  const check = verifySignal(s?.source_url, urls);
  // A signal that only passed after the retry is fine; one that never passed, or was withdrawn, counts as dropped.
  return { signal: check === "verified" ? s : null, droppedUrl: check === "unverified" ? s!.source_url : check === "none" ? rejectedUrl : undefined };
}

// ---------- 4. Write ----------

const EmailOutput = z.object({
  subject: z.string().describe("Two to six words, plain, no clickbait."),
  body: z.string().describe(`The email body, under ${MAX_WORDS} words, plain text.`),
});

async function write(target: Candidate, s: Signal | null, profile: Profile, voice: string, signal?: AbortSignal) {
  const system = `You write first-touch cold emails for ${profile.name}. You write like a thoughtful founder, not a marketer.
${voice ? `
The sender pasted samples of their own writing below. Write the way they write: their greeting style, capitalization, sentence length, rhythm and directness. If they write short and casual, so do you. Do not reuse their content or facts.
<voice_samples>
${voice}
</voice_samples>
` : ""}
Rules (these win over the samples):
- Body under ${MAX_WORDS} words. Aim for 60 to 90.
- Address it to the ${target.name} team or to a role, in the sender's greeting style. ${HOUSE_STYLE}
- Plain and specific. No hype, no flattery, no congratulations, no exclamation marks, no buzzwords, no "I hope this finds you well", no "I'm writing because".
- No fake personalization: never claim you read, loved or follow anything. Only reference the fact you are given.
- If a recent event is given, open with it plainly as the reason for writing, then connect it to the problem the product solves. Do not add details beyond it.
- If no event is given, write from fit alone. Do not invent a trigger or imply you know something recent.
- Say what the product does for them in one or two sentences, not a feature list.
- End with exactly one low-friction question. Not two options.
- Sign off with "[Your name]" on its own line.`;
  const prompt = `What we sell: ${profile.summary}

Recipient company: ${target.name} (${target.domain})
Why they fit: ${target.fit}
${s ? `Recent event (${s.date}): ${s.summary}` : "Recent event: none found. Write from fit alone."}`;

  let note = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await anthropic().messages.parse(
      {
        model: env.DRAFTIT_MODEL,
        max_tokens: 2000,
        output_config: { effort: "low", format: zodOutputFormat(EmailOutput) },
        system,
        messages: [{ role: "user", content: prompt + note }],
      },
      { signal },
    );
    logUsage(`write ${target.domain}`, env.DRAFTIT_MODEL, res.usage);
    const out = res.parsed_output;
    if (!out) continue;
    const email = { subject: cleanText(out.subject), body: cleanText(out.body) };
    if (wordCount(email.body) < MAX_WORDS || attempt === 1) return email;
    note = `\n\nYour last draft was ${wordCount(email.body)} words. Cut it well under ${MAX_WORDS}.`;
  }
  throw new Error(`No email for ${target.domain}`);
}

// ---------- Run ----------

async function eachLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]!);
  }));
}

export async function run(input: { domain: string; profile: Profile; voice: string }, emit: Emit, signal?: AbortSignal): Promise<Prospect[]> {
  const { profile, voice } = input;
  const domain = parseSiteUrl(input.domain).hostname.replace(/^www\./, "");
  emit({ type: "step", message: "Searching for companies that would buy this..." });
  const { kept, rejected } = await find(domain, profile, signal);
  if (kept.length === 0) throw new Error("Find step returned no usable companies");
  emit({ type: "companies", companies: kept, rejected });

  const stats: Stats = { verified: 0, dropped: 0, none: 0, failed: 0 };
  const prospects: Prospect[] = [];
  await eachLimit(kept, CONCURRENCY, async (target) => {
    if (signal?.aborted) return;
    try {
      emit({ type: "company", domain: target.domain, status: "searching", message: "Searching for a recent signal..." });
      const r = await research(target, profile, signal);
      let found: Signal | null = null;
      if (r.signal) {
        found = { kind: r.signal.kind, summary: cleanText(r.signal.summary), date: cleanText(r.signal.date), url: r.signal.source_url };
        emit({ type: "company", domain: target.domain, status: "signal", message: `Signal found: ${found.summary}`, url: found.url });
      } else if (r.droppedUrl) {
        emit({ type: "company", domain: target.domain, status: "unverified", message: "Dropped a signal: its source was not in the search results", url: r.droppedUrl });
      } else {
        emit({ type: "company", domain: target.domain, status: "none", message: "No recent signal found" });
      }
      emit({ type: "company", domain: target.domain, status: "drafting", message: found ? "Drafting email..." : "Drafting fit-only email..." });
      const email = await write(target, found, profile, voice, signal);
      const signalStatus = found ? "verified" : r.droppedUrl ? "dropped" : "none";
      stats[signalStatus]++;
      const prospect: Prospect = { ...target, signal: found, signalStatus, email };
      prospects.push(prospect);
      emit({ type: "prospect", prospect });
    } catch (err) {
      if (signal?.aborted) return;
      stats.failed++;
      console.error(`research failed for ${target.domain}`, err);
      emit({ type: "company", domain: target.domain, status: "failed", message: "Could not research this company" });
    }
  });
  emit({ type: "done", stats });
  return prospects;
}
