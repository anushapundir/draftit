import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { totals } from "../lib/cost";
import { hasAgentKey } from "../lib/env";
import { run, understand, type PipelineEvent } from "../lib/pipeline";
import { InputError } from "../lib/site";

const [input, voiceFlag, voicePath] = process.argv.slice(2);
if (!input) {
  console.error("Usage: npm run draft -- <your site url> [--voice samples.txt]");
  process.exit(1);
}
if (!hasAgentKey) {
  console.error("Needs ANTHROPIC_API_KEY. Add it to .env.");
  process.exit(1);
}
const voice = voiceFlag === "--voice" && voicePath ? readFileSync(voicePath, "utf8").slice(0, 6000) : "";

const started = Date.now();
const events: { t: number; event: PipelineEvent }[] = [];
const emit = (event: PipelineEvent) => {
  events.push({ t: Date.now() - started, event });
  const line =
    event.type === "step" ? event.message
    : event.type === "profile" ? `\n${event.profile.name}\n${event.profile.summary}\n\n${event.profile.icp}\n`
    : event.type === "companies" ? `Found ${event.companies.length} companies (${event.rejected.length} rejected)\n${event.companies.map((c) => `  ${c.name} (${c.domain}): ${c.fit}`).join("\n")}\n${event.rejected.map((r) => `  x ${r.name} (${r.domain}): ${r.reason}`).join("\n")}`
    : event.type === "company" ? `[${event.domain}] ${event.message}${event.url ? ` (${event.url})` : ""}`
    : event.type === "prospect" ? `\n--- ${event.prospect.name} [${event.prospect.signalStatus}]\nSubject: ${event.prospect.email.subject}\n${event.prospect.email.body}\n`
    : event.type === "done" ? `Done: ${JSON.stringify(event.stats)}`
    : event.message;
  console.log(line);
};

try {
  const { domain, profile } = await understand(input, emit);
  const prospects = await run({ domain, profile, voice }, emit);
  const durationMs = Date.now() - started;
  const file = `runs/${domain}.json`;
  mkdirSync("runs", { recursive: true });
  writeFileSync(file, JSON.stringify({ domain, recordedAt: new Date().toISOString(), durationMs, costUsd: Number(totals.usd.toFixed(4)), searches: totals.searches, events, profile, prospects }, null, 2));
  console.log(`\n${prospects.length} prospects in ${(durationMs / 1000).toFixed(0)}s, ${totals.searches} searches, ~$${totals.usd.toFixed(2)}. Wrote ${file}`);
} catch (err) {
  console.error(err instanceof InputError ? err.message : err);
  process.exit(1);
}
